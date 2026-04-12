<?php
/**
 * Mark image workflow state in cached generation metadata.
 * Supports setting "workflow" to null or a present marker/id value.
 */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input = api_read_json_input();
$imageId = isset($input['imageId']) ? (int)$input['imageId'] : 0;
$modelId = isset($input['modelId']) ? (string)$input['modelId'] : '';
$modelVersionId = isset($input['modelVersionId']) ? (string)$input['modelVersionId'] : '';
$imageFilename = isset($input['imageFilename']) ? trim((string)$input['imageFilename']) : '';
$workflowState = isset($input['workflowState']) ? trim((string)$input['workflowState']) : '';
$hasWorkflowKey = array_key_exists('workflow', (array)$input);
$workflowValue = $hasWorkflowKey ? $input['workflow'] : null;
$hasVersionKey = array_key_exists('version', (array)$input);
$versionValue = $hasVersionKey ? $input['version'] : null;

function normalizeNonEmptyString($value): string {
  if ($value === null) {
    return '';
  }

  $text = trim((string)$value);
  return $text;
}

function registerVersionWorkflowRecord(string $modelVersionId, string $workflowId, string $workflowRevision): array {
  $modelVersionId = (int)$modelVersionId;
  $workflowId = normalizeNonEmptyString($workflowId);
  $workflowRevision = (int)$workflowRevision;

  if ($modelVersionId <= 0 || $workflowId === '' || $workflowRevision < 0) {
    return ['attempted' => false, 'stored' => false, 'reason' => 'missing-required-values'];
  }

  $db = api_db_connect();
  if ($db->connect_error) {
    return ['attempted' => true, 'stored' => false, 'reason' => 'db-connect-failed'];
  }

  $db->set_charset('utf8mb4');

  $checkSql = "SELECT 1 FROM version_workflows WHERE version_id = ? AND workflow_id = ? AND workflow_revision = ? LIMIT 1";
  $checkStmt = $db->prepare($checkSql);
  if (!$checkStmt) {
    $db->close();
    return ['attempted' => true, 'stored' => false, 'reason' => 'prepare-check-failed'];
  }

  $checkStmt->bind_param('isi', $modelVersionId, $workflowId, $workflowRevision);
  $checkStmt->execute();
  $checkResult = $checkStmt->get_result();
  $exists = $checkResult && $checkResult->fetch_assoc();
  if ($checkResult) {
    $checkResult->free();
  }
  $checkStmt->close();

  if ($exists) {
    $db->close();
    return ['attempted' => true, 'stored' => true, 'inserted' => false, 'reason' => 'already-exists'];
  }

  $insertSql = "INSERT INTO version_workflows (version_id, workflow_id, workflow_revision) VALUES (?, ?, ?)";
  $insertStmt = $db->prepare($insertSql);
  if (!$insertStmt) {
    $db->close();
    return ['attempted' => true, 'stored' => false, 'reason' => 'prepare-insert-failed'];
  }

  $insertStmt->bind_param('isi', $modelVersionId, $workflowId, $workflowRevision);
  $ok = $insertStmt->execute();
  $insertStmt->close();
  $db->close();

  if (!$ok) {
    return ['attempted' => true, 'stored' => false, 'reason' => 'insert-failed'];
  }

  return ['attempted' => true, 'stored' => true, 'inserted' => true];
}

if ($imageId <= 0) {
  api_send_failure('Missing or invalid imageId');
}

try {
  $cacheDir = __DIR__ . '/../../cache/image_generation';
  if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
  }

  $cacheFile = $cacheDir . '/' . $imageId . '.json';
  $payload = [];

  if (is_file($cacheFile)) {
    $raw = @file_get_contents($cacheFile);
    if ($raw !== false) {
      $decoded = json_decode($raw, true);
      if (is_array($decoded)) {
        $payload = $decoded;
      }
    }
  }

  $payload['imageId'] = $imageId;
  if ($modelId !== '') {
    $payload['modelId'] = $modelId;
  }
  if ($modelVersionId !== '') {
    $payload['modelVersionId'] = $modelVersionId;
  }
  if ($imageFilename !== '') {
    $payload['imageFilename'] = $imageFilename;
  }
  if (isset($payload['sourceUrl'])) {
    unset($payload['sourceUrl']);
  }

  $workflowRegistry = ['attempted' => false, 'stored' => false];
  if ($workflowState === 'present') {
    if ($hasWorkflowKey) {
      $payload['workflow'] = $workflowValue;
    } else {
      $payload['workflow'] = true;
    }

    if ($hasVersionKey) {
      if (is_string($versionValue)) {
        $versionTrimmed = trim($versionValue);
        if ($versionTrimmed !== '') {
          $payload['version'] = $versionTrimmed;
        }
      } elseif ($versionValue !== null) {
        $payload['version'] = (string)$versionValue;
      }
    }

    $workflowRegistry = registerVersionWorkflowRecord(
      $modelVersionId,
      normalizeNonEmptyString($payload['workflow'] ?? ''),
      normalizeNonEmptyString($payload['version'] ?? '')
    );
  } elseif ($workflowState === 'missing') {
    $payload['workflow'] = null;
    if (isset($payload['version'])) {
      unset($payload['version']);
    }
  } elseif ($hasWorkflowKey) {
    $payload['workflow'] = $workflowValue;
  }
  $payload['updatedAt'] = date('c');

  @file_put_contents($cacheFile, json_encode($payload));

  echo json_encode([
    'success' => true,
    'imageId' => $imageId,
    'workflowNull' => array_key_exists('workflow', $payload) && $payload['workflow'] === null,
    'workflowRegistry' => $workflowRegistry
  ]);
} catch (Exception $e) {
  api_send_failure('Exception: ' . $e->getMessage(), 500);
}
