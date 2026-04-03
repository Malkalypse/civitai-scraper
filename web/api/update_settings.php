<?php
/**
 * Update settings fields for a model version.
 * Allowed fields: name, cfg, steps, clip_skip, positive, negative
 */

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$versionId = isset($input['versionId']) ? (int)$input['versionId'] : 0;
$setId = isset($input['setId']) ? (int)$input['setId'] : 1;
$field = isset($input['field']) ? trim((string)$input['field']) : '';
$value = $input['value'] ?? null;

$allowedFields = ['name', 'cfg', 'steps', 'clip_skip', 'positive', 'negative'];
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

if (!in_array($field, $allowedFields, true)) {
  http_response_code(400);
  echo json_encode(['success' => false, 'error' => 'Invalid field']);
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

if ($field === 'cfg') {
  $cfgMinInput = $input['cfgMin'] ?? null;
  $cfgMaxInput = $input['cfgMax'] ?? null;

  if (($cfgMinInput === null || $cfgMinInput === '') && ($cfgMaxInput === null || $cfgMaxInput === '')) {
    $cfgMin = null;
    $cfgMax = null;
  } else {
    if (!is_numeric($cfgMinInput) || !is_numeric($cfgMaxInput)) {
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'cfgMin/cfgMax must be numeric']);
      $conn->close();
      exit;
    }

    $parsedMin = (float)$cfgMinInput;
    $parsedMax = (float)$cfgMaxInput;
    $lowest = min($parsedMin, $parsedMax);
    $highest = max($parsedMin, $parsedMax);

    $cfgMin = $lowest;
    $cfgMax = $highest;

    if ($cfgMin < 0 || $cfgMin > 100 || $cfgMax < 0 || $cfgMax > 100) {
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'cfg values must be between 0 and 100']);
      $conn->close();
      exit;
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
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'stepsMin/stepsMax must be numeric']);
      $conn->close();
      exit;
    }

    $parsedMin = (float)$stepsMinInput;
    $parsedMax = (float)$stepsMaxInput;

    if (floor($parsedMin) != $parsedMin || floor($parsedMax) != $parsedMax) {
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'steps values must be integers']);
      $conn->close();
      exit;
    }

    $lowest = min((int)$parsedMin, (int)$parsedMax);
    $highest = max((int)$parsedMin, (int)$parsedMax);

    $stepsMin = $lowest;
    $stepsMax = $highest;

    if ($stepsMin < 1 || $stepsMin > 10000 || $stepsMax < 1 || $stepsMax > 10000) {
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'steps values must be between 1 and 10000']);
      $conn->close();
      exit;
    }
  }
} elseif ($field === 'clip_skip') {
  $normalized = null;
  if ($value !== null && trim((string)$value) !== '') {
    if (!is_numeric($value)) {
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'clip_skip must be numeric']);
      $conn->close();
      exit;
    }

    $clipSkip = (int)$value;
    if ($clipSkip < 0 || $clipSkip > 11) {
      http_response_code(400);
      echo json_encode(['success' => false, 'error' => 'clip_skip must be between 0 and 11']);
      $conn->close();
      exit;
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
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('ii', $versionId, $setId);
} elseif ($field === 'cfg') {
  $upsertSql = "INSERT INTO settings (version_id, set_id, guidance_min, guidance_max) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE guidance_min = VALUES(guidance_min), guidance_max = VALUES(guidance_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('iidd', $versionId, $setId, $cfgMin, $cfgMax);
} elseif ($field === 'steps' && $stepsMin === null && $stepsMax === null) {
  $upsertSql = "INSERT INTO settings (version_id, set_id, steps_min, steps_max) VALUES (?, ?, NULL, NULL) ON DUPLICATE KEY UPDATE steps_min = VALUES(steps_min), steps_max = VALUES(steps_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('ii', $versionId, $setId);
} elseif ($field === 'steps') {
  $upsertSql = "INSERT INTO settings (version_id, set_id, steps_min, steps_max) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE steps_min = VALUES(steps_min), steps_max = VALUES(steps_max)";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('iiii', $versionId, $setId, $stepsMin, $stepsMax);
} elseif ($field === 'clip_skip' && $normalized === null) {
  $upsertSql = "INSERT INTO settings (version_id, set_id, {$field}) VALUES (?, ?, NULL) ON DUPLICATE KEY UPDATE {$field} = VALUES({$field})";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('ii', $versionId, $setId);
} elseif ($field === 'clip_skip') {
  $upsertSql = "INSERT INTO settings (version_id, set_id, {$field}) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE {$field} = VALUES({$field})";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('iii', $versionId, $setId, $normalized);
} else {
  $upsertSql = "INSERT INTO settings (version_id, set_id, {$field}) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE {$field} = VALUES({$field})";
  $stmt = $conn->prepare($upsertSql);
  if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Prepare failed: ' . $conn->error]);
    $conn->close();
    exit;
  }

  $stmt->bind_param('iis', $versionId, $setId, $normalized);
}

$ok = $stmt->execute();
$error = $stmt->error;
$stmt->close();

if (!$ok) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Update failed: ' . $error]);
  $conn->close();
  exit;
}

$selectStmt = $conn->prepare('SELECT name, guidance_min, guidance_max, steps_min, steps_max, clip_skip, positive, negative FROM settings WHERE version_id = ? AND set_id = ? LIMIT 1');
if (!$selectStmt) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Verification query prepare failed: ' . $conn->error]);
  $conn->close();
  exit;
}

$selectStmt->bind_param('ii', $versionId, $setId);
$selectStmt->execute();
$result = $selectStmt->get_result();
$row = $result ? $result->fetch_assoc() : null;
$selectStmt->close();
$conn->close();

if (!$row) {
  http_response_code(500);
  echo json_encode(['success' => false, 'error' => 'Failed to read saved settings']);
  exit;
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
