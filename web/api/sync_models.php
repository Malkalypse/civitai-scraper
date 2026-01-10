<?php
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

if (!isset($data['modelVersions']) || !isset($data['filename'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required parameters: modelVersions and filename']);
    exit;
}

$modelVersions = $data['modelVersions'];
$filename = $data['filename'];
$stats = ['inserted' => 0, 'updated' => 0, 'errors' => []];

// Process each model version
foreach ($modelVersions as $version) {
    $modelId = isset($version['modelId']) ? intval($version['modelId']) : null;
    $versionId = isset($version['id']) ? intval($version['id']) : null;
    $baseModel = isset($version['baseModel']) ? $conn->real_escape_string($version['baseModel']) : null;
    
    // Get original filename from files array (first file)
    $originalFilename = null;
    if (isset($version['files']) && is_array($version['files']) && count($version['files']) > 0) {
        $originalFilename = isset($version['files'][0]['name']) ? 
            $conn->real_escape_string($version['files'][0]['name']) : null;
    }
    
    if ($modelId === null || $versionId === null) {
        $stats['errors'][] = "Missing model_id or version_id for a version";
        continue;
    }
    
    // Insert or update the model
    $sql = "INSERT INTO models (model_id, version_id, base_model, original_filename, filename) 
            VALUES ($modelId, $versionId, " . 
            ($baseModel ? "'$baseModel'" : "NULL") . ", " . 
            ($originalFilename ? "'$originalFilename'" : "NULL") . ", " . 
            "'$filename') 
            ON DUPLICATE KEY UPDATE 
                base_model = VALUES(base_model), 
                original_filename = VALUES(original_filename),
                filename = VALUES(filename)";
    
    if ($conn->query($sql) === TRUE) {
        if ($conn->affected_rows > 0) {
            if ($conn->insert_id > 0) {
                $stats['inserted']++;
            } else {
                $stats['updated']++;
            }
        }
    } else {
        $stats['errors'][] = "SQL Error for model $modelId version $versionId: " . $conn->error;
    }
}

$conn->close();

echo json_encode([
    'success' => true,
    'stats' => $stats,
    'message' => "Synced {$stats['inserted']} new records, updated {$stats['updated']} existing records"
]);
?>
