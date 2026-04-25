<?php
/**
 * Extract Workflow JSON from full-size PNG metadata
 */

// Increase limits for image processing
ini_set( 'memory_limit', '512M' );
set_time_limit( 120 );

error_reporting( E_ALL );
ini_set( 'display_errors', '0' );

$capturedErrors = [];

set_error_handler(static function( $errno, $errstr, $errfile, $errline ) use (&$capturedErrors) {
  $capturedErrors[] = [ 'number' => $errno, 'message' => $errstr, 'file' => $errfile, 'line' => $errline ];
  return false;
});

require_once __DIR__ . '/../../config/site.php';

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

$input = json_decode(file_get_contents('php://input'), true);
$imageId = isset($input['imageId']) ? (int)$input['imageId'] : 0;
$imagePageUrl = isset($input['imagePageUrl']) ? trim((string)$input['imagePageUrl']) : '';
$fullImageUrlInput = isset($input['fullImageUrl']) ? trim((string)$input['fullImageUrl']) : '';

function fetchUrl(string $url, int $timeout = 20): array {
  $ch = curl_init();
  curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => $timeout,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    CURLOPT_HTTPHEADER => ['Accept: */*']
  ]);

  $body = curl_exec($ch);
  $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $contentType = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  $error = curl_error($ch);

  return [
    'ok' => is_string($body) && $body !== '' && $httpCode >= 200 && $httpCode < 300,
    'body' => is_string($body) ? $body : '',
    'httpCode' => $httpCode,
    'contentType' => $contentType,
    'error' => $error
  ];
}

// Fetch only the first $maxBytes of an image URL using an HTTP Range request.
// PNG tEXt/zTXt/iTXt chunks always precede IDAT, so the first 4MB is more than
// enough to capture any workflow metadata without downloading the entire file.
function fetchImagePartial(string $url, int $maxBytes = 4194304, int $timeout = 30): array {
  $ch = curl_init();
  curl_setopt_array($ch, [
    CURLOPT_URL            => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    CURLOPT_HTTPHEADER     => ['Accept: */*'],
    CURLOPT_RANGE          => '0-' . ($maxBytes - 1),
  ]);

  $body     = curl_exec($ch);
  $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $error    = curl_error($ch);
  curl_close($ch);

  // 206 Partial Content is success for range requests; 200 means server ignored Range header
  // and sent the full file — both are usable.
  $ok = is_string($body) && $body !== '' && ($httpCode === 200 || $httpCode === 206);

  return [
    'ok'       => $ok,
    'body'     => is_string($body) ? $body : '',
    'httpCode' => $httpCode,
    'error'    => $error
  ];
}

function toCivitaiOriginalUrl(string $url): string {
  if (stripos($url, SITE_STORAGE_BASE) !== false) {
    $normalizedB2 = preg_replace('~/original=true(?=[/?#]|$)~i', '/original', $url, 1, $replacedB2Count);
    if ($replacedB2Count > 0 && is_string($normalizedB2)) {
      return $normalizedB2;
    }

    return $url;
  }

  if (stripos($url, SITE_CDN_BASE) === false && stripos($url, SITE_CDN_LEGACY) === false) {
    return $url;
  }

  $normalized = preg_replace(
    '~/(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)(?=/|$)~i',
    '/original=true',
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

      if ($tail !== '') {
        $tail = preg_replace('~^(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)/?~i', '', $tail);
        $tail = ltrim((string)$tail, '/');
      }

      $newUrl = SITE_CDN_BASE . '/' . SITE_CDN_HASH . '/' . $token . '/original=true';
      if ($tail !== '') {
        $newUrl .= '/' . $tail;
      }

      return $newUrl;
    }
  }

  return $url;
}

function extractImageIdFromPageUrl(string $url): int {
  if ($url === '') {
    return 0;
  }

  if (preg_match('~(?:^|/)images/(\d+)(?:[/?#].*)?$~i', $url, $matches)) {
    return (int)$matches[1];
  }

  return 0;
}

function resolveImageUrlFromCivitaiById(int $imageId): string {
  if ($imageId <= 0) {
    return '';
  }

  $apiUrl = SITE_URL_API_REST . '/images?imageId=' . $imageId;
  $response = fetchUrl($apiUrl, 20);
  if ($response['ok']) {
    $decoded = json_decode($response['body'], true);
    if (is_array($decoded)) {
      $items = $decoded['items'] ?? null;
      if (is_array($items) && count($items) > 0 && is_array($items[0])) {
        $first = $items[0];
        if (isset($first['url']) && is_string($first['url']) && trim($first['url']) !== '') {
          return toCivitaiOriginalUrl(trim($first['url']));
        }
      }

      if (isset($decoded['url']) && is_string($decoded['url']) && trim($decoded['url']) !== '') {
        return toCivitaiOriginalUrl(trim($decoded['url']));
      }
    }
  }

  // API lookup failed or returned no items — scrape og:image from the image page
  $pageUrl = SITE_URL_IMAGES . '/' . $imageId;
  $pageResponse = fetchUrl($pageUrl, 20);
  if ($pageResponse['ok']) {
    if (preg_match('~<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](https?://[^"\']+)["\']~i', $pageResponse['body'], $m)) {
      return toCivitaiOriginalUrl($m[1]);
    }
    if (preg_match('~<meta[^>]+content=["\'](https?://[^"\']+)["\'][^>]+property=["\']og:image["\']~i', $pageResponse['body'], $m)) {
      return toCivitaiOriginalUrl($m[1]);
    }
  }

  return '';
}

function resolveImageUrlCandidatesFromCivitaiById(int $imageId): array {
  if ($imageId <= 0) {
    return [];
  }

  $candidates = [];
  $pushUnique = static function (string $url) use (&$candidates): void {
    $trimmed = trim($url);
    if ($trimmed === '') {
      return;
    }

    if (!in_array($trimmed, $candidates, true)) {
      $candidates[] = $trimmed;
    }
  };

  // Preferred: tRPC image.get often returns the canonical UUID for the original image.
  $trpcUrl = SITE_URL_API_TRPC . '/' . SITE_TRPC_IMAGE_GET . '?input=' . rawurlencode('{"json":{"id":' . $imageId . '}}');
  $trpcResponse = fetchUrl($trpcUrl, 20);
  if ($trpcResponse['ok']) {
    $trpcDecoded = json_decode($trpcResponse['body'], true);
    $trpcImage = $trpcDecoded['result']['data']['json'] ?? null;
    if (is_array($trpcImage) && isset($trpcImage['url']) && is_string($trpcImage['url']) && trim($trpcImage['url']) !== '') {
      $raw = trim($trpcImage['url']);
      if (stripos($raw, 'http://') === 0 || stripos($raw, 'https://') === 0) {
        $pushUnique(toCivitaiOriginalUrl($raw));
      } else {
        $pushUnique(SITE_STORAGE_BASE . '/' . $raw . '/original');
      }
    }
  }

  $restResolved = resolveImageUrlFromCivitaiById($imageId);
  if ($restResolved !== '') {
    $pushUnique($restResolved);
  }

  // (resolveImageUrlCandidatesFromCivitaiById continues)
  $pageUrl = SITE_URL_IMAGES . '/' . $imageId;
  $pageResponse = fetchUrl($pageUrl, 20);
  if ($pageResponse['ok']) {
    if (preg_match('~<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](https?://[^"\']+)["\']~i', $pageResponse['body'], $m)) {
      $pushUnique(toCivitaiOriginalUrl($m[1]));
    }
    if (preg_match('~<meta[^>]+content=["\'](https?://[^"\']+)["\'][^>]+property=["\']og:image["\']~i', $pageResponse['body'], $m)) {
      $pushUnique(toCivitaiOriginalUrl($m[1]));
    }
  }

  return $candidates;
}

function parsePngTextChunks(string $binary): array {
  $signature = "\x89PNG\r\n\x1a\n";
  if (strlen($binary) < 8 || substr($binary, 0, 8) !== $signature) {
    return [];
  }

  $entries = [];
  $offset = 8;
  $totalLen = strlen($binary);

  while ($offset + 8 <= $totalLen) {
    $lenData = substr($binary, $offset, 4);
    $type = substr($binary, $offset + 4, 4);
    if (strlen($lenData) !== 4 || strlen($type) !== 4) {
      break;
    }

    $chunkLen = unpack('N', $lenData)[1];
    $dataStart = $offset + 8;
    $dataEnd = $dataStart + $chunkLen;
    $crcEnd = $dataEnd + 4;

    if ($chunkLen < 0 || $crcEnd > $totalLen) {
      break;
    }

    $chunkData = substr($binary, $dataStart, $chunkLen);

    if ($type === 'tEXt') {
      $nullPos = strpos($chunkData, "\0");
      if ($nullPos !== false) {
        $keyword = trim(substr($chunkData, 0, $nullPos));
        $text = substr($chunkData, $nullPos + 1);
        if ($keyword !== '') {
          $entries[] = ['chunk' => 'tEXt', 'keyword' => $keyword, 'text' => $text];
        }
      }
    } elseif ($type === 'zTXt') {
      $nullPos = strpos($chunkData, "\0");
      if ($nullPos !== false && $nullPos + 2 <= strlen($chunkData)) {
        $keyword = trim(substr($chunkData, 0, $nullPos));
        $compressionMethod = ord($chunkData[$nullPos + 1]);
        $compressedText = substr($chunkData, $nullPos + 2);

        $decodedText = '';
        if ($compressionMethod === 0) {
          $decodedText = @gzuncompress($compressedText);
          if ($decodedText === false) {
            $decodedText = @zlib_decode($compressedText);
          }
          if ($decodedText === false || !is_string($decodedText)) {
            $decodedText = '';
          }
        }

        if ($keyword !== '' && $decodedText !== '') {
          $entries[] = ['chunk' => 'zTXt', 'keyword' => $keyword, 'text' => $decodedText];
        }
      }
    } elseif ($type === 'iTXt') {
      $null1 = strpos($chunkData, "\0");
      if ($null1 !== false && $null1 + 2 < strlen($chunkData)) {
        $keyword = trim(substr($chunkData, 0, $null1));
        $compressionFlag = ord($chunkData[$null1 + 1]);
        $compressionMethod = ord($chunkData[$null1 + 2]);

        $cursor = $null1 + 3;
        $null2 = strpos($chunkData, "\0", $cursor);
        if ($null2 !== false) {
          $cursor = $null2 + 1;
          $null3 = strpos($chunkData, "\0", $cursor);
          if ($null3 !== false) {
            $cursor = $null3 + 1;
            $textData = substr($chunkData, $cursor);

            $text = '';
            if ($compressionFlag === 1 && $compressionMethod === 0) {
              $text = @gzuncompress($textData);
              if ($text === false) {
                $text = @zlib_decode($textData);
              }
              if ($text === false || !is_string($text)) {
                $text = '';
              }
            } else {
              $text = $textData;
            }

            if ($keyword !== '' && $text !== '') {
              $entries[] = ['chunk' => 'iTXt', 'keyword' => $keyword, 'text' => $text];
            }
          }
        }
      }
    }

    $offset = $crcEnd;
    if ($type === 'IEND') {
      break;
    }
  }

  return $entries;
}

function tryDecodeJson(string $value) {
  $trimmed = trim($value);
  if ($trimmed === '') {
    return null;
  }

  if ($trimmed[0] !== '{' && $trimmed[0] !== '[') {
    return null;
  }

  $decoded = json_decode($trimmed, true);
  if (json_last_error() === JSON_ERROR_NONE) {
    return $decoded;
  }

  return null;
}

function selectWorkflowFromEntries(array $entries): array {
  if (count($entries) === 0) {
    return ['key' => '', 'workflowText' => ''];
  }

  $looksLikeComfyPromptMap = static function ($decoded): bool {
    if (!is_array($decoded) || count($decoded) === 0) {
      return false;
    }

    $checked = 0;
    foreach ($decoded as $nodeId => $nodeDef) {
      // Prompt-map format uses numeric (often stringified) node IDs as top-level keys.
      if (!is_scalar($nodeId) || !preg_match('/^\d+$/', (string)$nodeId)) {
        continue;
      }

      if (!is_array($nodeDef)) {
        continue;
      }

      $hasInputs = isset($nodeDef['inputs']) && is_array($nodeDef['inputs']);
      $hasClassType = isset($nodeDef['class_type']) && is_string($nodeDef['class_type']) && trim($nodeDef['class_type']) !== '';
      if ($hasInputs || $hasClassType) {
        return true;
      }

      $checked++;
      if ($checked >= 20) {
        break;
      }
    }

    return false;
  };

  $looksLikeWorkflow = static function ($decoded) use ($looksLikeComfyPromptMap): bool {
    if (!is_array($decoded)) {
      return false;
    }

    if (isset($decoded['nodes']) || isset($decoded['last_node_id']) || isset($decoded['prompt']) || isset($decoded['extra_data'])) {
      return true;
    }

    return $looksLikeComfyPromptMap($decoded);
  };

  $preferredKeys = ['workflow', 'comfyui_workflow', 'comfy_workflow', 'comfyui', 'prompt'];

  foreach ($preferredKeys as $preferredKey) {
    foreach ($entries as $entry) {
      $key = strtolower(trim((string)($entry['keyword'] ?? '')));
      $text = (string)($entry['text'] ?? '');
      if ($key !== $preferredKey) {
        continue;
      }

      $decoded = tryDecodeJson($text);
      if ($decoded !== null && $looksLikeWorkflow($decoded)) {
        return [
          'key' => (string)$entry['keyword'],
          'workflowText' => json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        ];
      }
    }
  }

  foreach ($entries as $entry) {
    $decoded = tryDecodeJson((string)($entry['text'] ?? ''));
    if (!is_array($decoded)) {
      continue;
    }

    if ($looksLikeWorkflow($decoded)) {
      return [
        'key' => (string)($entry['keyword'] ?? ''),
        'workflowText' => json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
      ];
    }
  }

  return ['key' => '', 'workflowText' => ''];
}

function selectParametersFromEntries(array $entries): array {
  if (count($entries) === 0) {
    return ['key' => '', 'parametersText' => ''];
  }

  $looksLikeA1111 = static function (string $text): bool {
    $normalized = trim($text);
    if ($normalized === '') {
      return false;
    }

    return stripos($normalized, 'negative prompt:') !== false
      || stripos($normalized, 'steps:') !== false
      || stripos($normalized, 'sampler:') !== false;
  };

  // First pass: prefer explicit `parameters` keys used by PNG metadata.
  foreach ($entries as $entry) {
    $key = strtolower(trim((string)($entry['keyword'] ?? '')));
    if ($key !== 'parameters') {
      continue;
    }

    $text = trim((string)($entry['text'] ?? ''));
    if ($looksLikeA1111($text)) {
      return [
        'key' => (string)($entry['keyword'] ?? ''),
        'parametersText' => $text
      ];
    }
  }

  // Second pass: JPEG metadata commonly stores A1111 text under comment/xmp/user-comment keys.
  foreach ($entries as $entry) {
    $text = trim((string)($entry['text'] ?? ''));
    if ($looksLikeA1111($text)) {
      return [
        'key' => (string)($entry['keyword'] ?? ''),
        'parametersText' => $text
      ];
    }
  }

  return ['key' => '', 'parametersText' => ''];
}

function decodeExifUserComment(string $raw): string {
  if ($raw === '') {
    return '';
  }

  if (strpos($raw, "ASCII\0\0\0") === 0) {
    return trim(substr($raw, 8), "\0 \t\r\n");
  }

  if (strpos($raw, "UNICODE\0") === 0) {
    $text = substr($raw, 8);
    if ($text === '') {
      return '';
    }

    if (substr($text, 0, 2) === "\xFF\xFE" && function_exists('iconv')) {
      $decoded = @iconv('UTF-16LE', 'UTF-8//IGNORE', substr($text, 2));
      return is_string($decoded) ? trim($decoded) : '';
    }

    if (substr($text, 0, 2) === "\xFE\xFF" && function_exists('iconv')) {
      $decoded = @iconv('UTF-16BE', 'UTF-8//IGNORE', substr($text, 2));
      return is_string($decoded) ? trim($decoded) : '';
    }

    if (function_exists('iconv')) {
      $decodedLe = @iconv('UTF-16LE', 'UTF-8//IGNORE', $text);
      if (is_string($decodedLe) && trim($decodedLe) !== '') {
        return trim($decodedLe);
      }
      $decodedBe = @iconv('UTF-16BE', 'UTF-8//IGNORE', $text);
      if (is_string($decodedBe) && trim($decodedBe) !== '') {
        return trim($decodedBe);
      }
    }

    return trim($text, "\0 \t\r\n");
  }

  return trim($raw, "\0 \t\r\n");
}

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

    // Start Of Scan: compressed image data starts; stop scanning metadata segments.
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

function parseJpegMetadataEntries(string $binary): array {
  $entries = [];

  $segments = extractJpegSegments($binary);
  foreach ($segments['comments'] as $comment) {
    $text = trim((string)$comment, "\0 \t\r\n");
    if ($text !== '') {
      $entries[] = ['chunk' => 'JPEG_COM', 'keyword' => 'comment', 'text' => $text];
    }
  }

  foreach ($segments['app1'] as $app1Payload) {
    if (strpos($app1Payload, "http://ns.adobe.com/xap/1.0/\0") === 0) {
      $xmpText = substr($app1Payload, strlen("http://ns.adobe.com/xap/1.0/\0"));
      $xmpText = trim((string)$xmpText, "\0 \t\r\n");
      if ($xmpText !== '') {
        $entries[] = ['chunk' => 'JPEG_APP1', 'keyword' => 'xmp', 'text' => $xmpText];
      }
    }
  }

  if (function_exists('exif_read_data')) {
    $tempFile = @tempnam(sys_get_temp_dir(), 'wf_');
    if (is_string($tempFile) && $tempFile !== '') {
      $writeOk = @file_put_contents($tempFile, $binary);
      if ($writeOk !== false) {
        $exif = @exif_read_data($tempFile, null, true, false);

        if (is_array($exif)) {
          $rawUserComment = '';

          if (isset($exif['EXIF']['UserComment'])) {
            $rawValue = $exif['EXIF']['UserComment'];
            if (is_array($rawValue)) {
              $rawUserComment = (string)reset($rawValue);
            } else {
              $rawUserComment = (string)$rawValue;
            }
          } elseif (isset($exif['COMMENT'])) {
            $commentValue = $exif['COMMENT'];
            if (is_array($commentValue)) {
              foreach ($commentValue as $value) {
                $text = trim((string)$value);
                if ($text !== '') {
                  $entries[] = ['chunk' => 'JPEG_EXIF', 'keyword' => 'comment', 'text' => $text];
                }
              }
            } elseif (is_string($commentValue) && trim($commentValue) !== '') {
              $entries[] = ['chunk' => 'JPEG_EXIF', 'keyword' => 'comment', 'text' => trim($commentValue)];
            }
          }

          $decodedUserComment = decodeExifUserComment($rawUserComment);
          if ($decodedUserComment !== '') {
            $entries[] = ['chunk' => 'JPEG_EXIF', 'keyword' => 'workflow', 'text' => $decodedUserComment];
          }
        }
      }

      @unlink($tempFile);
    }
  }

  return $entries;
}

function resolveImageUrlFromRestApi(int $imageId): string {
  if ($imageId <= 0) {
    return '';
  }

  $response = fetchUrl(SITE_URL_API_REST . '/images?imageId=' . $imageId, 20);
  if (!$response['ok']) {
    return '';
  }

  $decoded = json_decode($response['body'], true);
  if (!is_array($decoded)) {
    return '';
  }

  $items = $decoded['items'] ?? null;
  if (is_array($items) && count($items) > 0 && is_array($items[0])) {
    $url = $items[0]['url'] ?? '';
    if (is_string($url) && trim($url) !== '') {
      return toCivitaiOriginalUrl(trim($url));
    }
  }

  return '';
}

function resolveImageUrlFromTrpc(int $imageId): string {
  if ($imageId <= 0) {
    return '';
  }

  $trpcUrl = SITE_URL_API_TRPC . '/' . SITE_TRPC_IMAGE_GET . '?input=' . rawurlencode('{"json":{"id":' . $imageId . '}}');
  $response = fetchUrl($trpcUrl, 20);
  if (!$response['ok']) {
    return '';
  }

  $decoded = json_decode($response['body'], true);
  $imageData = $decoded['result']['data']['json'] ?? null;
  if (!is_array($imageData)) {
    return '';
  }

  $raw = isset($imageData['url']) && is_string($imageData['url']) ? trim($imageData['url']) : '';
  if ($raw === '') {
    return '';
  }

  if (stripos($raw, 'http') === 0) {
    return toCivitaiOriginalUrl($raw);
  }

  return SITE_STORAGE_BASE . '/' . $raw . '/original';
}

function extractCivitaiUuid(string $url): string {
  if (preg_match('~/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:/|$)~i', $url, $m)) {
    return strtolower($m[1]);
  }
  return '';
}

// Build the ordered list of candidate URLs to try, most reliable first.
// For each resolved URL, both the B2 form and the image.civitai.com CDN form are added
// so that whichever storage backend hosts the original PNG for this image is covered.
// (Some images 404 on B2 but serve the original PNG from the CDN with /original=true.)
function buildImageUrlCandidates(string $callerUrl, int $imageId): array {
  $candidates = [];

  $addUnique = static function (string $url) use (&$candidates): void {
    $url = trim($url);
    if ($url !== '' && !in_array($url, $candidates, true)) {
      $candidates[] = $url;
    }
  };

  $addWithPngForms = static function (string $url) use ($addUnique): void {
    if ($url === '') {
      return;
    }
    $addUnique($url);
    $uuid = extractCivitaiUuid($url);
    if ($uuid !== '') {
      $addUnique(SITE_STORAGE_BASE . '/' . $uuid . '/original');
      $addUnique(SITE_CDN_LEGACY . '/' . SITE_CDN_HASH . '/' . $uuid . '/original=true');
    }
  };

  if ($callerUrl !== '') {
    $addWithPngForms(toCivitaiOriginalUrl($callerUrl));
  }

  // Only call the remote APIs when the caller URL didn't already give us a UUID to work with.
  // Each API call can take up to 20 seconds (timeout); skipping them when unnecessary prevents
  // the script from being killed by Apache's connection timeout before the image is downloaded.
  $callerUuid = $callerUrl !== '' ? extractCivitaiUuid($callerUrl) : '';
  if ($imageId > 0 && $callerUuid === '') {
    $addWithPngForms(resolveImageUrlFromTrpc($imageId));
    $addWithPngForms(resolveImageUrlFromRestApi($imageId));
  }

  return $candidates;
}

try {
  $resolvedImageId = $imageId > 0 ? $imageId : extractImageIdFromPageUrl($imagePageUrl);

  $candidates = buildImageUrlCandidates($fullImageUrlInput, $resolvedImageId);
  
  if (count($candidates) === 0) {
    echo json_encode([
      'success' => false,
      'error' => 'Could not resolve full-size image URL',
      'imageId' => $resolvedImageId,
      'passedImageId' => $imageId,
      'passedPageUrl' => $imagePageUrl,
      'passedFullImageUrl' => $fullImageUrlInput
    ]);
    exit;
  }

  $downloadedUrl = '';
  $lastHttpCode = 0;
  $lastError = '';
  $entries = [];
  $selected = ['key' => '', 'workflowText' => ''];
  $selectedParameters = ['key' => '', 'parametersText' => ''];
  $confirmedPng = false;
  $attemptedUrls = [];
  $downloadAttempts = 0;
  $lastFormat = 'unknown';

  foreach ($candidates as $candidateUrl) {
    $downloadAttempts++;
    $attemptedUrls[] = ['url' => $candidateUrl, 'attempt' => $downloadAttempts];

    $imageResponse = fetchImagePartial($candidateUrl);
    if (!$imageResponse['ok']) {
      $lastHttpCode = (int)$imageResponse['httpCode'];
      $lastError = $imageResponse['error'] ?? 'HTTP ' . $lastHttpCode;
      continue;
    }

    $binary = $imageResponse['body'];
    $isPng = strlen($binary) >= 8 && substr($binary, 0, 8) === "\x89PNG\r\n\x1a\n";
    $isJpeg = !$isPng && strlen($binary) >= 2 && substr($binary, 0, 2) === "\xFF\xD8";

    if ($isPng) {
      // PNG is the authoritative source: if it contains no workflow, no other URL will either.
      $lastFormat = 'PNG';
      $confirmedPng = true;
      $downloadedUrl = $candidateUrl;
      $entries = parsePngTextChunks($binary);
      $selected = selectWorkflowFromEntries($entries);
      $selectedParameters = selectParametersFromEntries($entries);
      break;
    } elseif ($isJpeg) {
      $lastFormat = 'JPEG';
      $downloadedUrl = $candidateUrl;
      $entries = parseJpegMetadataEntries($binary);
      $selected = selectWorkflowFromEntries($entries);
      $selectedParameters = selectParametersFromEntries($entries);
      error_log("Selected workflow: " . (strlen($selected['workflowText']) > 0 ? 'yes' : 'no'));
      if ($selected['workflowText'] !== '') {
        break;
      }
      // JPEG with no workflow: keep trying in case a later candidate returns the original PNG.
    } else {
      $lastFormat = 'unknown';
      // Non-PNG, non-JPEG (WebP, AVIF, etc.): these formats never carry ComfyUI workflow
      // metadata, so the original image simply has no workflow. Stop trying further candidates.
      $downloadedUrl = $candidateUrl;
      error_log("Downloaded unknown format from $candidateUrl");
      break;
    }
  }

  if ($downloadedUrl === '') {
    echo json_encode([
      'success' => false,
      'error' => 'Failed to download image',
      'httpCode' => $lastHttpCode,
      'fetchError' => $lastError,
      'imageId' => $resolvedImageId,
      'attemptedUrls' => $attemptedUrls,
      'downloadAttempts' => $downloadAttempts
    ]);
    exit;
  }

  if ($selected['workflowText'] === '') {
    if ($selectedParameters['parametersText'] !== '') {
      $parametersPayload = json_encode([
        'success' => true,
        'mode' => 'parameters',
        'message' => 'Parameters data found',
        'errorCode' => 'PARAMETERS_FOUND',
        'chunkCount' => count($entries),
        'imageId' => $resolvedImageId,
        'sourceKeyword' => $selectedParameters['key'],
        'parametersText' => mb_convert_encoding($selectedParameters['parametersText'], 'UTF-8', 'UTF-8'),
        'downloadedUrl' => $downloadedUrl,
        'format' => $lastFormat
      ], JSON_INVALID_UTF8_SUBSTITUTE);
      echo $parametersPayload;
      exit;
    }

    // No workflow and no parameters found
    echo json_encode([
      'success' => false,
      'error' => 'No data',
      'errorCode' => 'WORKFLOW_NOT_FOUND',
      'chunkCount' => count($entries),
      'imageId' => $resolvedImageId,
      'downloadedUrl' => $downloadedUrl,
      'format' => $lastFormat,
      'confirmedPng' => $confirmedPng
    ]);
    exit;
  }

  echo json_encode([
    'success' => true,
    'imageId' => $resolvedImageId,
    'imageUrl' => $downloadedUrl,
    'sourceKeyword' => $selected['key'],
    'workflowText' => $selected['workflowText']
  ], JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $e) {
  header('Content-Type: application/json');
  http_response_code( 500 );
  echo json_encode([
    'success' => false,
    'error' => 'Exception: ' . $e->getMessage(),
    'type' => get_class($e),
    'file' => $e->getFile(),
    'line' => $e->getLine(),
    'capturedErrors' => $capturedErrors
  ]);
}
