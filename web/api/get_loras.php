<?php
/**
 * Get Loras Folder Structure
 * 
 * Returns the folder and file structure of the loras directory from the database
 */

header('Content-Type: application/json');

// Database connection
$host = 'localhost';
$user = 'root';
$pass = '';
$dbname = 'civitai_loras';

$conn = new mysqli($host, $user, $pass, $dbname);

if ($conn->connect_error) {
  echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
  exit;
}

try {
  // Query all models from database
  $query = "SELECT model_id, version_id, base_model, filename FROM models ORDER BY filename";
  $result = $conn->query($query);
  
  if (!$result) {
    throw new Exception('Database query failed: ' . $conn->error);
  }
  
  // Organize by folder (using base_model as folder name)
  $folderMap = [];
  
  while ($row = $result->fetch_assoc()) {
    $folderName = $row['base_model'];
    $fileName = pathinfo($row['filename'], PATHINFO_FILENAME);
    
    if (!isset($folderMap[$folderName])) {
      $folderMap[$folderName] = [];
    }
    
    $folderMap[$folderName][] = [
      'name' => $fileName,
      'modelId' => $row['model_id'],
      'versionId' => $row['version_id']
    ];
  }
  
  // Convert to structure format and sort
  $structure = [];
  foreach ($folderMap as $folderName => $files) {
    // Sort files alphabetically (case-insensitive)
    usort($files, function($a, $b) {
      return strcasecmp($a['name'], $b['name']);
    });
    
    $structure[] = [
      'folder' => $folderName,
      'files' => $files
    ];
  }
  
  // Sort by folder name
  usort($structure, function($a, $b) {
    return strcmp($a['folder'], $b['folder']);
  });
  
  echo json_encode([
    'success' => true,
    'data' => $structure
  ]);
  
  $conn->close();
  
} catch (Exception $e) {
  if (isset($conn)) {
    $conn->close();
  }
  echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
