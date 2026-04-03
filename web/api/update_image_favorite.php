<?php
/**
 * Update Image Favorite flag
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$imageId = isset($input['imageId']) ? (int)$input['imageId'] : 0;
$favoriteInput = $input['favorite'] ?? null;
$modelId = isset($input['modelId']) ? (string)$input['modelId'] : '';
$modelVersionId = isset($input['modelVersionId']) ? (string)$input['modelVersionId'] : '';
$imageFilename = isset($input['imageFilename']) ? trim((string)$input['imageFilename']) : '';

if ($imageId <= 0) {
  echo json_encode(['success' => false, 'error' => 'Missing or invalid imageId']);
  exit;
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

$favorited = normalizeFavoriteValue($favoriteInput);

try {
  $cacheDir = __DIR__ . '/../cache/image_generation';
  if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
  }

  $cacheFile = $cacheDir . '/' . $imageId . '.json';
  $payload = [];

  if (is_file($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    if ($raw !== false) {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) {
        $payload = $decoded;
      }
    }
  }

  $payload['imageId'] = $imageId;
  if ($modelId !== '') {
    $payload['modelId'] = $modelId;
  }
  if ($modelVersionId !== '') {
    $payload['modelVersionId'] = $modelVersionId;
  }
  if ($imageFilename !== '') {
    $payload['imageFilename'] = $imageFilename;
  }
  if (isset($payload['sourceUrl'])) {
    unset($payload['sourceUrl']);
  }

  $payload['Favorite'] = $favorited;
  $payload['updatedAt'] = date('c');

  @file_put_contents($cacheFile, json_encode($payload));

  echo json_encode([
    'success' => true,
    'imageId' => $imageId,
    'favorite' => $favorited
  ]);
} catch (Exception $e) {
  echo json_encode([
    'success' => false,
    'error' => 'Exception: ' . $e->getMessage()
  ]);
}
