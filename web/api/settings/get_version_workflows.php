<?php
/**
 * Get workflow id/revision pairs for a model version.
 */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input = api_read_json_input();
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;

if ($versionId <= 0) {
  api_send_failure('Missing or invalid versionId');
}

$conn = api_db_connect();
if ($conn->connect_error) {
  api_send_failure('Database connection failed: ' . $conn->connect_error, 500);
}

$conn->set_charset('utf8mb4');

$sql = 'SELECT DISTINCT workflow_id, workflow_revision FROM version_workflows WHERE version_id = ? ORDER BY workflow_revision ASC, workflow_id ASC';
$stmt = $conn->prepare($sql);
if (!$stmt) {
  api_send_failure('Prepare failed: ' . $conn->error, 500);
  $conn->close();
}

$stmt->bind_param('i', $versionId);
if (!$stmt->execute()) {
  api_send_failure('Execute failed: ' . $stmt->error, 500);
  $stmt->close();
  $conn->close();
}

$result = $stmt->get_result();
$workflows = [];

if ($result) {
  while ($row = $result->fetch_assoc()) {
    if (!is_array($row)) {
      continue;
    }

    $workflowId = isset($row['workflow_id']) ? trim((string)$row['workflow_id']) : '';
    $workflowRevision = isset($row['workflow_revision']) ? (string)$row['workflow_revision'] : '';

    if ($workflowId === '' || $workflowRevision === '') {
      continue;
    }

    $workflows[] = [
      'workflowId' => $workflowId,
      'workflowRevision' => $workflowRevision
    ];
  }
}

$stmt->close();
$conn->close();

echo json_encode([
  'success' => true,
  'versionId' => $versionId,
  'workflows' => $workflows
]);
