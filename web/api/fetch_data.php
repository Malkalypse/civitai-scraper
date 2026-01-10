<?php
/**
 * Civitai Data Fetcher
 * 
 * Fetches the __NEXT_DATA__ JSON from a Civitai model page
 */

header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$modelId = $input['modelId'] ?? null;

if (!$modelId) {
  echo json_encode(['error' => 'No model ID provided']);
  exit;
}

// Validate model ID (should be numeric or contain numbers)
if (!preg_match('/\d+/', $modelId)) {
  echo json_encode(['error' => 'Invalid model ID format']);
  exit;
}

// Construct URL
$url = "https://civitai.com/models/{$modelId}";

try {
  // Initialize cURL session
  $ch = curl_init();
  
  // Set cURL options
  curl_setopt_array($ch, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER => [
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language: en-US,en;q=0.5',
      'Connection: keep-alive',
      'Upgrade-Insecure-Requests: 1'
    ],
    CURLOPT_ENCODING => '' // Let cURL handle encoding automatically
  ]);
  
  // Execute request
  $html = curl_exec($ch);
  $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $error = curl_error($ch);
  
  curl_close($ch);
  
  if ($error) {
    echo json_encode(['error' => "cURL error: {$error}"]);
    exit;
  }
  
  if ($httpCode !== 200) {
    echo json_encode(['error' => "HTTP error: {$httpCode}"]);
    exit;
  }
  
  if (!$html) {
    echo json_encode(['error' => 'Empty response from server']);
    exit;
  }
  
  // Check if URL contains modelVersionId parameter
  $modelVersionIdFromUrl = null;
  if (preg_match('/[?&]modelVersionId=(\d+)/', $modelId, $versionMatch)) {
    $modelVersionIdFromUrl = (int)$versionMatch[1];
  }
  
  // Extract model ID - handle various formats
  if (preg_match('/(?:models\/)?(\d+)/', $modelId, $idMatch)) {
    $cleanModelId = $idMatch[1];
  } else {
    $cleanModelId = preg_replace('/[?&].*$/', '', $modelId);
  }
  
  // First, return the URL to confirm concatenation is correct
  $urlInfo = [
    'step' => 1,
    'message' => 'URL Construction',
    'modelId' => $modelId,
    'constructedUrl' => $url,
    'directLink' => "<a href=\"{$url}\" target=\"_blank\">{$url}</a>",
    'modelVersionIdFromUrl' => $modelVersionIdFromUrl
  ];
  
  // Extract __NEXT_DATA__ JSON
  if (preg_match('/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s', $html, $matches)) {
    $jsonData = $matches[1];
    
    // Decode to verify it's valid JSON
    $decoded = json_decode($jsonData, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
      echo json_encode(['error' => 'Failed to parse JSON: ' . json_last_error_msg()]);
      exit;
    }
    
    // Extract the selected model version from modelVersions array
    $selectedVersion = null;
    $versionSelectionMethod = null;
    
    // Navigate to modelVersions in the trpcState
    $modelVersions = $decoded['props']['pageProps']['trpcState']['json']['queries'][2]['state']['data']['modelVersions'] ?? [];
    
    // Extract model tags
    $modelTags = [];
    $tagsOnModels = $decoded['props']['pageProps']['trpcState']['json']['queries'][2]['state']['data']['tagsOnModels'] ?? [];
    foreach ($tagsOnModels as $tagEntry) {
      if (isset($tagEntry['tag']['name'])) {
        $modelTags[] = $tagEntry['tag']['name'];
      }
    }
    
    if (!empty($modelVersions)) {
      if ($modelVersionIdFromUrl !== null) {
        // Find the version matching the URL parameter
        foreach ($modelVersions as $version) {
          if (isset($version['id']) && (int)$version['id'] === $modelVersionIdFromUrl) {
            $selectedVersion = $version;
            $versionSelectionMethod = "Matched modelVersionId={$modelVersionIdFromUrl} from URL";
            break;
          }
        }
        
        if (!$selectedVersion) {
          $versionSelectionMethod = "modelVersionId={$modelVersionIdFromUrl} not found in modelVersions array";
        }
      } else {
        // No modelVersionId in URL, use first entry
        $selectedVersion = $modelVersions[0];
        $versionSelectionMethod = "No modelVersionId in URL, using first version";
      }
    } else {
      $versionSelectionMethod = "modelVersions array is empty";
    }
    
    // Gallery images - community-uploaded images from tRPC endpoint
    // NOTE: Images are now loaded asynchronously via get_model_images.php
    // This speeds up initial page load by not blocking on image fetching
    
    $galleryDebug['note'] = 'Images loaded asynchronously';
    
    // Return the parsed data with URL info first
    echo json_encode([
      'success' => true,
      'modelId' => $cleanModelId,
      'urlInfo' => $urlInfo,
      'dataInfo' => [
        'step' => 2,
        'message' => '__NEXT_DATA__ JSON Structure',
        'foundScript' => true,
        'jsonSize' => strlen($jsonData)
      ],
      'selectedVersion' => $selectedVersion,
      'versionSelectionMethod' => $versionSelectionMethod,
      'modelTags' => $modelTags,
      'data' => $decoded
    ]);
    
  } else {
    echo json_encode(['error' => 'Could not find __NEXT_DATA__ script tag in page']);
  }
  
} catch (Exception $e) {
  echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
