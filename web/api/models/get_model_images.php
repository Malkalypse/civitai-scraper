<?php
/**
 * Get Model Images (Async)
 * 
 * Fetches carousel and gallery images for a specific model version
 * This runs separately from the main data fetch to speed up page load
 */

require_once __DIR__ . '/../../config/site.php';
header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$modelId = $input['modelId'] ?? null;
$versionId = $input['versionId'] ?? null;

if (!$modelId || !$versionId) {
  echo json_encode(['error' => 'Missing modelId or versionId']);
  exit;
}

$carouselImages = [];
$galleryImages = [];

/**
 * Build a Civitai transform that constrains the largest side to maxSide.
 * Civitai reliably applies width transforms in this endpoint shape.
 */
function buildCivitaiThumbnailTransform($image, $maxSide = 450) {
  $width = isset($image['width']) && is_numeric($image['width']) ? (int)$image['width'] : null;
  $height = isset($image['height']) && is_numeric($image['height']) ? (int)$image['height'] : null;

  if ($width !== null && $height !== null && $width > 0 && $height > 0) {
    if ($height > $width) {
      $scaledWidth = (int)floor(((int)$maxSide * $width) / $height);
      $scaledWidth = max(1, $scaledWidth);
      return 'anim=false,width=' . $scaledWidth . ',optimized=true';
    }

    return 'anim=false,width=' . (int)$maxSide . ',optimized=true';
  }

  return 'anim=false,width=' . (int)$maxSide . ',optimized=true';
}

function toCivitaiThumbnailUrl($url, $transform) {
  if (!is_string($url) || (stripos($url, SITE_CDN_BASE) === false && stripos($url, SITE_CDN_LEGACY) === false)) {
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

function toCivitaiOriginalUrl($url) {
  if (stripos($url, SITE_STORAGE_BASE) !== false) {
    $normalizedB2 = preg_replace('~/original=true(?=[/?#]|$)~i', '/original', $url, 1, $replacedB2Count);
    if ($replacedB2Count > 0 && is_string($normalizedB2)) {
      return $normalizedB2;
    }

    return $url;
  }

  if (!is_string($url) || (stripos($url, SITE_CDN_BASE) === false && stripos($url, SITE_CDN_LEGACY) === false)) {
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

/**
 * Extract an image page ID from a URL-like string when present.
 */
function extractImagePageIdFromString($value) {
  if (!is_string($value)) {
    return null;
  }

  $value = trim($value);
  if ($value === '') {
    return null;
  }

  if (preg_match('~(?:^|https?://(?:www\.)?civitai\.[a-z.]+)?/images/(\d+)(?:[/?#].*)?$~i', $value, $matches)) {
    return (int)$matches[1];
  }

  if (preg_match('~(?:image\.)?civitai\.[a-z.]+/.*/(\d+)\.(?:jpe?g|png|webp|gif|avif|mp4|webm)(?:[?#].*)?$~i', $value, $matches)) {
    return (int)$matches[1];
  }

  return null;
}

/**
 * Collect candidate image IDs recursively from nested payloads.
 */
function collectImageIdCandidates($value, array &$ids, int $depth = 0) {
  if ($depth > 4) {
    return;
  }

  if (is_array($value)) {
    foreach ($value as $key => $item) {
      if (is_string($key)) {
        $normalizedKey = strtolower(trim($key));
        if (in_array($normalizedKey, ['imageid', 'image_id'], true) && is_numeric($item)) {
          $id = (int)$item;
          if ($id > 0) {
            $ids[] = $id;
          }
        }
      }

      if (is_string($item)) {
        $fromString = extractImagePageIdFromString($item);
        if ($fromString !== null && $fromString > 0) {
          $ids[] = $fromString;
        }
      } elseif (is_numeric($item) && is_string($key) && strtolower(trim($key)) === 'id') {
        $id = (int)$item;
        if ($id > 0) {
          $ids[] = $id;
        }
      } elseif (is_array($item)) {
        collectImageIdCandidates($item, $ids, $depth + 1);
      }
    }
  }
}

/**
 * Resolve a Civitai image page URL from an image payload when possible.
 * Supports multiple common id field names and URL pattern fallback.
 */
function resolveCivitaiImagePageUrl($image) {
  if (!is_array($image)) {
    return null;
  }

  $imagePageBase = SITE_URL_IMAGES . '/';

  $relativePathKeys = ['href', 'link', 'linkUrl', 'imageUrl', 'path', 'permalink'];
  foreach ($relativePathKeys as $key) {
    if (isset($image[$key]) && is_string($image[$key])) {
      $value = trim($image[$key]);
      $pageId = extractImagePageIdFromString($value);
      if ($pageId !== null && $pageId > 0) {
        return $imagePageBase . $pageId;
      }
    }
  }

  // Prefer explicit image id fields first, then generic id.
  $candidateKeys = ['imageId', 'image_id', 'id'];
  foreach ($candidateKeys as $key) {
    if (isset($image[$key]) && is_numeric($image[$key])) {
      return $imagePageBase . (int)$image[$key];
    }
  }

  if (isset($image['url']) && is_string($image['url'])) {
    $pageId = extractImagePageIdFromString($image['url']);
    if ($pageId !== null && $pageId > 0) {
      return $imagePageBase . $pageId;
    }
  }

  $recursiveIds = [];
  collectImageIdCandidates($image, $recursiveIds);
  if (count($recursiveIds) > 0) {
    $recursiveIds = array_values(array_unique(array_filter(array_map('intval', $recursiveIds), static function ($id) {
      return $id > 0;
    })));
    if (count($recursiveIds) > 0) {
      return $imagePageBase . $recursiveIds[0];
    }
  }

  foreach ($image as $value) {
    if (!is_string($value)) {
      continue;
    }

    $pageId = extractImagePageIdFromString($value);
    if ($pageId !== null && $pageId > 0) {
      return $imagePageBase . $pageId;
    }
  }

  return null;
}

try {
  // Fetch carousel images from Civitai API
  $apiUrl = SITE_URL_API_REST . '/models/' . $modelId;
  
  $apiCh = curl_init();
  curl_setopt_array($apiCh, [
    CURLOPT_URL => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  ]);
  
  $apiResponse = curl_exec($apiCh);
  
  if ($apiResponse) {
    $apiData = json_decode($apiResponse, true);
    if ($apiData && isset($apiData['modelVersions']) && !empty($apiData['modelVersions'])) {
      // Find the target version
      $targetVersion = null;
      foreach ($apiData['modelVersions'] as $version) {
        if (isset($version['id']) && (int)$version['id'] === (int)$versionId) {
          $targetVersion = $version;
          break;
        }
      }
      
      // Extract images from the target version
      if ($targetVersion && isset($targetVersion['images'])) {
        foreach ($targetVersion['images'] as $image) {
          if (isset($image['url'])) {
            $thumbTransform = buildCivitaiThumbnailTransform($image, 450);
            $originalImageUrl = toCivitaiOriginalUrl($image['url']);
            $imageUrl = toCivitaiThumbnailUrl($image['url'], $thumbTransform);
            $imageData = [
              'url' => $imageUrl,
              'originalUrl' => $originalImageUrl
            ];

            $resolvedLinkUrl = resolveCivitaiImagePageUrl($image);
            if ($resolvedLinkUrl !== null) {
              $imageData['linkUrl'] = $resolvedLinkUrl;
            }
            
            // Check if this is a video
            if (isset($image['type']) && $image['type'] === 'video') {
              $imageData['type'] = 'video';
            }
            
            // Add metadata if available
            if (isset($image['metadata'])) {
              $imageData['metadata'] = $image['metadata'];
            }
            
            $carouselImages[] = $imageData;
          }
        }
      }
    }
  }
  
  // Fetch gallery images from tRPC endpoint (paginate through all cursors)
  $cursor = null;
  $maxPages = 50;
  $pagesFetched = 0;
  $seenGalleryKeys = [];
  $hasMoreGalleryPages = false;

  while ($pagesFetched < $maxPages) {
    $input = [
      'json' => [
        'period' => 'AllTime',
        'periodMode' => 'published',
        'sort' => 'Newest',
        'withMeta' => false,
        'modelVersionId' => (int)$versionId,
        'modelId' => (int)$modelId,
        'hidden' => false,
        'limit' => 100,
        'browsingLevel' => 31,
        'cursor' => $cursor,
        'authed' => true
      ],
      'meta' => [
        'values' => [
          'cursor' => $cursor === null ? ['undefined'] : [$cursor]
        ]
      ]
    ];

    $inputJson = json_encode($input);
    $galleryApiUrl = SITE_URL_API_TRPC . '/' . SITE_TRPC_GALLERY . '?input=' . urlencode($inputJson);

    $galleryCh = curl_init();
    curl_setopt_array($galleryCh, [
      CURLOPT_URL => $galleryApiUrl,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_TIMEOUT => 30,
      CURLOPT_SSL_VERIFYPEER => false,
      CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      CURLOPT_HTTPHEADER => [
        'Accept: */*',
        'Content-Type: application/json',
      ]
    ]);

    $galleryResponse = curl_exec($galleryCh);

    if (!$galleryResponse) {
      break;
    }

    $galleryData = json_decode($galleryResponse, true);
    if (!is_array($galleryData) || !isset($galleryData['result']['data']['json']) || !is_array($galleryData['result']['data']['json'])) {
      break;
    }

    $galleryJson = $galleryData['result']['data']['json'];
    $items = isset($galleryJson['items']) && is_array($galleryJson['items']) ? $galleryJson['items'] : [];

    foreach ($items as $item) {
      // Each item is a post that contains an array of images
      if (isset($item['images']) && is_array($item['images'])) {
        foreach ($item['images'] as $img) {
          if (!isset($img['url'])) {
            continue;
          }

          $thumbTransform = buildCivitaiThumbnailTransform($img, 450);
          $rawUrl = $img['url'];
          $url = $rawUrl;

          // Build proper Civitai image URL
          if (strpos($url, 'http') !== 0) {
            // URL is just the UUID; build legacy CDN URL (account hash is valid there)
            $url = SITE_CDN_LEGACY . '/' . SITE_CDN_HASH . '/' . $url . '/' . $thumbTransform;
          }

          $url = toCivitaiThumbnailUrl($url, $thumbTransform);

          $originalUrl = $rawUrl;
          if (strpos($originalUrl, 'http') !== 0) {
            $originalUrl = SITE_STORAGE_BASE . '/' . $originalUrl . '/original';
          }
          $originalUrl = toCivitaiOriginalUrl($originalUrl);

          $resolvedLinkUrl = resolveCivitaiImagePageUrl($img);
          $dedupeKey = is_string($resolvedLinkUrl) && $resolvedLinkUrl !== ''
            ? $resolvedLinkUrl
            : (is_string($originalUrl) ? $originalUrl : $url);

          if (isset($seenGalleryKeys[$dedupeKey])) {
            continue;
          }
          $seenGalleryKeys[$dedupeKey] = true;

          $imageData = [
            'url' => $url,
            'originalUrl' => $originalUrl
          ];

          if ($resolvedLinkUrl !== null) {
            $imageData['linkUrl'] = $resolvedLinkUrl;
          }

          if (isset($img['type']) && $img['type'] === 'video') {
            $imageData['type'] = 'video';
          }

          if (isset($img['metadata'])) {
            $imageData['metadata'] = $img['metadata'];
          }

          $galleryImages[] = $imageData;
        }
      }
    }

    $pagesFetched++;

    $nextCursor = $galleryJson['nextCursor'] ?? null;
    if ($nextCursor === null || $nextCursor === '' || $nextCursor === $cursor) {
      $hasMoreGalleryPages = false;
      break;
    }

    $hasMoreGalleryPages = true;
    $cursor = $nextCursor;
  }
  
  echo json_encode([
    'success' => true,
    'carouselImages' => $carouselImages,
    'galleryImages' => $galleryImages,
    'galleryPagesFetched' => $pagesFetched,
    'galleryHasMorePages' => $hasMoreGalleryPages
  ]);
  
} catch (Exception $e) {
  echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
