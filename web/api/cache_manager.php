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
$generationDir = __DIR__ . '/../cache/image_generation';

// Create cache directory if it doesn't exist
if (!file_exists($cacheDir)) {
  mkdir($cacheDir, 0755, true);
}
if (!file_exists($generationDir)) {
  mkdir($generationDir, 0755, true);
}

function loadGenerationMetadataByModel($generationDir, $targetModelId = null) {
  $byModel = [];
  $modelScoped = [];

  $files = glob($generationDir . '/*.json');
  foreach ($files as $file) {
    if (!is_file($file)) {
      continue;
    }

    $raw = @file_get_contents($file);
    if ($raw === false) {
      continue;
    }

    $row = json_decode($raw, true);
    if (!is_array($row)) {
      continue;
    }

    $filename = isset($row['imageFilename']) ? trim((string)$row['imageFilename']) : '';
    $storedModelId = isset($row['modelId']) ? (string)$row['modelId'] : '';

    if ($filename !== '' && $storedModelId !== '') {
      if (!isset($byModel[$storedModelId])) {
        $byModel[$storedModelId] = [];
      }
      $byModel[$storedModelId][$filename] = true;
    }

    if ($targetModelId !== null && $targetModelId !== '' && $storedModelId === (string)$targetModelId) {
      $modelScoped[] = [
        'path' => $file,
        'imageFilename' => $filename
      ];
    }
  }

  return [$byModel, $modelScoped];
}

function getFileSizeBytes($path) {
  if (!is_string($path) || !is_file($path)) {
    return 0;
  }

  $size = @filesize($path);
  return is_numeric($size) ? (int)$size : 0;
}

switch ($action) {
  case 'getSize':
    // Calculate total cache size
    $totalSize = 0;
    $modelSize = 0;

    [$metadataByModel] = loadGenerationMetadataByModel($generationDir, null);
    $modelFilenames = [];
    if ($modelId !== null && $modelId !== '') {
      $modelFilenames = isset($metadataByModel[(string)$modelId])
        ? $metadataByModel[(string)$modelId]
        : [];
    }
    
    $files = glob($cacheDir . '/*');
    foreach ($files as $file) {
      if (is_file($file) && strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json') {
        $fileSize = filesize($file);
        $totalSize += $fileSize;
        
        // Check if this file belongs to the current model
        $filename = basename($file);
        if ($modelId && isset($modelFilenames[$filename])) {
          $modelSize += $fileSize;
        }
      }
    }
    
    echo json_encode([
      'totalSize' => $totalSize,
      'totalSizeMB' => round($totalSize / 1048576, 2),
      'modelSize' => $modelSize,
      'modelSizeMB' => round($modelSize / 1048576, 2),
      'fileCount' => count(array_filter($files, function ($file) {
        return is_file($file) && strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json';
      }))
    ]);
    break;
    
  case 'clearModel':
    if (!$modelId) {
      echo json_encode(['error' => 'No model ID provided']);
      exit;
    }
    
    $deletedImageCount = 0;
    $deletedImageSize = 0;
    $deletedMetadataCount = 0;
    $deletedMetadataSize = 0;

    [, $modelEntries] = loadGenerationMetadataByModel($generationDir, $modelId);

    // Delete image files for this model from per-image metadata
    foreach ($modelEntries as $entry) {
      $imageFilename = isset($entry['imageFilename']) ? $entry['imageFilename'] : '';
      if ($imageFilename !== '') {
        $filepath = $cacheDir . '/' . $imageFilename;
        if (file_exists($filepath)) {
          $deletedImageSize += getFileSizeBytes($filepath);
          @unlink($filepath);
          $deletedImageCount++;
        }
      }

      if (isset($entry['path']) && is_file($entry['path'])) {
        $deletedMetadataSize += getFileSizeBytes($entry['path']);
        @unlink($entry['path']);
        $deletedMetadataCount++;
      }
    }

    $deletedCount = $deletedImageCount + $deletedMetadataCount;
    $deletedSize = $deletedImageSize + $deletedMetadataSize;
    
    echo json_encode([
      'success' => true,
      'deletedCount' => $deletedCount,
      'deletedSize' => $deletedSize,
      'deletedSizeMB' => round($deletedSize / 1048576, 2),
      'deletedImageCount' => $deletedImageCount,
      'deletedImageSize' => $deletedImageSize,
      'deletedImageSizeMB' => round($deletedImageSize / 1048576, 2),
      'deletedMetadataCount' => $deletedMetadataCount,
      'deletedMetadataSize' => $deletedMetadataSize,
      'deletedMetadataSizeMB' => round($deletedMetadataSize / 1048576, 2)
    ]);
    break;
    
  case 'clearAll':
    $deletedImageCount = 0;
    $deletedImageSize = 0;
    $deletedMetadataCount = 0;
    $deletedMetadataSize = 0;
    
    $files = glob($cacheDir . '/*');
    foreach ($files as $file) {
      if (is_file($file) && strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json') {
        $deletedImageSize += getFileSizeBytes($file);
        @unlink($file);
        $deletedImageCount++;
      }
    }

    $generationFiles = glob($generationDir . '/*.json');
    foreach ($generationFiles as $file) {
      if (is_file($file)) {
        $deletedMetadataSize += getFileSizeBytes($file);
        @unlink($file);
        $deletedMetadataCount++;
      }
    }

    $deletedCount = $deletedImageCount + $deletedMetadataCount;
    $deletedSize = $deletedImageSize + $deletedMetadataSize;
    
    echo json_encode([
      'success' => true,
      'deletedCount' => $deletedCount,
      'deletedSize' => $deletedSize,
      'deletedSizeMB' => round($deletedSize / 1048576, 2),
      'deletedImageCount' => $deletedImageCount,
      'deletedImageSize' => $deletedImageSize,
      'deletedImageSizeMB' => round($deletedImageSize / 1048576, 2),
      'deletedMetadataCount' => $deletedMetadataCount,
      'deletedMetadataSize' => $deletedMetadataSize,
      'deletedMetadataSizeMB' => round($deletedMetadataSize / 1048576, 2)
    ]);
    break;
    
  default:
    echo json_encode(['error' => 'Invalid action']);
}
