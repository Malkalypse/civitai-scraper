<?php
/**
 * Check if Model Exists in Database
 * 
 * Checks if a specific model version exists in the models table
 */

header('Content-Type: application/json');

// Database connection
$servername = "localhost";
$username = "root";
$password = "";
$dbname = "civitai_loras";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
    exit;
}

// Get JSON data from request body
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!isset($data['modelId']) || !isset($data['versionId'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required parameters: modelId and versionId']);
    exit;
}

$modelId = intval($data['modelId']);
$versionId = intval($data['versionId']);

// Check if the model version exists
$sql = "SELECT COUNT(*) as count FROM models WHERE model_id = ? AND version_id = ?";
$stmt = $conn->prepare($sql);
$stmt->bind_param("ii", $modelId, $versionId);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();

$exists = $row['count'] > 0;

$stmt->close();
$conn->close();

echo json_encode([
    'success' => true,
    'exists' => $exists,
    'modelId' => $modelId,
    'versionId' => $versionId
]);
