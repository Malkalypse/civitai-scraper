<?php
/**
 * Create a new settings set row for an existing model version.
 *
 * Input JSON:
 * - versionId (required)
 * - setId (optional, positive integer). If omitted, next available set_id is used.
 */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input = api_read_json_input();
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;
$setIdInput = isset($input['setId']) ? (int)$input['setId'] : null;

if ($versionId <= 0) {
    api_send_failure('Missing or invalid versionId', 400);
}

if ($setIdInput !== null && $setIdInput <= 0) {
    api_send_failure('setId must be a positive integer', 400);
}

$conn = api_db_connect();
if ($conn->connect_error) {
    api_send_failure('Database connection failed: ' . $conn->connect_error, 500);
}

$conn->set_charset('utf8mb4');

$existsStmt = $conn->prepare('SELECT version_id FROM models WHERE version_id = ? LIMIT 1');
if (!$existsStmt) {
    api_send_failure('Prepare failed: ' . $conn->error, 500);
    $conn->close();
}

$existsStmt->bind_param('i', $versionId);
$existsStmt->execute();
$existsResult = $existsStmt->get_result();
$existsRow = $existsResult ? $existsResult->fetch_assoc() : null;
$existsStmt->close();

if (!$existsRow) {
    api_send_failure('Version not found in models table', 404);
    $conn->close();
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
        api_send_failure('Failed to determine next set_id', 500);
        $conn->close();
    }
}

$insertSql = 'INSERT INTO settings (version_id, set_id) VALUES (?, ?)';
$insertStmt = $conn->prepare($insertSql);
if (!$insertStmt) {
    api_send_failure('Prepare failed: ' . $conn->error, 500);
    $conn->close();
}

$insertStmt->bind_param('ii', $versionId, $setId);
$insertOk = $insertStmt->execute();
$insertError = $insertStmt->error;
$insertErrorNo = $insertStmt->errno;
$insertStmt->close();

if (!$insertOk) {
    if ($insertErrorNo === 1062) {
        api_send_failure('set_id already exists for this version', 409);
    } else {
        api_send_failure('Insert failed: ' . $insertError, 500);
    }
    $conn->close();
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
