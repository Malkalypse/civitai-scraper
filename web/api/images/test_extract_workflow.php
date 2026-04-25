<?php
/**
 * Debug endpoint to test workflow extraction for image 88012188
 */

// Increase limits for image processing
ini_set( 'memory_limit', '512M' );
set_time_limit( 120 );

error_reporting( E_ALL );
ini_set( 'display_errors', '1' );
ini_set( 'log_errors', '1' );

require_once __DIR__ . '/../../config/site.php';

echo "=== Workflow Extraction Debug ===\n\n";
echo "Testing image: https://civitai.red/images/88012188\n";
echo "Full image URL: https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/cf54c0aa-3997-4675-877c-67ea80840f18/original=true/88012188.jpeg\n\n";

$imageId = 88012188;
$imagePageUrl = 'https://civitai.red/images/88012188';
$fullImageUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/cf54c0aa-3997-4675-877c-67ea80840f18/original=true/88012188.jpeg';

// Test fetching the image
echo "Step 1: Fetching image from URL...\n";
$ch = curl_init();
curl_setopt_array($ch, [
  CURLOPT_URL => $fullImageUrl,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_SSL_VERIFYPEER => false,
  CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  CURLOPT_HTTPHEADER => ['Accept: */*']
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

echo "HTTP Code: $httpCode\n";
echo "Response size: " . strlen($response) . " bytes\n";
if ($error) {
  echo "cURL Error: $error\n";
}

if (!$response) {
  echo "Failed to fetch image!\n";
  exit(1);
}

// Check format
$isPng = strlen($response) >= 8 && substr($response, 0, 8) === "\x89PNG\r\n\x1a\n";
$isJpeg = !$isPng && strlen($response) >= 2 && substr($response, 0, 2) === "\xFF\xD8";

echo "Format: " . ($isPng ? 'PNG' : ($isJpeg ? 'JPEG' : 'Unknown')) . "\n\n";

if (!$isJpeg) {
  echo "ERROR: Not a JPEG!\n";
  exit(1);
}

// Try to parse JPEG
echo "Step 2: Parsing JPEG metadata...\n";

// Include dependencies
function extractJpegSegments(string $binary): array {
  $comments = [];
  $app1 = [];

  if (strlen($binary) < 4 || substr($binary, 0, 2) !== "\xFF\xD8") {
    return ['comments' => $comments, 'app1' => $app1];
  }

  $len = strlen($binary);
  $offset = 2;

  while ($offset + 4 <= $len) {
    if (ord($binary[$offset]) !== 0xFF) {
      break;
    }

    while ($offset < $len && ord($binary[$offset]) === 0xFF) {
      $offset++;
    }

    if ($offset >= $len) {
      break;
    }

    $marker = ord($binary[$offset]);
    $offset++;

    if ($marker === 0xDA || $marker === 0xD9) {
      break;
    }

    if ($offset + 2 > $len) {
      break;
    }

    $segmentLength = unpack('n', substr($binary, $offset, 2))[1];
    if ($segmentLength < 2 || $offset + $segmentLength > $len) {
      break;
    }

    $payload = substr($binary, $offset + 2, $segmentLength - 2);

    if ($marker === 0xFE) {
      $comments[] = $payload;
    } elseif ($marker === 0xE1) {
      $app1[] = $payload;
    }

    $offset += $segmentLength;
  }

  return ['comments' => $comments, 'app1' => $app1];
}

try {
  $segments = extractJpegSegments($response);
  echo "Found " . count($segments['comments']) . " comment segments\n";
  echo "Found " . count($segments['app1']) . " APP1 segments\n";
  
  if (count($segments['comments']) > 0) {
    echo "\nComment segments:\n";
    foreach ($segments['comments'] as $i => $comment) {
      echo "  Comment $i: " . substr($comment, 0, 100) . "...\n";
    }
  }
  
  if (count($segments['app1']) > 0) {
    echo "\nAPP1 segments:\n";
    foreach ($segments['app1'] as $i => $app1) {
      $preview = substr($app1, 0, 100);
      echo "  APP1 $i: $preview\n";
    }
  }
} catch (Exception $e) {
  echo "Error: " . $e->getMessage() . "\n";
  exit(1);
}

echo "\nDone!\n";
