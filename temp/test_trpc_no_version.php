<?php
// Test tRPC WITHOUT modelVersionId filter
$input = [
  'json' => [
    'period' => 'AllTime',
    'periodMode' => 'published',
    'sort' => 'Newest',
    'withMeta' => false,
    'modelId' => 264786,
    // NO modelVersionId
    'hidden' => false,
    'limit' => 100,
    'browsingLevel' => 31,
    'cursor' => null,
    'authed' => true
  ],
  'meta' => ['values' => ['cursor' => ['undefined']]]
];

$url = 'https://civitai.red/api/trpc/image.getImagesAsPostsInfinite?input=' . urlencode(json_encode($input));

$ch = curl_init();
curl_setopt_array($ch, [
  CURLOPT_URL => $url,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_TIMEOUT => 30,
  CURLOPT_SSL_VERIFYPEER => false
]);
$response = curl_exec($ch);
$data = json_decode($response, true);

if (isset($data['result']['data']['json']['items'])) {
  $items = $data['result']['data']['json']['items'];
  echo "WITHOUT modelVersionId filter:\n";
  echo "  Posts in page 1: " . count($items) . "\n";
  
  $totalImages = 0;
  $imageIds = [];
  foreach ($items as $i => $item) {
    $imgCount = isset($item['images']) ? count($item['images']) : 0;
    $totalImages += $imgCount;
    
    // Collect image IDs from this page
    if (isset($item['images'])) {
      foreach ($item['images'] as $img) {
        if (isset($img['id'])) {
          $imageIds[] = (int)$img['id'];
        }
      }
    }
  }
  
  echo "  Total images on page 1: " . $totalImages . "\n";
  echo "  Image IDs: " . implode(', ', array_slice($imageIds, 0, 20)) . (count($imageIds) > 20 ? '...' : '') . "\n";
  
  echo "  nextCursor: " . json_encode($data['result']['data']['json']['nextCursor'] ?? null) . "\n";
} else {
  echo "Error: No valid response\n";
}
?>
