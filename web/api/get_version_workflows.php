<?php
/**
 * Get workflow id/revision pairs for a model version.
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;

if ($versionId <= 0) {
  echo json_encode(['success' => false, 'error' => 'Missing or invalid versionId']);
  exit;
}

$conn = new mysqli('localhost', 'root', '', 'civitai_models');
if ($conn->connect_error) {
  echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $conn->connect_error]);
  exit;
}

$conn->set_charset('utf8mb4');

$sql = 'SELECT DISTINCT workflow_id, workflow_revision FROM version_workflows WHERE version_id = ? ORDER BY workflow_revision ASC, workflow_id ASC';
$stmt = $conn->prepare($sql);
if (!$stmt) {
  echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
  $conn->close();
  exit;
}

$stmt->bind_param('i', $versionId);
if (!$stmt->execute()) {
  echo json_encode(['success' => false, 'error' => 'Execute failed: ' . $stmt->error]);
  $stmt->close();
  $conn->close();
  exit;
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
