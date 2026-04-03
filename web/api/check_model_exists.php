<?php
/**
 * Check if Model Exists in Database
 * 
 * Checks if a specific model version exists in the models table
 */

header( 'Content-Type: application/json' );
// Database connection
$servername = "localhost";
$username = "root";
$password = "";
$dbname = "civitai_models";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
    exit;
}

// Get JSON data from request body
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!isset($data['versionId'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required parameter: versionId']);
    exit;
}

$requestedModelId = isset($data['modelId']) ? intval($data['modelId']) : null;
$versionId = intval($data['versionId']);

// Check if the model version exists and get filename
$sql = "SELECT m.model_id, m.filename, m.original_filename
    FROM models m
    WHERE m.version_id = ?
    LIMIT 1";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $versionId);
$stmt->execute();
$result = $stmt->get_result();
$modelRow = $result->fetch_assoc();
$stmt->close();

$exists = $modelRow !== null;
$modelId = $exists ? (int)$modelRow['model_id'] : null;
$filename = $exists ? $modelRow['filename'] : null;
$originalFilename = $exists ? $modelRow['original_filename'] : null;

$settingsSets = [];
if ($exists) {
    $settingsSql = "SELECT set_id, name, guidance_min, guidance_max, steps_min, steps_max, clip_skip, positive, negative
        FROM settings
        WHERE version_id = ?
        ORDER BY set_id ASC";
    $settingsStmt = $conn->prepare($settingsSql);

    if ($settingsStmt) {
        $settingsStmt->bind_param("i", $versionId);
        $settingsStmt->execute();
        $settingsResult = $settingsStmt->get_result();

        while ($settingsRow = $settingsResult->fetch_assoc()) {
            $settingsSets[] = [
                'setId' => isset($settingsRow['set_id']) ? (int)$settingsRow['set_id'] : 1,
                'name' => $settingsRow['name'],
                'cfgMin' => $settingsRow['guidance_min'],
                'cfgMax' => $settingsRow['guidance_max'],
                'stepsMin' => $settingsRow['steps_min'],
                'stepsMax' => $settingsRow['steps_max'],
                'clipSkip' => $settingsRow['clip_skip'],
                'positive' => $settingsRow['positive'],
                'negative' => $settingsRow['negative'],
                'samplerIds' => [],
                'samplerNames' => [],
                'schedulerIds' => [],
                'schedulerNames' => []
            ];
        }

        $settingsStmt->close();
    }
}

$samplerOptions = [];
$schedulerOptions = [];

$samplerOptionsStmt = $conn->prepare("SELECT id, name FROM samplers ORDER BY name ASC, id ASC");
if ($samplerOptionsStmt) {
    $samplerOptionsStmt->execute();
    $samplerOptionsResult = $samplerOptionsStmt->get_result();

    while ($samplerRow = $samplerOptionsResult->fetch_assoc()) {
        $samplerOptions[] = [
            'id' => (int)$samplerRow['id'],
            'name' => $samplerRow['name']
        ];
    }

    $samplerOptionsStmt->close();
}

$schedulerOptionsStmt = $conn->prepare("SELECT id, name FROM schedulers ORDER BY name ASC, id ASC");
if ($schedulerOptionsStmt) {
    $schedulerOptionsStmt->execute();
    $schedulerOptionsResult = $schedulerOptionsStmt->get_result();

    while ($schedulerRow = $schedulerOptionsResult->fetch_assoc()) {
        $schedulerOptions[] = [
            'id' => (int)$schedulerRow['id'],
            'name' => $schedulerRow['name']
        ];
    }

    $schedulerOptionsStmt->close();
}

if ($exists && count($settingsSets) > 0) {
    $samplersBySet = [];
    $schedulersBySet = [];

    $versionSamplersSql = "
        SELECT vs.set_id, vs.sampler_id, s.name
        FROM version_samplers vs
        LEFT JOIN samplers s ON s.id = vs.sampler_id
        WHERE vs.version_id = ?
        ORDER BY vs.set_id ASC, s.name ASC, vs.sampler_id ASC
    ";
    $versionSamplersStmt = $conn->prepare($versionSamplersSql);
    if ($versionSamplersStmt) {
        $versionSamplersStmt->bind_param("i", $versionId);
        $versionSamplersStmt->execute();
        $versionSamplersResult = $versionSamplersStmt->get_result();

        while ($samplerRow = $versionSamplersResult->fetch_assoc()) {
            $setId = isset($samplerRow['set_id']) ? (int)$samplerRow['set_id'] : 1;

            if (!isset($samplersBySet[$setId])) {
                $samplersBySet[$setId] = [
                    'ids' => [],
                    'names' => []
                ];
            }

            $samplersBySet[$setId]['ids'][] = (int)$samplerRow['sampler_id'];
            $samplersBySet[$setId]['names'][] = $samplerRow['name'];
        }

        $versionSamplersStmt->close();
    }

    $versionSchedulersSql = "
        SELECT vsc.set_id, vsc.scheduler_id, sc.name
        FROM version_schedulers vsc
        LEFT JOIN schedulers sc ON sc.id = vsc.scheduler_id
        WHERE vsc.version_id = ?
        ORDER BY vsc.set_id ASC, sc.name ASC, vsc.scheduler_id ASC
    ";
    $versionSchedulersStmt = $conn->prepare($versionSchedulersSql);
    if ($versionSchedulersStmt) {
        $versionSchedulersStmt->bind_param("i", $versionId);
        $versionSchedulersStmt->execute();
        $versionSchedulersResult = $versionSchedulersStmt->get_result();

        while ($schedulerRow = $versionSchedulersResult->fetch_assoc()) {
            $setId = isset($schedulerRow['set_id']) ? (int)$schedulerRow['set_id'] : 1;

            if (!isset($schedulersBySet[$setId])) {
                $schedulersBySet[$setId] = [
                    'ids' => [],
                    'names' => []
                ];
            }

            $schedulersBySet[$setId]['ids'][] = (int)$schedulerRow['scheduler_id'];
            $schedulersBySet[$setId]['names'][] = $schedulerRow['name'];
        }

        $versionSchedulersStmt->close();
    }

    foreach ($settingsSets as &$settingsSet) {
        $setId = isset($settingsSet['setId']) ? (int)$settingsSet['setId'] : 1;

        if (isset($samplersBySet[$setId])) {
            $settingsSet['samplerIds'] = $samplersBySet[$setId]['ids'];
            $settingsSet['samplerNames'] = $samplersBySet[$setId]['names'];
        }

        if (isset($schedulersBySet[$setId])) {
            $settingsSet['schedulerIds'] = $schedulersBySet[$setId]['ids'];
            $settingsSet['schedulerNames'] = $schedulersBySet[$setId]['names'];
        }
    }
    unset($settingsSet);
}

// Backward-compatible top-level settings values from the first set if available
$primarySet = count($settingsSets) > 0 ? $settingsSets[0] : null;
$cfgMin = $primarySet ? $primarySet['cfgMin'] : null;
$cfgMax = $primarySet ? $primarySet['cfgMax'] : null;
$stepsMin = $primarySet ? $primarySet['stepsMin'] : null;
$stepsMax = $primarySet ? $primarySet['stepsMax'] : null;
$clipSkip = $primarySet ? $primarySet['clipSkip'] : null;
$name = $primarySet ? $primarySet['name'] : null;
$positive = $primarySet ? $primarySet['positive'] : null;
$negative = $primarySet ? $primarySet['negative'] : null;

$conn->close();

echo json_encode([
    'success' => true,
    'exists' => $exists,
    'filename' => $filename,
    'originalFilename' => $originalFilename,
    'cfgMin' => $cfgMin,
    'cfgMax' => $cfgMax,
    'stepsMin' => $stepsMin,
    'stepsMax' => $stepsMax,
    'clipSkip' => $clipSkip,
    'name' => $name,
    'positive' => $positive,
    'negative' => $negative,
    'settingsSets' => $settingsSets,
    'samplerOptions' => $samplerOptions,
    'schedulerOptions' => $schedulerOptions,
    'requestedModelId' => $requestedModelId,
    'modelId' => $modelId,
    'versionId' => $versionId
]);
