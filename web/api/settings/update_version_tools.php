<?php
/**
 * Update sampler/scheduler assignments for a specific version + set.
 *
 * Input JSON:
 * - versionId: int (required)
 * - setId: int (required)
 * - type: 'sampler' | 'scheduler' (required)
 * - ids: int[] (required, can be empty)
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;
$setId = isset($input['setId']) ? (int)$input['setId'] : 0;
$type = isset($input['type']) ? trim((string)$input['type']) : '';
$idsInput = isset($input['ids']) && is_array($input['ids']) ? $input['ids'] : null;

if ($versionId <= 0) {
	http_response_code(400);
	echo json_encode(['success' => false, 'error' => 'Missing or invalid versionId']);
	exit;
}

if ($setId <= 0) {
	http_response_code(400);
	echo json_encode(['success' => false, 'error' => 'Missing or invalid setId']);
	exit;
}

if ($type !== 'sampler' && $type !== 'scheduler') {
	http_response_code(400);
	echo json_encode(['success' => false, 'error' => 'Invalid type (must be sampler or scheduler)']);
	exit;
}

if ($idsInput === null) {
	http_response_code(400);
	echo json_encode(['success' => false, 'error' => 'Missing ids array']);
	exit;
}

$ids = [];
foreach ($idsInput as $rawId) {
	if (!is_numeric($rawId)) {
		http_response_code(400);
		echo json_encode(['success' => false, 'error' => 'All ids must be numeric']);
		exit;
	}

	$parsed = (int)$rawId;
	if ($parsed <= 0) {
		http_response_code(400);
		echo json_encode(['success' => false, 'error' => 'All ids must be positive integers']);
		exit;
	}

	$ids[$parsed] = $parsed;
}
$ids = array_values($ids);

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

$versionStmt = $conn->prepare('SELECT version_id FROM models WHERE version_id = ? LIMIT 1');
if (!$versionStmt) {
	http_response_code(500);
	echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
	$conn->close();
	exit;
}

$versionStmt->bind_param('i', $versionId);
$versionStmt->execute();
$versionResult = $versionStmt->get_result();
$versionRow = $versionResult ? $versionResult->fetch_assoc() : null;
$versionStmt->close();

if (!$versionRow) {
	http_response_code(404);
	echo json_encode(['success' => false, 'error' => 'Version not found in models table']);
	$conn->close();
	exit;
}

// Ensure settings row exists for this version/set before updating relation tables.
$ensureSettingsStmt = $conn->prepare('INSERT INTO settings (version_id, set_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE version_id = VALUES(version_id)');
if (!$ensureSettingsStmt) {
	http_response_code(500);
	echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
	$conn->close();
	exit;
}

$ensureSettingsStmt->bind_param('ii', $versionId, $setId);
$ensureOk = $ensureSettingsStmt->execute();
$ensureError = $ensureSettingsStmt->error;
$ensureSettingsStmt->close();

if (!$ensureOk) {
	http_response_code(500);
	echo json_encode(['success' => false, 'error' => 'Failed to ensure settings set exists: ' . $ensureError]);
	$conn->close();
	exit;
}

if ($type === 'sampler') {
	$relationTable = 'version_samplers';
	$relationIdColumn = 'sampler_id';
	$optionTable = 'samplers';
} else {
	$relationTable = 'version_schedulers';
	$relationIdColumn = 'scheduler_id';
	$optionTable = 'schedulers';
}

if (count($ids) > 0) {
	$placeholders = implode(',', array_fill(0, count($ids), '?'));
	$validateSql = "SELECT id FROM {$optionTable} WHERE id IN ({$placeholders})";
	$validateStmt = $conn->prepare($validateSql);

	if (!$validateStmt) {
		http_response_code(500);
		echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
		$conn->close();
		exit;
	}

	$types = str_repeat('i', count($ids));
	$validateStmt->bind_param($types, ...$ids);
	$validateStmt->execute();
	$validateResult = $validateStmt->get_result();

	$validIds = [];
	while ($validRow = $validateResult->fetch_assoc()) {
		$validIds[(int)$validRow['id']] = true;
	}

	$validateStmt->close();

	foreach ($ids as $id) {
		if (!isset($validIds[$id])) {
			http_response_code(400);
			echo json_encode(['success' => false, 'error' => 'One or more ids are invalid for type ' . $type]);
			$conn->close();
			exit;
		}
	}
}

$conn->begin_transaction();

try {
	$deleteSql = "DELETE FROM {$relationTable} WHERE version_id = ? AND set_id = ?";
	$deleteStmt = $conn->prepare($deleteSql);
	if (!$deleteStmt) {
		throw new Exception('Prepare failed: ' . $conn->error);
	}

	$deleteStmt->bind_param('ii', $versionId, $setId);
	if (!$deleteStmt->execute()) {
		$error = $deleteStmt->error;
		$deleteStmt->close();
		throw new Exception('Delete failed: ' . $error);
	}
	$deleteStmt->close();

	if (count($ids) > 0) {
		$insertSql = "INSERT INTO {$relationTable} (version_id, set_id, {$relationIdColumn}) VALUES (?, ?, ?)";
		$insertStmt = $conn->prepare($insertSql);
		if (!$insertStmt) {
			throw new Exception('Prepare failed: ' . $conn->error);
		}

		foreach ($ids as $id) {
			$insertStmt->bind_param('iii', $versionId, $setId, $id);
			if (!$insertStmt->execute()) {
				$error = $insertStmt->error;
				$insertStmt->close();
				throw new Exception('Insert failed: ' . $error);
			}
		}

		$insertStmt->close();
	}

	$conn->commit();
} catch (Exception $e) {
	$conn->rollback();
	http_response_code(500);
	echo json_encode(['success' => false, 'error' => $e->getMessage()]);
	$conn->close();
	exit;
}

$getToolValues = function($toolType) use ($conn, $versionId, $setId) {
	if ($toolType === 'sampler') {
		$sql = "
			SELECT vs.sampler_id AS id, s.name
			FROM version_samplers vs
			LEFT JOIN samplers s ON s.id = vs.sampler_id
			WHERE vs.version_id = ? AND vs.set_id = ?
			ORDER BY s.name ASC, vs.sampler_id ASC
		";
	} else {
		$sql = "
			SELECT vsc.scheduler_id AS id, sc.name
			FROM version_schedulers vsc
			LEFT JOIN schedulers sc ON sc.id = vsc.scheduler_id
			WHERE vsc.version_id = ? AND vsc.set_id = ?
			ORDER BY sc.name ASC, vsc.scheduler_id ASC
		";
	}

	$stmt = $conn->prepare($sql);
	if (!$stmt) {
		return ['ids' => [], 'names' => []];
	}

	$stmt->bind_param('ii', $versionId, $setId);
	$stmt->execute();
	$result = $stmt->get_result();

	$ids = [];
	$names = [];
	while ($row = $result->fetch_assoc()) {
		$ids[] = (int)$row['id'];
		$names[] = $row['name'];
	}

	$stmt->close();

	return ['ids' => $ids, 'names' => $names];
};

$samplerData = $getToolValues('sampler');
$schedulerData = $getToolValues('scheduler');

$conn->close();

echo json_encode([
	'success' => true,
	'versionId' => $versionId,
	'setId' => $setId,
	'type' => $type,
	'ids' => $type === 'sampler' ? $samplerData['ids'] : $schedulerData['ids'],
	'names' => $type === 'sampler' ? $samplerData['names'] : $schedulerData['names'],
	'settingsSet' => [
		'setId' => $setId,
		'samplerIds' => $samplerData['ids'],
		'samplerNames' => $samplerData['names'],
		'schedulerIds' => $schedulerData['ids'],
		'schedulerNames' => $schedulerData['names']
	]
]);
