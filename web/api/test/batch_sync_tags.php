<?php
/**
 * Batch Tag Sync
 * 
 * Loops through all existing LoRAs and syncs their tags to the database
 */

set_time_limit(0); // No time limit for this operation
header('Content-Type: application/json');
require_once __DIR__ . '/../../prefs.php';

// Path to loras folder
$lorasPath = web_model_path( 'lora' );

if (!is_dir($lorasPath)) {
  echo json_encode(['error' => 'Loras directory not found']);
  exit;
}

// Get action
$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? 'scan';

if ($action === 'scan') {
  // Scan all folders and return model IDs
  $modelIds = [];
  $folders = array_filter(glob($lorasPath . '/*'), 'is_dir');
  
  foreach ($folders as $folder) {
    $folderName = basename($folder);
    
    // Get all .txt files in this folder
    $txtFiles = glob($folder . '/*.txt');
    
    foreach ($txtFiles as $txtFile) {
      $filename = basename($txtFile, '.txt');
      
      // Read first line to get model ID
      $file = fopen($txtFile, 'r');
      $firstLine = trim(fgets($file));
      fclose($file);
      
      if (!empty($firstLine)) {
        // Extract numeric model ID from URL or raw ID
        if (preg_match('/(?:models\/)?(\d+)/', $firstLine, $match)) {
          $modelId = (int)$match[1];
          if ($modelId > 0 && !in_array($modelId, $modelIds)) {
            $modelIds[] = $modelId;
          }
        }
      }
    }
  }
  
  echo json_encode([
    'success' => true,
    'action' => 'scan',
    'total_models' => count($modelIds),
    'model_ids' => $modelIds
  ]);
  exit;
}

if ($action === 'sync') {
  // Sync all model IDs
  $modelIds = $input['modelIds'] ?? [];
  
  if (empty($modelIds)) {
    echo json_encode(['error' => 'No model IDs provided']);
    exit;
  }
  
  $results = [
    'total' => count($modelIds),
    'processed' => 0,
    'successful' => 0,
    'failed' => 0,
    'errors' => []
  ];
  
  foreach ($modelIds as $modelId) {
    $results['processed']++;
    
    // Fetch data from Civitai
    $url = "https://civitai.red/models/{$modelId}";
    
    $ch = curl_init();
    curl_setopt_array($ch, [
      CURLOPT_URL => $url,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_MAXREDIRS => 5,
      CURLOPT_TIMEOUT => 30,
      CURLOPT_SSL_VERIFYPEER => false,
      CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      CURLOPT_HTTPHEADER => [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.5',
        'Connection: keep-alive'
      ]
    ]);
    
    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    
    if ($httpCode !== 200 || !$html) {
      $results['failed']++;
      $results['errors'][] = [
        'model_id' => $modelId,
        'error' => "HTTP error: {$httpCode}"
      ];
      continue;
    }
    
    // Extract __NEXT_DATA__
    if (preg_match('/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s', $html, $matches)) {
      $nextData = json_decode($matches[1], true);
      
      if ($nextData) {
        $tagsOnModels = $nextData['props']['pageProps']['trpcState']['json']['queries'][2]['state']['data']['tagsOnModels'] ?? null;
        
        if ($tagsOnModels && is_array($tagsOnModels)) {
          // Sync tags using existing logic
          $syncResult = syncTagsForModel($modelId, $tagsOnModels);
          
          if ($syncResult['success']) {
            $results['successful']++;
          } else {
            $results['failed']++;
            $results['errors'][] = [
              'model_id' => $modelId,
              'error' => $syncResult['error']
            ];
          }
        } else {
          $results['failed']++;
          $results['errors'][] = [
            'model_id' => $modelId,
            'error' => 'No tags found in __NEXT_DATA__'
          ];
        }
      } else {
        $results['failed']++;
        $results['errors'][] = [
          'model_id' => $modelId,
          'error' => 'Failed to parse __NEXT_DATA__'
        ];
      }
    } else {
      $results['failed']++;
      $results['errors'][] = [
        'model_id' => $modelId,
        'error' => '__NEXT_DATA__ not found in HTML'
      ];
    }
    
    // Small delay to avoid rate limiting
    usleep(500000); // 0.5 seconds
  }
  
  echo json_encode([
    'success' => true,
    'action' => 'sync',
    'results' => $results
  ]);
  exit;
}

echo json_encode(['error' => 'Invalid action']);

// Helper function to sync tags for a model
function syncTagsForModel($modelId, $tagsOnModels) {
  $db = new mysqli('localhost', 'root', '', 'civitai_models');
  
  if ($db->connect_error) {
    return ['success' => false, 'error' => 'Database connection failed'];
  }
  
  $db->set_charset('utf8mb4');
  
  // Prepare insert statement for tags
  $stmt = $db->prepare("INSERT INTO tags (id, tag) VALUES (?, ?) ON DUPLICATE KEY UPDATE tag = VALUES(tag)");
  
  if (!$stmt) {
    $db->close();
    return ['success' => false, 'error' => 'Failed to prepare tags statement'];
  }
  
  $tagIds = [];
  
  foreach ($tagsOnModels as $tagData) {
    if (!isset($tagData['tag']['id']) || !isset($tagData['tag']['name'])) {
      continue;
    }
    
    $tagId = (int)$tagData['tag']['id'];
    $tagName = trim($tagData['tag']['name']);
    
    if ($tagId <= 0 || empty($tagName)) {
      continue;
    }
    
    $stmt->bind_param('is', $tagId, $tagName);
    
    if ($stmt->execute()) {
      $tagIds[] = $tagId;
    }
  }
  
  $stmt->close();
  
  // Now populate model_tags table
  if (!empty($tagIds)) {
    $modelTagsStmt = $db->prepare("INSERT INTO model_tags (model_id, tag_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE model_id = VALUES(model_id)");
    
    if ($modelTagsStmt) {
      foreach ($tagIds as $tagId) {
        $modelTagsStmt->bind_param('ii', $modelId, $tagId);
        $modelTagsStmt->execute();
      }
      $modelTagsStmt->close();
    }
  }
  
  $db->close();
  
  return [
    'success' => true,
    'tags_synced' => count($tagIds)
  ];
}
