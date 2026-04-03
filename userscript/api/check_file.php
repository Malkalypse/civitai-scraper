<?php
/**
 * Check if a downloaded file exists
 * 
 * Used by the userscript to verify download completion
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'Only POST requests allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$fileName = $input['fileName'] ?? null;

if (!$fileName) {
    echo json_encode(['error' => 'fileName parameter required', 'exists' => false]);
    exit;
}

// Path to checkpoints folder
$checkpointsPath = 'D:/AI/models/checkpoints';

// Path to loras folder
$lorasPath = 'D:/AI/models/loras';

// Search for the file in all subdirectories
$found = false;
$filePath = null;

$pathsToSearch = [$checkpointsPath, $lorasPath];

foreach ($pathsToSearch as $basePath) {
    if (!is_dir($basePath)) {
        continue;
    }

    $folders = array_filter(glob($basePath . '/*'), 'is_dir');

    foreach ($folders as $folder) {
        $searchPath = $folder . '/' . $fileName;

        // Check for .safetensors file (with or without extension in fileName)
        if (file_exists($searchPath)) {
            $found = true;
            $filePath = $searchPath;
            break 2;
        }

        // Try adding .safetensors if not present
        if (!str_ends_with($fileName, '.safetensors')) {
            $searchPathWithExt = $searchPath . '.safetensors';
            if (file_exists($searchPathWithExt)) {
                $found = true;
                $filePath = $searchPathWithExt;
                break 2;
            }
        }
    }
}

$response = [
    'exists' => $found,
    'fileName' => $fileName,
    'filePath' => $filePath,
    'timestamp' => time()
];

if ($found) {
    $response['fileSize'] = filesize($filePath);
    $response['modified'] = filemtime($filePath);
}

echo json_encode($response);
