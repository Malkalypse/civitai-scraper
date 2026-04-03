<?php
/**
 * Create a new settings set row for an existing model version.
 *
 * Input JSON:
 * - versionId (required)
 * - setId (optional, positive integer). If omitted, next available set_id is used.
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;
$setIdInput = isset($input['setId']) ? (int)$input['setId'] : null;

if ($versionId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing or invalid versionId']);
    exit;
}

if ($setIdInput !== null && $setIdInput <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'setId must be a positive integer']);
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

$existsStmt = $conn->prepare('SELECT version_id FROM models WHERE version_id = ? LIMIT 1');
if (!$existsStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
}

$existsStmt->bind_param('i', $versionId);
$existsStmt->execute();
$existsResult = $existsStmt->get_result();
$existsRow = $existsResult ? $existsResult->fetch_assoc() : null;
$existsStmt->close();

if (!$existsRow) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Version not found in models table']);
    $conn->close();
    exit;
}

$resolveNextSetId = function() use ($conn, $versionId) {
    $maxStmt = $conn->prepare('SELECT COALESCE(MAX(set_id), 0) + 1 AS next_set_id FROM settings WHERE version_id = ?');
    if (!$maxStmt) {
        return null;
    }

    $maxStmt->bind_param('i', $versionId);
    $maxStmt->execute();
    $maxResult = $maxStmt->get_result();
    $maxRow = $maxResult ? $maxResult->fetch_assoc() : null;
    $maxStmt->close();

    if (!$maxRow || !isset($maxRow['next_set_id'])) {
        return null;
    }

    return (int)$maxRow['next_set_id'];
};

$setId = $setIdInput;
if ($setId === null) {
    $setId = $resolveNextSetId();
    if ($setId === null || $setId <= 0) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to determine next set_id']);
        $conn->close();
        exit;
    }
}

$insertSql = 'INSERT INTO settings (version_id, set_id) VALUES (?, ?)';
$insertStmt = $conn->prepare($insertSql);
if (!$insertStmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
}

$insertStmt->bind_param('ii', $versionId, $setId);
$insertOk = $insertStmt->execute();
$insertError = $insertStmt->error;
$insertErrorNo = $insertStmt->errno;
$insertStmt->close();

if (!$insertOk) {
    if ($insertErrorNo === 1062) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'set_id already exists for this version']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Insert failed: ' . $insertError]);
    }
    $conn->close();
    exit;
}

$conn->close();

echo json_encode([
    'success' => true,
    'versionId' => $versionId,
    'setId' => $setId,
    'settingsSet' => [
        'setId' => $setId,
        'name' => null,
        'cfgMin' => null,
        'cfgMax' => null,
        'stepsMin' => null,
        'stepsMax' => null,
        'clipSkip' => null,
        'samplerIds' => [],
        'samplerNames' => [],
        'schedulerIds' => [],
        'schedulerNames' => [],
        'positive' => '',
        'negative' => ''
    ]
]);
