<?php
/**
 * Civitai Tags Synchronization
 * 
 * Extracts tags from __NEXT_DATA__ and syncs them to the database
 */

header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$tagsOnModels = $input['tagsOnModels'] ?? null;
$modelId = $input['modelId'] ?? null;

if (!$tagsOnModels || !is_array($tagsOnModels)) {
  echo json_encode(['error' => 'No tags data provided']);
  exit;
}

if (!$modelId || !is_numeric($modelId)) {
  echo json_encode(['error' => 'No valid model ID provided']);
  exit;
}

// Database connection
$db = new mysqli('localhost', 'root', '', 'civitai_models');

if ($db->connect_error) {
  echo json_encode(['error' => 'Database connection failed: ' . $db->connect_error]);
  exit;
}

$db->set_charset('utf8mb4');

// Prepare insert statement with ON DUPLICATE KEY UPDATE
$stmt = $db->prepare("INSERT INTO tags (id, tag) VALUES (?, ?) ON DUPLICATE KEY UPDATE tag = VALUES(tag)");

if (!$stmt) {
  echo json_encode(['error' => 'Failed to prepare statement: ' . $db->error]);
  $db->close();
  exit;
}

$inserted = 0;
$updated = 0;
$errors = [];
$tagIds = []; // Store tag IDs for model_tags insertion

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
    $tagIds[] = $tagId; // Add to list for model_tags
    if ($stmt->affected_rows > 0) {
      if ($stmt->insert_id > 0) {
        $inserted++;
      } else {
        $updated++;
      }
    }
  } else {
    $errors[] = [
      'id' => $tagId,
      'name' => $tagName,
      'error' => $stmt->error
    ];
  }
}

$stmt->close();

// Now populate model_tags table
$modelTagsInserted = 0;
$modelTagsErrors = [];

if (!empty($tagIds)) {
  $modelTagsStmt = $db->prepare("INSERT INTO model_tags (model_id, tag_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE model_id = VALUES(model_id)");
  
  if ($modelTagsStmt) {
    foreach ($tagIds as $tagId) {
      $modelTagsStmt->bind_param('ii', $modelId, $tagId);
      
      if ($modelTagsStmt->execute()) {
        if ($modelTagsStmt->affected_rows > 0) {
          $modelTagsInserted++;
        }
      } else {
        $modelTagsErrors[] = [
          'model_id' => $modelId,
          'tag_id' => $tagId,
          'error' => $modelTagsStmt->error
        ];
      }
    }
    $modelTagsStmt->close();
  } else {
    $modelTagsErrors[] = ['error' => 'Failed to prepare model_tags statement: ' . $db->error];
  }
}

$db->close();

echo json_encode([
  'success' => true,
  'tags' => [
    'inserted' => $inserted,
    'updated' => $updated,
    'total_processed' => count($tagsOnModels),
    'errors' => $errors
  ],
  'model_tags' => [
    'inserted' => $modelTagsInserted,
    'total_tag_ids' => count($tagIds),
    'errors' => $modelTagsErrors
  ]
]);
