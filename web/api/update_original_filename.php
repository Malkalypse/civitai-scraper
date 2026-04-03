<?php
/**
 * Update original filename in database for a model/version.
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$modelId = isset($input['modelId']) ? (int)$input['modelId'] : 0;
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;
$originalFilename = isset($input['originalFilename']) ? trim((string)$input['originalFilename']) : null;

if ($versionId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing or invalid versionId']);
    exit;
}

if ($originalFilename !== null && strpos($originalFilename, "\0") !== false) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid filename']);
    exit;
}

$servername = 'localhost';
$username = 'root';
$password = '';
$dbname = 'civitai_models';

$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $conn->connect_error]);
    exit;
}

$conn->set_charset('utf8mb4');

$normalized = ($originalFilename === null || $originalFilename === '') ? null : $originalFilename;

$stmt = $conn->prepare('UPDATE models SET original_filename = ? WHERE version_id = ?');
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
}

$stmt->bind_param('si', $normalized, $versionId);
$ok = $stmt->execute();
$affectedRows = $stmt->affected_rows;
$error = $stmt->error;
$stmt->close();

if (!$ok) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Update failed: ' . $error]);
    $conn->close();
    exit;
}

$selectStmt = $conn->prepare('SELECT model_id, original_filename FROM models WHERE version_id = ? LIMIT 1');
if (!$selectStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Verification query prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
}

$selectStmt->bind_param('i', $versionId);
$selectStmt->execute();
$result = $selectStmt->get_result();
$row = $result ? $result->fetch_assoc() : null;
$selectStmt->close();
$conn->close();

if (!$row) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Model/version not found']);
    exit;
}

echo json_encode([
    'success' => true,
    'requestedModelId' => $modelId > 0 ? $modelId : null,
    'modelId' => isset($row['model_id']) ? (int)$row['model_id'] : null,
    'versionId' => $versionId,
    'originalFilename' => $row['original_filename'],
    'affectedRows' => $affectedRows
]);
