<?php
/**
 * Image Cache Handler
 * 
 * Downloads and caches images locally, or serves from cache if available
 */

// Clean any previous output
while (ob_get_level()) ob_end_clean();

// Start output buffering to catch any errors
ob_start();

// Log errors to a file instead of outputting them
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/cache/error.log');
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$imageUrl = $input['imageUrl'] ?? null;
$modelId = $input['modelId'] ?? null;

if (!$imageUrl) {
  ob_end_clean();
  echo json_encode(['error' => 'No image URL provided']);
  exit;
}

// Create cache directories if they don't exist
$cacheDir = __DIR__ . '/../cache/images';
$downloadsDir = __DIR__ . '/../cache/downloads';
if (!file_exists($cacheDir)) {
  mkdir($cacheDir, 0755, true);
}
if (!file_exists($downloadsDir)) {
  mkdir($downloadsDir, 0755, true);
}

// Load cache index
$indexFile = $cacheDir . '/index.json';
$cacheIndex = [];
if (file_exists($indexFile)) {
  $cacheIndex = json_decode(file_get_contents($indexFile), true) ?: [];
}

// Generate a filename from the URL (use the UUID from Civitai URLs)
// Example: https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/e183d27c-d640-4dfa-8e03-e12637d50367/original=true
preg_match('/\/([a-f0-9\-]{36})\//i', $imageUrl, $matches);
if (!$matches) {
  // If no UUID found, hash the URL
  $filename = md5($imageUrl);
} else {
  $filename = $matches[1];
}

// Detect file extension from URL
$extension = 'jpg'; // default
if (preg_match('/\.(jpe?g|png|webp|gif)($|\?)/i', $imageUrl, $extMatch)) {
  $extension = strtolower($extMatch[1]);
  if ($extension === 'jpeg') $extension = 'jpg';
}

$downloadPath = $downloadsDir . '/' . $filename . '.' . $extension;
$cachedFilePath = $cacheDir . '/' . $filename . '.' . $extension;
$cachedFileUrl = 'cache/images/' . $filename . '.' . $extension;

// Get the download flag
$download = $input['download'] ?? false;

// Check if already cached (in final location)
if (file_exists($cachedFilePath)) {
  ob_end_clean();
  echo json_encode([
    'cached' => true,
    'localUrl' => $cachedFileUrl,
    'filename' => $filename . '.' . $extension
  ]);
  exit;
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
curl_close($ch);

if ($imageData && $httpCode === 200) {
  // Step 1: Save to downloads folder
  file_put_contents($downloadPath, $imageData);
  $originalSize = strlen($imageData);
  
  // Step 2: Optimize from downloads to images folder
  $optimized = optimizeAndMove($downloadPath, $cachedFilePath, $extension);
  
  // Step 3: Delete the original download
  if (file_exists($downloadPath)) {
    @unlink($downloadPath);
  }
  
  $finalSize = file_exists($cachedFilePath) ? filesize($cachedFilePath) : $originalSize;
  
  // Update cache index if modelId provided
  if ($modelId) {
    $cacheIndex[$filename . '.' . $extension] = $modelId;
    file_put_contents($indexFile, json_encode($cacheIndex, JSON_PRETTY_PRINT));
  }
  
  // Clear output buffer and send JSON
  ob_end_clean();
  echo json_encode([
    'cached' => false,
    'downloaded' => true,
    'localUrl' => $cachedFileUrl,
    'filename' => $filename . '.' . $extension,
    'originalSize' => $originalSize,
    'optimizedSize' => $finalSize,
    'optimized' => $optimized
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
 * Optimize an image from source to destination
 * Max dimension: 450px, JPEG quality: 50
 * If optimization fails, copies original to destination
 * Returns true if optimization succeeded, false if copied original
 */
function optimizeAndMove($sourcePath, $destPath, $extension) {
  $logFile = __DIR__ . '/../cache/optimization.log';
  
  try {
    file_put_contents($logFile, date('Y-m-d H:i:s') . " - Starting Python optimization for $sourcePath\n", FILE_APPEND);
    
    // Use Python script for optimization
    $pythonScript = __DIR__ . '/../../python/optimize_image.py';
    $command = sprintf(
      'python %s %s %s 450 50 2>&1',
      escapeshellarg($pythonScript),
      escapeshellarg($sourcePath),
      escapeshellarg($destPath)
    );
    
    file_put_contents($logFile, date('Y-m-d H:i:s') . " - Running: $command\n", FILE_APPEND);
    
    $output = shell_exec($command);
    $output = trim($output);
    
    file_put_contents($logFile, date('Y-m-d H:i:s') . " - Python output: $output\n", FILE_APPEND);
    
    // Check if optimization succeeded
    if ($output === 'SUCCESS' && file_exists($destPath)) {
      file_put_contents($logFile, date('Y-m-d H:i:s') . " - Optimization complete\n\n", FILE_APPEND);
      return true;
    } else {
      file_put_contents($logFile, date('Y-m-d H:i:s') . " - Optimization failed, copying original\n\n", FILE_APPEND);
      copy($sourcePath, $destPath);
      return false;
    }
  } catch (Exception $e) {
    // Silently fail and copy original
    if (file_exists($sourcePath) && !file_exists($destPath)) {
      copy($sourcePath, $destPath);
    }
    return false;
  }
}
