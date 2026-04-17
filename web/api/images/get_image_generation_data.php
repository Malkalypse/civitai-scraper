<?php
/**
 * Get Image Generation Data
 *
 * Fetches generation metadata for a Civitai image from database or remote API.
 * Formats a COPY ALL style text block.
 */

require_once __DIR__ . '/../api_utils.php';
header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$imageId = isset($input['imageId']) ? (int)$input['imageId'] : 0;
$inputModelId = isset($input['modelId']) ? (string)$input['modelId'] : '';
$inputModelVersionId = isset($input['modelVersionId']) ? (string)$input['modelVersionId'] : '';
$inputImageFilename = isset($input['imageFilename']) ? trim((string)$input['imageFilename']) : '';

if ($imageId <= 0) {
  echo json_encode(['success' => false, 'error' => 'Missing or invalid imageId']);
  exit;
}

function extractPromptTextFromCopyAll(string $copyAllText): string {
  $text = trim($copyAllText);
  if ($text === '') {
    return '';
  }

  $parts = preg_split("/\R\R+/", $text);
  if (!is_array($parts) || count($parts) === 0) {
    return $text;
  }

  $lastPart = trim((string)$parts[count($parts) - 1]);
  $looksLikeParams = preg_match('/(?:^|[\r\n,]\s*)[A-Za-z][A-Za-z0-9 _-]*\s*:\s*[^,\r\n]+/', $lastPart) === 1;

  if (!$looksLikeParams) {
    return $text;
  }

  array_pop($parts);
  return trim(implode("\n\n", $parts));
}

function composeGenerationParts(array $meta): array {
  $prompt = isset($meta['prompt']) ? trim((string)$meta['prompt']) : '';
  $fields = [];

  if (isset($meta['steps']) && $meta['steps'] !== '') {
    $fields[] = 'Steps: ' . $meta['steps'];
  }

  if (isset($meta['sampler']) && trim((string)$meta['sampler']) !== '') {
    $fields[] = 'Sampler: ' . trim((string)$meta['sampler']);
  }

  if (isset($meta['seed']) && $meta['seed'] !== '') {
    $fields[] = 'Seed: ' . $meta['seed'];
  }

  $vae = '';
  if (isset($meta['VAE']) && trim((string)$meta['VAE']) !== '') {
    $vae = trim((string)$meta['VAE']);
  } elseif (isset($meta['vae']) && trim((string)$meta['vae']) !== '') {
    $vae = trim((string)$meta['vae']);
  }
  if ($vae !== '') {
    $fields[] = 'VAE: ' . $vae;
  }

  $generationDetails = implode("\n", $fields);
  $copyAllText = $prompt;
  if ($copyAllText !== '' && $generationDetails !== '') {
    $copyAllText .= "\n\n" . $generationDetails;
  } elseif ($copyAllText === '') {
    $copyAllText = $generationDetails;
  }

  return [
    'promptText' => $prompt,
    'copyAllText' => $copyAllText
  ];
}

function normalizeFavoriteValue($value): bool {
  if (is_bool($value)) {
    return $value;
  }
  if (is_numeric($value)) {
    return ((int)$value) === 1;
  }
  if (is_string($value)) {
    $trimmed = strtolower(trim($value));
    return in_array($trimmed, ['1', 'true', 'yes', 'y', 'on'], true);
  }
  return false;
}

function normalizeWorkflowHashFromDb($value): ?string {
  if ($value === null) {
    return '';
  }

  $text = trim((string)$value);
  if ($text === '-1') {
    return null;
  }

  return $text;
}

function sendResponse($success, $imageId, $promptText = '', $copyAllText = '', $favorite = false, $workflowHash = '', $cached = true) {
  $normalizedWorkflowHash = normalizeWorkflowHashFromDb($workflowHash);
  $workflowPresent = is_string($normalizedWorkflowHash) && $normalizedWorkflowHash !== '';
  
  echo json_encode([
    'success' => $success,
    'imageId' => $imageId,
    'promptText' => $promptText,
    'copyAllText' => $copyAllText,
    'favorite' => $favorite,
    'workflowHash' => $normalizedWorkflowHash ?? '',
    'workflowPresent' => $workflowPresent,
    'workflowNull' => $normalizedWorkflowHash === null,
    'cached' => $cached
  ]);
}

try {
  $db = api_db_connect();
  if ($db->connect_error) {
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
  }
  $db->set_charset('utf8mb4');

  // Try to read from database first
  $dbPromptText = '';
  $dbCopyAllText = '';
  $dbFavorite = false;
  $dbWorkflowHash = '';
  $dbModelVersionId = 0;
  $dbModelId = 0;
  $imageExists = false;

  $sql = 'SELECT prompt_text, copy_all_text, favorite, workflow_hash, model_version_id, model_id FROM images WHERE image_id = ? LIMIT 1';
  $stmt = $db->prepare($sql);
  if ($stmt) {
    $stmt->bind_param('i', $imageId);
    $stmt->execute();
    $result = $stmt->get_result();
    if ($result && ($row = $result->fetch_assoc())) {
      $imageExists = true;
      $dbPromptText = (string)($row['prompt_text'] ?? '');
      $dbCopyAllText = (string)($row['copy_all_text'] ?? '');
      $dbFavorite = (bool)($row['favorite'] ?? false);
      $dbWorkflowHash = $row['workflow_hash'] ?? '';
      $dbModelVersionId = (int)($row['model_version_id'] ?? 0);
      $dbModelId = (int)($row['model_id'] ?? 0);
    }
    $stmt->close();
  }

  // If we have cached generation text in the database, return it immediately
  $hasGenerationText = (trim($dbPromptText) !== '' || trim($dbCopyAllText) !== '');
  
  if ($imageExists && $hasGenerationText) {
    $db->close();
    sendResponse(true, $imageId, $dbPromptText, $dbCopyAllText, $dbFavorite, $dbWorkflowHash, true);
    exit;
  }

  // Fetch from Civitai API
  $trpcInput = json_encode(['json' => ['id' => $imageId]]);
  $trpcUrl = 'https://civitai.red/api/trpc/image.getGenerationData?input=' . urlencode($trpcInput);

  $ch = curl_init();
  curl_setopt_array($ch, [
    CURLOPT_URL => $trpcUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    CURLOPT_HTTPHEADER => [
      'Accept: application/json'
    ]
  ]);

  $response = curl_exec($ch);
  $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if (!$response || $httpCode !== 200) {
    $db->close();
    if ($imageExists) {
      sendResponse(true, $imageId, $dbPromptText, $dbCopyAllText, $dbFavorite, $dbWorkflowHash, true);
    } else {
      sendResponse(false, $imageId);
    }
    exit;
  }

  // Parse API response
  $data = json_decode($response, true);
  $jsonRoot = $data['result']['data']['json'] ?? [];
  $meta = $jsonRoot['meta'] ?? null;
  $resources = isset($jsonRoot['resources']) && is_array($jsonRoot['resources']) ? $jsonRoot['resources'] : [];

  $resolvedModelId = $inputModelId !== '' ? (int)$inputModelId : $dbModelId;
  $resolvedModelVersionId = $inputModelVersionId !== '' ? (int)$inputModelVersionId : $dbModelVersionId;

  // Extract model IDs from API resources if still missing
  if (($resolvedModelId === 0 || $resolvedModelVersionId === 0) && count($resources) > 0 && is_array($resources[0])) {
    $firstResource = $resources[0];
    if ($resolvedModelId === 0 && isset($firstResource['modelId'])) {
      $resolvedModelId = (int)$firstResource['modelId'];
    }
    if ($resolvedModelVersionId === 0 && isset($firstResource['modelVersionId'])) {
      $resolvedModelVersionId = (int)$firstResource['modelVersionId'];
    }
    if ($resolvedModelVersionId === 0 && isset($firstResource['versionId'])) {
      $resolvedModelVersionId = (int)$firstResource['versionId'];
    }
  }

  $promptText = '';
  $copyAllText = '';
  $favorite = $dbFavorite;

  if (!is_array($meta)) {
    $db->close();
    sendResponse(true, $imageId, '', '', $favorite, $dbWorkflowHash, false);
    exit;
  }

  $parts = composeGenerationParts($meta);
  $promptText = $parts['promptText'];
  $copyAllText = $parts['copyAllText'];

  // Update database with fetched generation data
  $imageFilename = $inputImageFilename !== '' ? $inputImageFilename : '';
  $updateSql = 'INSERT INTO images ' .
               '(image_id, model_id, model_version_id, image_filename, prompt_text, copy_all_text, favorite, workflow_hash) ' .
               'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ' .
               'ON DUPLICATE KEY UPDATE ' .
               '  model_id = COALESCE(NULLIF(?, 0), model_id), ' .
               '  model_version_id = COALESCE(NULLIF(?, 0), model_version_id), ' .
               '  image_filename = COALESCE(NULLIF(?, ""), image_filename), ' .
               '  prompt_text = ?, ' .
               '  copy_all_text = ?, ' .
               '  favorite = ?, ' .
               '  updated_at = CURRENT_TIMESTAMP';

  $updateStmt = $db->prepare($updateSql);
  if ($updateStmt) {
    $updateStmt->bind_param('iiissssiiiissi',
      $imageId, $resolvedModelId, $resolvedModelVersionId, $imageFilename,
      $promptText, $copyAllText, $favorite, $dbWorkflowHash,
      $resolvedModelId, $resolvedModelVersionId, $imageFilename,
      $promptText, $copyAllText, $favorite);
    $updateStmt->execute();
    $updateStmt->close();
  }

  $db->close();
  sendResponse(true, $imageId, $promptText, $copyAllText, $favorite, $dbWorkflowHash, false);

} catch (Exception $e) {
  echo json_encode([
    'success' => false,
    'error' => 'Exception: ' . $e->getMessage()
  ]);
}
