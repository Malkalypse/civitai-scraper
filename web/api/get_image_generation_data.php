<?php
/**
 * Get Image Generation Data
 *
 * Fetches generation metadata for a Civitai image and formats a COPY ALL style text block.
 */

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

function splitCopyAllText(string $copyAllText): array {
  $text = trim($copyAllText);
  if ($text === '') {
    return ['promptText' => '', 'paramsText' => ''];
  }

  $parts = preg_split("/\R\R+/", $text);
  if (!is_array($parts) || count($parts) === 0) {
    return ['promptText' => $text, 'paramsText' => ''];
  }

  $lastPart = trim((string)$parts[count($parts) - 1]);
  $looksLikeParams = preg_match('/(?:^|[\r\n,]\s*)[A-Za-z][A-Za-z0-9 _-]*\s*:\s*[^,\r\n]+/', $lastPart) === 1;

  if (!$looksLikeParams) {
    return ['promptText' => $text, 'paramsText' => ''];
  }

  array_pop($parts);
  $promptText = trim(implode("\n\n", $parts));
  return [
    'promptText' => $promptText,
    'paramsText' => $lastPart
  ];
}

function normalizeParamsText(string $paramsText): string {
  $text = trim($paramsText);
  if ($text === '') {
    return '';
  }

  if (strpos($text, "\n") !== false || strpos($text, "\r") !== false) {
    return $text;
  }

  $parts = preg_split('/,\s*(?=[A-Za-z][A-Za-z0-9 _-]*\s*:)/', $text);
  if (!is_array($parts) || count($parts) <= 1) {
    return $text;
  }

  $parts = array_map('trim', $parts);
  $parts = array_filter($parts, static function($value) {
    return $value !== '';
  });

  return implode("\n", $parts);
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

  $paramsText = implode("\n", $fields);
  $copyAllText = $prompt;
  if ($copyAllText !== '' && $paramsText !== '') {
    $copyAllText .= "\n\n" . $paramsText;
  } elseif ($copyAllText === '') {
    $copyAllText = $paramsText;
  }

  return [
    'promptText' => $prompt,
    'paramsText' => $paramsText,
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

function isWorkflowNull(array $payload): bool {
  return array_key_exists('workflow', $payload) && $payload['workflow'] === null;
}

function isWorkflowPresent(array $payload): bool {
  if (!array_key_exists('workflow', $payload)) {
    return false;
  }

  $value = $payload['workflow'];
  if ($value === null) {
    return false;
  }

  if ($value === true) {
    return true;
  }

  if (is_string($value)) {
    return trim($value) !== '';
  }

  if (is_int($value) || is_float($value)) {
    return true;
  }

  return false;
}

function extractWorkflowId(array $payload): string {
  if (!array_key_exists('workflow', $payload)) {
    return '';
  }

  $value = $payload['workflow'];
  if (!is_string($value)) {
    return '';
  }

  return trim($value);
}

function extractWorkflowRevision(array $payload): string {
  if (!array_key_exists('version', $payload)) {
    return '';
  }

  $value = $payload['version'];
  if ($value === null) {
    return '';
  }

  $text = trim((string)$value);
  return $text;
}

try {
  $cacheDir = __DIR__ . '/../cache/image_generation';
  if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
  }

  $cacheFile = $cacheDir . '/' . $imageId . '.json';

  // If a cache file exists and already has generation text, serve it immediately.
  // Workflow/favorite-only metadata files should not block prompt/params hydration.
  if (is_file($cacheFile)) {
    $cachedRaw = file_get_contents($cacheFile);
    if ($cachedRaw !== false) {
      $cached = json_decode($cachedRaw, true);
      if (is_array($cached)) {
        $cachedPrompt = isset($cached['promptText']) ? (string)$cached['promptText'] : '';
        $cachedParams = isset($cached['paramsText']) ? (string)$cached['paramsText'] : '';
        $cachedCopyAll = isset($cached['copyAllText']) ? (string)$cached['copyAllText'] : '';

        if (($cachedPrompt === '' && $cachedParams === '') && $cachedCopyAll !== '') {
          $split = splitCopyAllText($cachedCopyAll);
          $cachedPrompt = $split['promptText'];
          $cachedParams = $split['paramsText'];
        }

        $cachedParams = normalizeParamsText($cachedParams);
        $hasGenerationText = trim($cachedPrompt) !== '' || trim($cachedParams) !== '' || trim($cachedCopyAll) !== '';
        $cachedFavorite = normalizeFavoriteValue($cached['Favorite'] ?? false);

        $needsMetadataUpdate = false;
        if ($inputModelId !== '' && empty($cached['modelId'])) {
          $cached['modelId'] = $inputModelId;
          $needsMetadataUpdate = true;
        }
        if ($inputModelVersionId !== '' && empty($cached['modelVersionId'])) {
          $cached['modelVersionId'] = $inputModelVersionId;
          $needsMetadataUpdate = true;
        }
        if ($inputImageFilename !== '' && empty($cached['imageFilename'])) {
          $cached['imageFilename'] = $inputImageFilename;
          $needsMetadataUpdate = true;
        }
        if ($needsMetadataUpdate) {
          if (isset($cached['sourceUrl'])) {
            unset($cached['sourceUrl']);
          }
          $cached['updatedAt'] = date('c');
          @file_put_contents($cacheFile, json_encode($cached));
        }

        if ($cachedCopyAll === '') {
          $cachedCopyAll = $cachedPrompt;
          if ($cachedCopyAll !== '' && $cachedParams !== '') {
            $cachedCopyAll .= "\n\n" . $cachedParams;
          } elseif ($cachedCopyAll === '') {
            $cachedCopyAll = $cachedParams;
          }
        }

        if (!$hasGenerationText) {
          // Keep metadata updates above, but continue to remote fetch to hydrate text fields.
          // Do not return empty prompt/params from cache-only workflow records.
        } else {
          echo json_encode([
            'success' => true,
            'imageId' => $imageId,
            'promptText' => $cachedPrompt,
            'paramsText' => $cachedParams,
            'copyAllText' => $cachedCopyAll,
            'favorite' => $cachedFavorite,
            'workflowPresent' => isWorkflowPresent($cached),
            'workflowNull' => isWorkflowNull($cached),
            'workflowId' => extractWorkflowId($cached),
            'workflowRevision' => extractWorkflowRevision($cached),
            'cached' => true
          ]);
          exit;
        }
      }
    }
  }

  $trpcInput = json_encode(['json' => ['id' => $imageId]]);
  $trpcUrl = 'https://civitai.com/api/trpc/image.getGenerationData?input=' . urlencode($trpcInput);

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
    echo json_encode([
      'success' => false,
      'error' => 'Failed to fetch generation data',
      'httpCode' => $httpCode
    ]);
    exit;
  }

  $data = json_decode($response, true);
  $jsonRoot = $data['result']['data']['json'] ?? [];
  $meta = $jsonRoot['meta'] ?? null;
  $resources = isset($jsonRoot['resources']) && is_array($jsonRoot['resources']) ? $jsonRoot['resources'] : [];

  $existingForMerge = [];
  if (is_file($cacheFile)) {
    $existingRaw = @file_get_contents($cacheFile);
    if ($existingRaw !== false) {
      $decodedExisting = json_decode($existingRaw, true);
      if (is_array($decodedExisting)) {
        $existingForMerge = $decodedExisting;
      }
    }
  }

  $resolvedModelId = $inputModelId;
  $resolvedModelVersionId = $inputModelVersionId;
  if (count($resources) > 0 && is_array($resources[0])) {
    $firstResource = $resources[0];
    if ($resolvedModelId === '' && isset($firstResource['modelId']) && $firstResource['modelId'] !== null) {
      $resolvedModelId = (string)$firstResource['modelId'];
    }
    if ($resolvedModelVersionId === '' && isset($firstResource['modelVersionId']) && $firstResource['modelVersionId'] !== null) {
      $resolvedModelVersionId = (string)$firstResource['modelVersionId'];
    }
    if ($resolvedModelVersionId === '' && isset($firstResource['versionId']) && $firstResource['versionId'] !== null) {
      $resolvedModelVersionId = (string)$firstResource['versionId'];
    }
  }

  if (!is_array($meta)) {
    $existingFavorite = normalizeFavoriteValue($existingForMerge['Favorite'] ?? false);
    echo json_encode([
      'success' => true,
      'imageId' => $imageId,
      'promptText' => '',
      'paramsText' => '',
      'copyAllText' => '',
      'favorite' => $existingFavorite,
      'workflowPresent' => isWorkflowPresent($existingForMerge),
      'workflowNull' => isWorkflowNull($existingForMerge),
      'workflowId' => extractWorkflowId($existingForMerge),
      'workflowRevision' => extractWorkflowRevision($existingForMerge),
      'cached' => false
    ]);
    exit;
  }

  $parts = composeGenerationParts($meta);
  $parts['paramsText'] = normalizeParamsText($parts['paramsText']);

  $finalPayload = $existingForMerge;
  if (isset($finalPayload['sourceUrl'])) {
    unset($finalPayload['sourceUrl']);
  }
  $favoriteValue = normalizeFavoriteValue($finalPayload['Favorite'] ?? false);
  $finalPayload['imageId'] = $imageId;
  if ($resolvedModelId !== '') {
    $finalPayload['modelId'] = $resolvedModelId;
  }
  if ($resolvedModelVersionId !== '') {
    $finalPayload['modelVersionId'] = $resolvedModelVersionId;
  }
  if ($inputImageFilename !== '') {
    $finalPayload['imageFilename'] = $inputImageFilename;
  }
  $finalPayload['promptText'] = $parts['promptText'];
  $finalPayload['paramsText'] = $parts['paramsText'];
  $finalPayload['copyAllText'] = $parts['copyAllText'];
  $finalPayload['Favorite'] = $favoriteValue;
  $finalPayload['updatedAt'] = date('c');

  @file_put_contents($cacheFile, json_encode($finalPayload));

  echo json_encode([
    'success' => true,
    'imageId' => $imageId,
    'promptText' => $parts['promptText'],
    'paramsText' => $parts['paramsText'],
    'copyAllText' => $parts['copyAllText'],
    'favorite' => $favoriteValue,
    'workflowPresent' => isWorkflowPresent($finalPayload),
    'workflowNull' => isWorkflowNull($finalPayload),
    'workflowId' => extractWorkflowId($finalPayload),
    'workflowRevision' => extractWorkflowRevision($finalPayload),
    'cached' => false
  ]);
} catch (Exception $e) {
  echo json_encode([
    'success' => false,
    'error' => 'Exception: ' . $e->getMessage()
  ]);
}
