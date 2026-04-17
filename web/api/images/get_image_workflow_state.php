<?php
/**
 * Read workflow entry presence from images table.
 */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input = api_read_json_input();
$imageId = isset($input['imageId']) ? (int)$input['imageId'] : 0;

if ($imageId <= 0) {
  api_send_failure('Missing or invalid imageId');
}

$hasWorkflowEntry = false;
$workflowNull = false;
$workflowHash = '';

try {
  $db = api_db_connect();
  if ($db->connect_error) {
    api_send_failure('Database connection failed: ' . $db->connect_error, 500);
  }
  $db->set_charset('utf8mb4');

  // Query the images table for workflow_hash
  $sql = 'SELECT workflow_hash FROM images WHERE image_id = ? LIMIT 1';
  $stmt = $db->prepare($sql);
  if (!$stmt) {
    $db->close();
    api_send_failure('Prepare failed: ' . $db->error, 500);
  }

  $stmt->bind_param('i', $imageId);
  if (!$stmt->execute()) {
    $error = $stmt->error;
    $stmt->close();
    $db->close();
    api_send_failure('Execute failed: ' . $error, 500);
  }

  $result = $stmt->get_result();
  if ($result && ($row = $result->fetch_assoc())) {
    $workflowValue = $row['workflow_hash'];

    if ($workflowValue === null) {
      // NULL means "no workflow entry yet".
      $hasWorkflowEntry = false;
      $workflowNull = false;
      $workflowHash = '';
    } elseif (is_string($workflowValue)) {
      $normalized = trim($workflowValue);
      if ($normalized === '-1') {
        // -1 means explicitly confirmed missing workflow.
        $hasWorkflowEntry = true;
        $workflowNull = true;
        $workflowHash = '';
      } elseif ($normalized !== '') {
        // Non-empty hash means workflow is present.
        $hasWorkflowEntry = true;
        $workflowNull = false;
        $workflowHash = $normalized;
      } else {
        // Empty string means no workflow entry yet.
        $hasWorkflowEntry = false;
        $workflowNull = false;
        $workflowHash = '';
      }
    }
  }
  $stmt->close();
  $db->close();

  echo json_encode([
    'success' => true,
    'imageId' => $imageId,
    'hasWorkflowEntry' => $hasWorkflowEntry,
    'workflowNull' => $workflowNull,
    'workflowHash' => $workflowHash
  ]);

} catch (Exception $e) {
  api_send_failure('Exception: ' . $e->getMessage(), 500);
}
