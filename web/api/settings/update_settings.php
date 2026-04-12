<?php
/**
 * Update settings fields for a model version.
 * Allowed fields: name, cfg, steps, clip_skip, positive, negative
 */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input = api_read_json_input();
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;
$setId = isset($input['setId']) ? (int)$input['setId'] : 1;
$field = isset($input['field']) ? trim((string)$input['field']) : '';
$value = $input['value'] ?? null;

$allowedFields = ['name', 'cfg', 'steps', 'clip_skip', 'positive', 'negative'];
if ($versionId <= 0) {
  api_send_failure('Missing or invalid versionId', 400);
}

if ($setId <= 0) {
  api_send_failure('Missing or invalid setId', 400);
}

if (!in_array($field, $allowedFields, true)) {
  api_send_failure('Invalid field', 400);
}

$conn = api_db_connect();
if ($conn->connect_error) {
  api_send_failure('Database connection failed: ' . $conn->connect_error, 500);
}

$conn->set_charset('utf8mb4');

$existsStmt = $conn->prepare('SELECT version_id FROM models WHERE version_id = ? LIMIT 1');
if (!$existsStmt) {
  $conn->close();
  api_send_failure('Prepare failed: ' . $conn->error, 500);
}

$existsStmt->bind_param('i', $versionId);
$existsStmt->execute();
$existsResult = $existsStmt->get_result();
$existsRow = $existsResult ? $existsResult->fetch_assoc() : null;
$existsStmt->close();

if (!$existsRow) {
  $conn->close();
  api_send_failure('Version not found in models table', 404);
}

if ($field === 'cfg') {
  $cfgMinInput = $input['cfgMin'] ?? null;
  $cfgMaxInput = $input['cfgMax'] ?? null;

  if (($cfgMinInput === null || $cfgMinInput === '') && ($cfgMaxInput === null || $cfgMaxInput === '')) {
    $cfgMin = null;
    $cfgMax = null;
  } else {
    if (!is_numeric($cfgMinInput) || !is_numeric($cfgMaxInput)) {
      $conn->close();
      api_send_failure('cfgMin/cfgMax must be numeric', 400);
    }

    $parsedMin = (float)$cfgMinInput;
    $parsedMax = (float)$cfgMaxInput;
    $lowest = min($parsedMin, $parsedMax);
    $highest = max($parsedMin, $parsedMax);

    $cfgMin = $lowest;
    $cfgMax = $highest;

    if ($cfgMin < 0 || $cfgMin > 100 || $cfgMax < 0 || $cfgMax > 100) {
      $conn->close();
      api_send_failure('cfg values must be between 0 and 100', 400);
    }
  }
} elseif ($field === 'steps') {
  $stepsMinInput = $input['stepsMin'] ?? null;
  $stepsMaxInput = $input['stepsMax'] ?? null;

  if (($stepsMinInput === null || $stepsMinInput === '') && ($stepsMaxInput === null || $stepsMaxInput === '')) {
    $stepsMin = null;
    $stepsMax = null;
  } else {
    if (!is_numeric($stepsMinInput) || !is_numeric($stepsMaxInput)) {
      $conn->close();
      api_send_failure('stepsMin/stepsMax must be numeric', 400);
    }

    $parsedMin = (float)$stepsMinInput;
    $parsedMax = (float)$stepsMaxInput;

    if (floor($parsedMin) != $parsedMin || floor($parsedMax) != $parsedMax) {
      $conn->close();
      api_send_failure('steps values must be integers', 400);
    }

    $lowest = min((int)$parsedMin, (int)$parsedMax);
    $highest = max((int)$parsedMin, (int)$parsedMax);

    $stepsMin = $lowest;
    $stepsMax = $highest;

    if ($stepsMin < 1 || $stepsMin > 10000 || $stepsMax < 1 || $stepsMax > 10000) {
      $conn->close();
      api_send_failure('steps values must be between 1 and 10000', 400);
    }
  }
} elseif ($field === 'clip_skip') {
  $normalized = null;
  if ($value !== null && trim((string)$value) !== '') {
    if (!is_numeric($value)) {
      $conn->close();
      api_send_failure('clip_skip must be numeric', 400);
    }

    $clipSkip = (int)$value;
    if ($clipSkip < 0 || $clipSkip > 11) {
      $conn->close();
      api_send_failure('clip_skip must be between 0 and 11', 400);
    }

    $normalized = $clipSkip;
  }
} else {
  $normalized = ($value === null || trim((string)$value) === '') ? null : (string)$value;
}

if ($field === 'cfg' && $cfgMin === null && $cfgMax === null) {
  $upsertSql = "INSERT INTO settings (version_id, set_id, guidance_min, guidance_max) VALUES (?, ?, NULL, NULL) ON DUPLICATE KEY UPDATE guidance_min = VALUES(guidance_min), guidance_max = VALUES(guidance_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('ii', $versionId, $setId);
} elseif ($field === 'cfg') {
  $upsertSql = "INSERT INTO settings (version_id, set_id, guidance_min, guidance_max) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE guidance_min = VALUES(guidance_min), guidance_max = VALUES(guidance_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('iidd', $versionId, $setId, $cfgMin, $cfgMax);
} elseif ($field === 'steps' && $stepsMin === null && $stepsMax === null) {
  $upsertSql = "INSERT INTO settings (version_id, set_id, steps_min, steps_max) VALUES (?, ?, NULL, NULL) ON DUPLICATE KEY UPDATE steps_min = VALUES(steps_min), steps_max = VALUES(steps_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('ii', $versionId, $setId);
} elseif ($field === 'steps') {
  $upsertSql = "INSERT INTO settings (version_id, set_id, steps_min, steps_max) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE steps_min = VALUES(steps_min), steps_max = VALUES(steps_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('iiii', $versionId, $setId, $stepsMin, $stepsMax);
} elseif ($field === 'clip_skip' && $normalized === null) {
  $upsertSql = "INSERT INTO settings (version_id, set_id, {$field}) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE {$field} = VALUES({$field})";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('ii', $versionId, $setId);
} elseif ($field === 'clip_skip') {
  $upsertSql = "INSERT INTO settings (version_id, set_id, {$field}) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE {$field} = VALUES({$field})";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('iii', $versionId, $setId, $normalized);
} else {
  $upsertSql = "INSERT INTO settings (version_id, set_id, {$field}) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE {$field} = VALUES({$field})";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    $conn->close();
    api_send_failure('Prepare failed: ' . $conn->error, 500);
  }

  $stmt->bind_param('iis', $versionId, $setId, $normalized);
}

$ok = $stmt->execute();
$error = $stmt->error;
$stmt->close();

if (!$ok) {
  $conn->close();
  api_send_failure('Update failed: ' . $error, 500);
}

$selectStmt = $conn->prepare('SELECT name, guidance_min, guidance_max, steps_min, steps_max, clip_skip, positive, negative FROM settings WHERE version_id = ? AND set_id = ? LIMIT 1');
if (!$selectStmt) {
  $conn->close();
  api_send_failure('Verification query prepare failed: ' . $conn->error, 500);
}

$selectStmt->bind_param('ii', $versionId, $setId);
$selectStmt->execute();
$result = $selectStmt->get_result();
$row = $result ? $result->fetch_assoc() : null;
$selectStmt->close();
$conn->close();

if (!$row) {
  api_send_failure('Failed to read saved settings', 500);
}

echo json_encode([
  'success' => true,
  'versionId' => $versionId,
  'setId' => $setId,
  'field' => $field,
  'value' => $field === 'cfg'
    ? (($row['guidance_min'] !== null && $row['guidance_max'] !== null && (string)$row['guidance_min'] === (string)$row['guidance_max'])
      ? $row['guidance_min']
      : ($row['guidance_min'] !== null && $row['guidance_max'] !== null ? ($row['guidance_min'] . ' TO ' . $row['guidance_max']) : null))
    : ($field === 'steps'
      ? (($row['steps_min'] !== null && $row['steps_max'] !== null && (string)$row['steps_min'] === (string)$row['steps_max'])
        ? $row['steps_min']
        : ($row['steps_min'] !== null && $row['steps_max'] !== null ? ($row['steps_min'] . ' TO ' . $row['steps_max']) : null))
      : $row[$field]),
  'cfgMin' => $row['guidance_min'],
  'cfgMax' => $row['guidance_max'],
  'stepsMin' => $row['steps_min'],
  'stepsMax' => $row['steps_max'],
  'clipSkip' => $row['clip_skip'],
  'name' => $row['name'],
  'positive' => $row['positive'],
  'negative' => $row['negative'],
  'settingsSet' => [
    'setId' => $setId,
    'name' => $row['name'],
    'cfgMin' => $row['guidance_min'],
    'cfgMax' => $row['guidance_max'],
    'stepsMin' => $row['steps_min'],
    'stepsMax' => $row['steps_max'],
    'clipSkip' => $row['clip_skip'],
    'positive' => $row['positive'],
    'negative' => $row['negative']
  ]
]);
