<?php
/**
 * Cache Manager
 * 
 * Handles cache size calculation and clearing
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? null;
$modelId = $input['modelId'] ?? null;

$cacheDir = __DIR__ . '/../cache/images';

// Create cache directory if it doesn't exist
if (!file_exists($cacheDir)) {
  mkdir($cacheDir, 0755, true);
}

// Get cache index file (tracks which images belong to which model)
$indexFile = $cacheDir . '/index.json';
$cacheIndex = [];
if (file_exists($indexFile)) {
  $cacheIndex = json_decode(file_get_contents($indexFile), true) ?: [];
}

switch ($action) {
  case 'getSize':
    // Calculate total cache size
    $totalSize = 0;
    $modelSize = 0;
    
    $files = glob($cacheDir . '/*');
    foreach ($files as $file) {
      if (is_file($file) && $file !== $indexFile) {
        $fileSize = filesize($file);
        $totalSize += $fileSize;
        
        // Check if this file belongs to the current model
        $filename = basename($file);
        if ($modelId && isset($cacheIndex[$filename]) && $cacheIndex[$filename] === $modelId) {
          $modelSize += $fileSize;
        }
      }
    }
    
    echo json_encode([
      'totalSize' => $totalSize,
      'totalSizeMB' => round($totalSize / 1048576, 2),
      'modelSize' => $modelSize,
      'modelSizeMB' => round($modelSize / 1048576, 2),
      'fileCount' => count($files) - 1 // Exclude index.json
    ]);
    break;
    
  case 'clearModel':
    if (!$modelId) {
      echo json_encode(['error' => 'No model ID provided']);
      exit;
    }
    
    $deletedCount = 0;
    $deletedSize = 0;
    
    // Find and delete files belonging to this model
    foreach ($cacheIndex as $filename => $storedModelId) {
      if ($storedModelId === $modelId) {
        $filepath = $cacheDir . '/' . $filename;
        if (file_exists($filepath)) {
          $deletedSize += filesize($filepath);
          unlink($filepath);
          $deletedCount++;
        }
        unset($cacheIndex[$filename]);
      }
    }
    
    // Update index
    file_put_contents($indexFile, json_encode($cacheIndex, JSON_PRETTY_PRINT));
    
    echo json_encode([
      'success' => true,
      'deletedCount' => $deletedCount,
      'deletedSize' => $deletedSize,
      'deletedSizeMB' => round($deletedSize / 1048576, 2)
    ]);
    break;
    
  case 'clearAll':
    $deletedCount = 0;
    $deletedSize = 0;
    
    $files = glob($cacheDir . '/*');
    foreach ($files as $file) {
      if (is_file($file) && $file !== $indexFile) {
        $deletedSize += filesize($file);
        unlink($file);
        $deletedCount++;
      }
    }
    
    // Clear index
    file_put_contents($indexFile, json_encode([], JSON_PRETTY_PRINT));
    
    echo json_encode([
      'success' => true,
      'deletedCount' => $deletedCount,
      'deletedSize' => $deletedSize,
      'deletedSizeMB' => round($deletedSize / 1048576, 2)
    ]);
    break;
    
  default:
    echo json_encode(['error' => 'Invalid action']);
}
