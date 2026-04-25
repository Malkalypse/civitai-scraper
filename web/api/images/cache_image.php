<?php
/**
 * Image Cache Handler
 * 
 * Downloads and caches images locally, or serves from cache if available
 */

// Clean any previous output
while (ob_get_level()) ob_end_clean();

require_once __DIR__ . '/../../config/site.php';

// Start output buffering to catch any errors
ob_start();

// Log errors to a file instead of outputting them
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../../cache/error.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$imageUrl = $input['imageUrl'] ?? null;
$lookupUrl = $input['lookupUrl'] ?? null;
$modelId = $input['modelId'] ?? null;
$modelVersionId = $input['versionId'] ?? null;

if (!$imageUrl) {
  ob_end_clean();
  echo json_encode(['error' => 'No image URL provided']);
  exit;
}

/**
 * Normalize Civitai CDN URLs to a 450px optimized variant.
 */
function toCivitaiThumbnailUrl($url, $transform = 'anim=false,width=450,optimized=true') {
  if (!is_string($url) || (stripos($url, SITE_CDN_BASE) === false && stripos($url, SITE_CDN_LEGACY) === false)) {
    return $url;
  }

  // Keep caller-provided optimized transforms (width or height) unchanged.
  if (preg_match('~/anim=false,(?:width|height)=\d+,optimized=true(?=/|$)~i', $url)) {
    return $url;
  }

  $normalized = preg_replace(
    '~/(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)(?=/|$)~i',
    '/' . $transform,
    $url,
    1,
    $replacedCount
  );

  if ($replacedCount > 0 && is_string($normalized)) {
    return $normalized;
  }

  // Legacy CDN URL: extract token from path and build primary CDN URL
  if (stripos($url, SITE_CDN_LEGACY) !== false) {
    $path = substr($url, strlen(SITE_CDN_LEGACY));
    if (preg_match('~^/[^/]+/([^/]+)(?:/(.*))?$~i', $path, $matches)) {
      $token = $matches[1];
      $tail = isset($matches[2]) ? trim($matches[2], '/') : '';
      $newUrl = SITE_CDN_BASE . '/' . SITE_CDN_HASH . '/' . $token . '/' . $transform;
      if ($tail !== '' && stripos($tail, 'original=true') !== 0) {
        $newUrl .= '/' . $tail;
      }
      return $newUrl;
    }
  }

  return $url;
}

$imageUrl = toCivitaiThumbnailUrl($imageUrl, 'anim=false,width=450,optimized=true');

function extractImageIdFromUrl($url) {
  if (!is_string($url) || $url === '') {
    return null;
  }

  if (preg_match('~/(\d+)\.(?:jpe?g|png|webp|gif|avif|mp4|webm)(?:[?#].*)?$~i', $url, $matches)) {
    return (int)$matches[1];
  }

  if (preg_match('~(?:^|/)images/(\d+)(?:[/?#].*)?$~i', $url, $matches)) {
    return (int)$matches[1];
  }

  return null;
}

function resolveCachedImageFromMetadata($imageId, $cacheDir) {
  if (!is_numeric($imageId) || (int)$imageId <= 0 || !is_string($cacheDir) || $cacheDir === '') {
    return null;
  }

  $imageId = (int)$imageId;
  $metadataPath = __DIR__ . '/../../cache/image_generation/' . $imageId . '.json';
  if (!is_file($metadataPath)) {
    return null;
  }

  $raw = @file_get_contents($metadataPath);
  if ($raw === false) {
    return null;
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    return null;
  }

  $imageFilename = isset($decoded['imageFilename']) ? trim((string)$decoded['imageFilename']) : '';
  if ($imageFilename === '') {
    return null;
  }

  $safeFilename = basename($imageFilename);
  if ($safeFilename === '' || $safeFilename === '.' || $safeFilename === '..') {
    return null;
  }

  $candidatePath = $cacheDir . '/' . $safeFilename;
  if (!is_file($candidatePath)) {
    return null;
  }

  return [
    'path' => $candidatePath,
    'filename' => $safeFilename,
    'url' => 'cache/images/' . $safeFilename
  ];
}

function upsertImageGenerationMetadata($imageId, $payload) {
  if (!is_numeric($imageId) || (int)$imageId <= 0 || !is_array($payload)) {
    return;
  }

  $imageId = (int)$imageId;
  $generationDir = __DIR__ . '/../../cache/image_generation';
  if (!is_dir($generationDir)) {
    @mkdir($generationDir, 0755, true);
  }

  $filePath = $generationDir . '/' . $imageId . '.json';
  $existing = [];
  if (is_file($filePath)) {
    $raw = @file_get_contents($filePath);
    if ($raw !== false) {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) {
        $existing = $decoded;
      }
    }
  }

  $merged = $existing;
  if (isset($merged['sourceUrl'])) {
    unset($merged['sourceUrl']);
  }
  $merged['imageId'] = $imageId;
  foreach ($payload as $key => $value) {
    if ($value === null || $value === '') {
      continue;
    }
    $merged[$key] = $value;
  }
  $merged['updatedAt'] = date('c');

  @file_put_contents($filePath, json_encode($merged));
}

$imageId = extractImageIdFromUrl($imageUrl);
if (!$imageId && is_string($lookupUrl) && $lookupUrl !== '') {
  $imageId = extractImageIdFromUrl($lookupUrl);
}

// Create cache directories if they don't exist
$cacheDir = __DIR__ . '/../../cache/images';
if (!file_exists($cacheDir)) {
  mkdir($cacheDir, 0755, true);
}

// Fast path: if metadata already knows the cached local filename for this image ID,
// return it immediately and avoid URL-hash mismatch misses.
if ($imageId) {
  $metadataCached = resolveCachedImageFromMetadata($imageId, $cacheDir);
  if (is_array($metadataCached)) {
    ob_end_clean();
    echo json_encode([
      'cached' => true,
      'localUrl' => $metadataCached['url'],
      'filename' => $metadataCached['filename'],
      'imageId' => $imageId
    ]);
    exit;
  }
}

// Generate a filename from the URL (use the UUID from Civitai URLs)
// Example: https://image.civitai.red/xG1nkqKTMzGDvpLrqFT7WA/e183d27c-d640-4dfa-8e03-e12637d50367/original=true
preg_match('/\/([a-f0-9\-]{36})\//i', $imageUrl, $matches);
if (!$matches) {
  // If no UUID found, hash the URL
  $baseName = md5($imageUrl);
} else {
  // Include URL hash so different transforms (and legacy original=true URLs) don't collide.
  $baseName = $matches[1] . '-' . substr(md5($imageUrl), 0, 10);
}

$filename = ($imageId && $imageId > 0)
  ? ((int)$imageId . '-' . $baseName)
  : $baseName;

// Detect file extension from URL
$extension = 'jpg'; // default
if (preg_match('/\.(jpe?g|png|webp|gif)($|\?)/i', $imageUrl, $extMatch)) {
  $extension = strtolower($extMatch[1]);
  if ($extension === 'jpeg') $extension = 'jpg';
}

$cachedFilePath = $cacheDir . '/' . $filename . '.' . $extension;
$cachedFileUrl = 'cache/images/' . $filename . '.' . $extension;

// Backward-compatible fallback: older cache entries may exist without imageId prefix.
$legacyFilename = $baseName;
$legacyCachedFilePath = $cacheDir . '/' . $legacyFilename . '.' . $extension;
$legacyCachedFileUrl = 'cache/images/' . $legacyFilename . '.' . $extension;

// Get the download flag
$download = $input['download'] ?? false;

// Check if already cached (in final location)
if (file_exists($cachedFilePath)) {
  $imageSize = @getimagesize($cachedFilePath);
  if (is_array($imageSize) && isset($imageSize[0], $imageSize[1])) {
    $cachedMaxSide = max((int)$imageSize[0], (int)$imageSize[1]);
    if ($cachedMaxSide > 450) {
      @unlink($cachedFilePath);
    }
  }

  if (file_exists($cachedFilePath)) {
    if ($imageId) {
      upsertImageGenerationMetadata($imageId, [
        'modelId' => $modelId,
        'modelVersionId' => $modelVersionId,
        'imageFilename' => $filename . '.' . $extension
      ]);
    }

    ob_end_clean();
    echo json_encode([
      'cached' => true,
      'localUrl' => $cachedFileUrl,
      'filename' => $filename . '.' . $extension,
      'imageId' => $imageId
    ]);
    exit;
  }
}

// Fallback: accept legacy non-prefixed cached filename to avoid cache misses after naming changes.
if (!file_exists($cachedFilePath) && file_exists($legacyCachedFilePath)) {
  $imageSize = @getimagesize($legacyCachedFilePath);
  if (is_array($imageSize) && isset($imageSize[0], $imageSize[1])) {
    $cachedMaxSide = max((int)$imageSize[0], (int)$imageSize[1]);
    if ($cachedMaxSide > 450) {
      @unlink($legacyCachedFilePath);
    }
  }

  if (file_exists($legacyCachedFilePath)) {
    if ($imageId) {
      upsertImageGenerationMetadata($imageId, [
        'modelId' => $modelId,
        'modelVersionId' => $modelVersionId,
        'imageFilename' => $legacyFilename . '.' . $extension
      ]);
    }

    ob_end_clean();
    echo json_encode([
      'cached' => true,
      'localUrl' => $legacyCachedFileUrl,
      'filename' => $legacyFilename . '.' . $extension,
      'imageId' => $imageId
    ]);
    exit;
  }
}

// If not cached and not requesting download, just return remote URL
if (!$download) {
  ob_end_clean();
  echo json_encode([
    'cached' => false,
    'remoteUrl' => $imageUrl
  ]);
  exit;
}

// Download the image (only if download flag is true)
$ch = curl_init();
curl_setopt_array($ch, [
  CURLOPT_URL => $imageUrl,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_TIMEOUT => 10,
  CURLOPT_CONNECTTIMEOUT => 5,
  CURLOPT_SSL_VERIFYPEER => false,
  CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
]);

$imageData = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if ($imageData && $httpCode === 200) {
  $saved = optimizeWithPythonFromBytes($imageData, $cachedFilePath, $extension, 450, 75);
  if (!$saved) {
    $saved = saveResizedImageData($imageData, $cachedFilePath, $extension, 450);
  }
  if (!$saved) {
    file_put_contents($cachedFilePath, $imageData);
  }
  $finalSize = file_exists($cachedFilePath) ? filesize($cachedFilePath) : strlen($imageData);

  if ($imageId) {
    upsertImageGenerationMetadata($imageId, [
      'modelId' => $modelId,
      'modelVersionId' => $modelVersionId,
      'imageFilename' => $filename . '.' . $extension
    ]);
  }
  
  // Clear output buffer and send JSON
  ob_end_clean();
  echo json_encode([
    'cached' => false,
    'downloaded' => true,
    'localUrl' => $cachedFileUrl,
    'filename' => $filename . '.' . $extension,
    'optimizedSize' => $finalSize,
    'sourceUrl' => $imageUrl,
    'imageId' => $imageId
  ]);
} else {
  ob_end_clean();
  echo json_encode([
    'error' => 'Failed to download image',
    'httpCode' => $httpCode,
    'remoteUrl' => $imageUrl
  ]);
}

exit; // Ensure clean exit

/**
 * Optimize image bytes using python/optimize_image.py.
 * Returns true on success.
 */
function optimizeWithPythonFromBytes($imageData, $destPath, $extension, $maxSide = 450, $quality = 75) {
  if (!is_string($imageData) || $imageData === '') {
    return false;
  }

  $tmpSource = tempnam(sys_get_temp_dir(), 'civitai_src_');
  if ($tmpSource === false) {
    return false;
  }

  $tmpSourceWithExt = $tmpSource . '.' . $extension;
  @rename($tmpSource, $tmpSourceWithExt);

  if (file_put_contents($tmpSourceWithExt, $imageData) === false) {
    @unlink($tmpSourceWithExt);
    return false;
  }

  $pythonScript = __DIR__ . '/../../python/optimize_image.py';
  $command = sprintf(
    'python %s %s %s %d %d 2>&1',
    escapeshellarg($pythonScript),
    escapeshellarg($tmpSourceWithExt),
    escapeshellarg($destPath),
    (int)$maxSide,
    (int)$quality
  );

  $output = shell_exec($command);

  @unlink($tmpSourceWithExt);

  if (!is_string($output)) {
    return false;
  }

  return strpos(trim($output), 'SUCCESS') !== false && file_exists($destPath);
}

/**
 * Save image data to disk resized so largest side <= maxSide.
 * Returns true on successful save, false to allow caller fallback.
 */
function saveResizedImageData($imageData, $destPath, $extension, $maxSide = 450) {
  if (!is_string($imageData) || $imageData === '') {
    return false;
  }

  if (!function_exists('imagecreatefromstring')) {
    return false;
  }

  $source = @imagecreatefromstring($imageData);
  if (!$source) {
    return false;
  }

  $srcWidth = imagesx($source);
  $srcHeight = imagesy($source);
  if ($srcWidth <= 0 || $srcHeight <= 0) {
    imagedestroy($source);
    return false;
  }

  $largestSide = max($srcWidth, $srcHeight);
  if ($largestSide <= (int)$maxSide) {
    $savedOriginal = file_put_contents($destPath, $imageData) !== false;
    imagedestroy($source);
    return $savedOriginal;
  }

  $scale = (float)$maxSide / (float)$largestSide;
  $targetWidth = max(1, (int)round($srcWidth * $scale));
  $targetHeight = max(1, (int)round($srcHeight * $scale));

  $target = imagecreatetruecolor($targetWidth, $targetHeight);
  if (!$target) {
    imagedestroy($source);
    return false;
  }

  if ($extension === 'png') {
    imagealphablending($target, false);
    imagesavealpha($target, true);
  }

  $resampled = imagecopyresampled(
    $target,
    $source,
    0,
    0,
    0,
    0,
    $targetWidth,
    $targetHeight,
    $srcWidth,
    $srcHeight
  );

  if (!$resampled) {
    imagedestroy($target);
    imagedestroy($source);
    return false;
  }

  $saved = false;
  if ($extension === 'png') {
    $saved = imagepng($target, $destPath, 6);
  } elseif ($extension === 'webp' && function_exists('imagewebp')) {
    $saved = imagewebp($target, $destPath, 75);
  } elseif ($extension === 'gif') {
    $saved = imagegif($target, $destPath);
  } else {
    $saved = imagejpeg($target, $destPath, 75);
  }

  imagedestroy($target);
  imagedestroy($source);
  return $saved === true;
}
