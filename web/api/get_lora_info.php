<?php
/**
 * Get Lora Info from Text File
 * 
 * Reads the first line of a lora's .txt file to get the model ID
 */

header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$folder = $input['folder'] ?? null;
$filename = $input['filename'] ?? null;

if (!$folder || !$filename) {
  echo json_encode(['error' => 'Missing folder or filename']);
  exit;
}

// Path to loras folder
$lorasPath = 'D:/AI/models/loras';
$txtFilePath = $lorasPath . '/' . $folder . '/' . $filename . '.txt';

if (!file_exists($txtFilePath)) {
  echo json_encode(['error' => 'Text file not found']);
  exit;
}

try {
  // Read the first line of the file
  $file = fopen($txtFilePath, 'r');
  $firstLine = fgets($file);
  fclose($file);
  
  // Trim whitespace
  $firstLine = trim($firstLine);
  
  if (empty($firstLine)) {
    echo json_encode(['error' => 'First line is empty']);
    exit;
  }
  
  echo json_encode([
    'success' => true,
    'modelId' => $firstLine,
    'folder' => $folder,
    'filename' => $filename
  ]);
  
} catch (Exception $e) {
  echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
