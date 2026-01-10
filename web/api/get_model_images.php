<?php
/**
 * Get Model Images (Async)
 * 
 * Fetches carousel and gallery images for a specific model version
 * This runs separately from the main data fetch to speed up page load
 */

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

try {
  // Fetch carousel images from Civitai API
  $apiUrl = "https://civitai.com/api/v1/models/{$modelId}";
  
  $apiCh = curl_init();
  curl_setopt_array($apiCh, [
    CURLOPT_URL => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  ]);
  
  $apiResponse = curl_exec($apiCh);
  curl_close($apiCh);
  
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
            $imageData = ['url' => $image['url']];
            
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
  
  // Fetch gallery images from tRPC endpoint
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
      'cursor' => null,
      'authed' => true
    ],
    'meta' => [
      'values' => [
        'cursor' => ['undefined']
      ]
    ]
  ];
  
  $inputJson = json_encode($input);
  $galleryApiUrl = 'https://civitai.com/api/trpc/image.getImagesAsPostsInfinite?input=' . urlencode($inputJson);
  
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
  curl_close($galleryCh);
  
  if ($galleryResponse) {
    $galleryData = json_decode($galleryResponse, true);
    
    // tRPC response structure: result.data.json.items
    if ($galleryData && isset($galleryData['result']['data']['json']['items']) && is_array($galleryData['result']['data']['json']['items'])) {
      $items = $galleryData['result']['data']['json']['items'];
      
      foreach ($items as $item) {
        // Each item is a post that contains an array of images
        if (isset($item['images']) && is_array($item['images'])) {
          foreach ($item['images'] as $img) {
            if (isset($img['url'])) {
              $url = $img['url'];
              
              // Build proper Civitai image URL
              if (strpos($url, 'http') !== 0) {
                // URL is just the UUID, construct full URL with CDN path
                $url = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/' . $url . '/original=true';
              }
              
              $imageData = ['url' => $url];
              
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
      }
    }
  }
  
  echo json_encode([
    'success' => true,
    'carouselImages' => $carouselImages,
    'galleryImages' => $galleryImages
  ]);
  
} catch (Exception $e) {
  echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
