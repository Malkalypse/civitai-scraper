<?php
/**
 * Extract Workflow JSON from full-size PNG metadata
 */

header('Content-Type: application/json');

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
  curl_close($ch);

  return [
    'ok' => is_string($body) && $body !== '' && $httpCode >= 200 && $httpCode < 300,
    'body' => is_string($body) ? $body : '',
    'httpCode' => $httpCode,
    'contentType' => $contentType,
    'error' => $error
  ];
}

function toCivitaiOriginalUrl(string $url): string {
  if (stripos($url, 'image.civitai.com') === false) {
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

  if (preg_match('~^https?://image\.civitai\.com/[^/]+/([^/]+)(?:/(.*))?$~i', $url, $matches)) {
    $token = $matches[1];
    $tail = isset($matches[2]) ? trim($matches[2], '/') : '';

    if ($tail !== '') {
      $tail = preg_replace('~^(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)/?~i', '', $tail);
      $tail = ltrim((string)$tail, '/');
    }

    $newUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/' . $token . '/original=true';
    if ($tail !== '') {
      $newUrl .= '/' . $tail;
    }

    return $newUrl;
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

  $apiUrl = 'https://civitai.com/api/v1/images?imageId=' . $imageId;
  $response = fetchUrl($apiUrl, 20);
  if (!$response['ok']) {
    return '';
  }

  $decoded = json_decode($response['body'], true);
  if (!is_array($decoded)) {
    return '';
  }

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

  return '';
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

  $preferredKeys = ['workflow', 'comfyui_workflow', 'comfy_workflow', 'comfyui', 'prompt'];

  foreach ($preferredKeys as $preferredKey) {
    foreach ($entries as $entry) {
      $key = strtolower(trim((string)($entry['keyword'] ?? '')));
      $text = (string)($entry['text'] ?? '');
      if ($key !== $preferredKey) {
        continue;
      }

      $decoded = tryDecodeJson($text);
      if ($decoded !== null) {
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

    $looksWorkflow = isset($decoded['nodes']) || isset($decoded['last_node_id']) || isset($decoded['prompt']) || isset($decoded['extra_data']);
    if ($looksWorkflow) {
      return [
        'key' => (string)($entry['keyword'] ?? ''),
        'workflowText' => json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
      ];
    }
  }

  return ['key' => '', 'workflowText' => ''];
}

try {
  $resolvedImageId = $imageId > 0 ? $imageId : extractImageIdFromPageUrl($imagePageUrl);

  $fullImageUrl = '';
  if ($fullImageUrlInput !== '') {
    $fullImageUrl = toCivitaiOriginalUrl($fullImageUrlInput);
  }
  if ($fullImageUrl === '' && $resolvedImageId > 0) {
    $fullImageUrl = resolveImageUrlFromCivitaiById($resolvedImageId);
  }

  if ($fullImageUrl === '') {
    echo json_encode(['success' => false, 'error' => 'Could not resolve full-size image URL']);
    exit;
  }

  $imageResponse = fetchUrl($fullImageUrl, 30);
  if (!$imageResponse['ok']) {
    echo json_encode([
      'success' => false,
      'error' => 'Failed to download full-size image',
      'httpCode' => $imageResponse['httpCode']
    ]);
    exit;
  }

  $binary = $imageResponse['body'];
  $isPng = strlen($binary) >= 8 && substr($binary, 0, 8) === "\x89PNG\r\n\x1a\n";

  if (!$isPng) {
    echo json_encode([
      'success' => false,
      'error' => 'Unsupported image format',
      'errorCode' => 'UNSUPPORTED_FORMAT'
    ]);
    exit;
  }

  $entries = parsePngTextChunks($binary);
  $selected = selectWorkflowFromEntries($entries);

  if ($selected['workflowText'] === '') {
    echo json_encode([
      'success' => false,
      'error' => 'No data',
      'errorCode' => 'WORKFLOW_NOT_FOUND',
      'chunkCount' => count($entries)
    ]);
    exit;
  }

  echo json_encode([
    'success' => true,
    'imageId' => $resolvedImageId,
    'imageUrl' => $fullImageUrl,
    'sourceKeyword' => $selected['key'],
    'workflowText' => $selected['workflowText']
  ]);
} catch (Exception $e) {
  echo json_encode([
    'success' => false,
    'error' => 'Exception: ' . $e->getMessage()
  ]);
}
