<?php
error_reporting(0); // Suppress errors/warnings that could break JSON
ini_set('display_errors', 0);
ini_set('max_execution_time', 300); // 5 minutes
set_time_limit(300);
header('Content-Type: application/json');
ob_start(); // Start output buffering

// Get JSON data from request body
$json = file_get_contents('php://input');
$data = json_decode($json, true);

$action = $data['action'] ?? '';

if ($action === 'scan') {
    // Scan all .txt files in the loras directory
    $lorasDir = 'D:/AI/models/loras';
    $modelIds = [];
    $files = []; // Store file associations
    
    if (!is_dir($lorasDir)) {
        ob_end_clean();
        ob_start();
        echo json_encode(['success' => false, 'error' => 'Loras directory not found']);
        ob_end_flush();
        exit;
    }
    
    // Get all folders in the loras directory
    $folders = array_filter(glob($lorasDir . '/*'), 'is_dir');
    
    foreach ($folders as $folder) {
        $folderName = basename($folder);
        
        // Get all .txt files in this folder
        $txtFiles = glob($folder . '/*.txt');
        
        foreach ($txtFiles as $txtFile) {
            $filename = basename($txtFile, '.txt');
            
            // Read first line to get model ID and version ID
            $fileHandle = fopen($txtFile, 'r');
            if ($fileHandle) {
                $firstLine = trim(fgets($fileHandle));
                fclose($fileHandle);
                
                if (!empty($firstLine)) {
                    // Extract model ID and version ID using regex
                    if (preg_match('/(?:https?:\/\/civitai\.com\/models\/)?(\d+)(?:\?modelVersionId=(\d+))?/', $firstLine, $matches)) {
                        $modelId = $matches[1];
                        $versionId = isset($matches[2]) ? $matches[2] : null;
                        
                        // Get the corresponding .safetensors filename
                        $safetensorsFile = $filename . '.safetensors';
                        
                        if (!in_array($modelId, $modelIds)) {
                            $modelIds[] = $modelId;
                        }
                        
                        $files[] = [
                            'modelId' => $modelId,
                            'versionId' => $versionId,
                            'filename' => $safetensorsFile,
                            'folder' => $folderName
                        ];
                    }
                }
            }
        }
    }
    
    ob_end_clean();
    ob_start();
    echo json_encode([
        'success' => true,
        'modelIds' => $modelIds,
        'files' => $files
    ]);
    ob_end_flush();
    exit;
}

if ($action === 'sync_single') {
    $modelId = $data['modelId'] ?? null;
    $files = $data['files'] ?? [];
    $skipExisting = $data['skipExisting'] ?? false;
    
    if (!$modelId) {
        ob_end_clean();
        ob_start();
        echo json_encode(['success' => false, 'error' => 'No model ID provided']);
        ob_end_flush();
        exit;
    }
    
    $synced = 0;
    $errors = [];
    $skipped = false;
    
    // Database connection
    $dbHost = 'localhost';
    $dbUser = 'root';
    $dbPass = '';
    $dbName = 'civitai_models';
    
    $conn = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
    
    if ($conn->connect_error) {
        ob_end_clean();
        ob_start();
        echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $conn->connect_error]);
        ob_end_flush();
        exit;
    }
    
    // Check if model already exists (if skip is enabled)
    if ($skipExisting) {
        $checkStmt = $conn->prepare("SELECT COUNT(*) as count FROM models WHERE model_id = ?");
        $checkStmt->bind_param("i", $modelId);
        $checkStmt->execute();
        $checkResult = $checkStmt->get_result();
        $row = $checkResult->fetch_assoc();
        $checkStmt->close();
        
        if ($row['count'] > 0) {
            $conn->close();
            ob_end_clean();
            ob_start();
            echo json_encode(['success' => true, 'skipped' => true, 'synced' => 0, 'errors' => []]);
            ob_end_flush();
            exit;
        }
    }
    
    // Create a map of modelId+versionId to filename
    $fileMap = [];
    foreach ($files as $file) {
        $key = $file['modelId'] . '_' . ($file['versionId'] ?? 'null');
        $fileMap[$key] = $file['filename'];
    }
    
    try {
        // Fetch model data from Civitai API (much faster than HTML scraping)
        $url = "https://civitai.com/api/v1/models/{$modelId}";
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            $errors[] = "HTTP {$httpCode}";
        } else {
            $modelData = json_decode($response, true);
            $modelVersions = $modelData['modelVersions'] ?? [];
            
            if (empty($modelVersions)) {
                $errors[] = "No versions found";
            } else {
                // Sync to database
                foreach ($modelVersions as $version) {
                    $versionId = $version['id'] ?? null;
                    $baseModel = $version['baseModel'] ?? null;
                    $originalFilename = $version['files'][0]['name'] ?? null;
                    
                    if (!$versionId) {
                        continue; // Skip versions without IDs
                    }
                    
                    // Try to find matching filename from our scanned files
                    // First try exact match with version ID
                    $key = $modelId . '_' . $versionId;
                    $filename = $fileMap[$key] ?? null;
                    
                    // If not found, try the file that had no version ID (modelId_null)
                    // This handles cases where text file had URL without ?modelVersionId parameter
                    if (!$filename) {
                        $keyWithoutVersion = $modelId . '_null';
                        $filename = $fileMap[$keyWithoutVersion] ?? null;
                    }
                    
                    // Only sync if we have a matching local file
                    if ($filename) {
                        $stmt = $conn->prepare("INSERT INTO models (model_id, version_id, base_model, original_filename, filename) 
                                               VALUES (?, ?, ?, ?, ?)
                                               ON DUPLICATE KEY UPDATE 
                                                   base_model = VALUES(base_model),
                                                   original_filename = VALUES(original_filename),
                                                   filename = VALUES(filename)");
                        
                        if ($stmt) {
                            $stmt->bind_param("iisss", $modelId, $versionId, $baseModel, $originalFilename, $filename);
                            
                            if ($stmt->execute()) {
                                $synced++;
                            } else {
                                $errors[] = "Version {$versionId}: " . $stmt->error;
                            }
                            
                            $stmt->close();
                        } else {
                            $errors[] = "Version {$versionId}: Failed to prepare statement";
                        }
                        
                        // If we matched a file without version ID, only sync the first version
                        // (which is typically the latest/primary version)
                        if ($keyWithoutVersion && isset($fileMap[$keyWithoutVersion])) {
                            break; // Only sync first version for files without explicit version ID
                        }
                    }
                }
            }
        }
        
    } catch (Exception $e) {
        $errors[] = $e->getMessage();
    }
    
    $conn->close();
    
    ob_end_clean();
    ob_start();
    echo json_encode([
        'success' => true,
        'synced' => $synced,
        'skipped' => false,
        'errors' => $errors
    ]);
    ob_end_flush();
    exit;
}

if ($action === 'sync') {
    $modelIds = $data['modelIds'] ?? [];
    $files = $data['files'] ?? [];
    
    if (empty($modelIds)) {
        ob_end_clean();
        ob_start();
        echo json_encode(['success' => false, 'error' => 'No model IDs provided']);
        ob_end_flush();
        exit;
    }
    
    $synced = 0;
    $errors = [];
    
    // Database connection - establish once
    $dbHost = 'localhost';
    $dbUser = 'root';
    $dbPass = '';
    $dbName = 'civitai_models';
    
    $conn = new mysqli($dbHost, $dbUser, $dbPass, $dbName);
    
    if ($conn->connect_error) {
        ob_end_clean();
        ob_start();
        echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $conn->connect_error]);
        ob_end_flush();
        exit;
    }
    
    // Create a map of modelId+versionId to filename
    $fileMap = [];
    foreach ($files as $file) {
        $key = $file['modelId'] . '_' . ($file['versionId'] ?? 'null');
        $fileMap[$key] = $file['filename'];
    }
    
    // Process each model
    foreach ($modelIds as $modelId) {
        try {
            // Fetch __NEXT_DATA__ from Civitai
            $url = "https://civitai.com/models/{$modelId}";
            
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            
            $html = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode !== 200) {
                $errors[] = "Model {$modelId}: HTTP {$httpCode}";
                continue;
            }
            
            // Extract __NEXT_DATA__
            if (preg_match('/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s', $html, $matches)) {
                $nextData = json_decode($matches[1], true);
                $modelVersions = $nextData['props']['pageProps']['trpcState']['json']['queries'][2]['state']['data']['modelVersions'] ?? [];
                
                if (empty($modelVersions)) {
                    $errors[] = "Model {$modelId}: No versions found";
                    continue;
                }
                
                // Sync to database
                foreach ($modelVersions as $version) {
                    $versionId = $version['id'] ?? null;
                    $baseModel = $version['baseModel'] ?? null;
                    $originalFilename = $version['files'][0]['name'] ?? null;
                    
                    // Find matching filename from our scanned files
                    $key = $modelId . '_' . ($versionId ?? 'null');
                    $filename = $fileMap[$key] ?? null;
                    
                    if ($filename && $versionId) {
                        // Insert into database using the already established connection
                        $stmt = $conn->prepare("INSERT INTO models (model_id, version_id, base_model, original_filename, filename) 
                                               VALUES (?, ?, ?, ?, ?)
                                               ON DUPLICATE KEY UPDATE 
                                                   base_model = VALUES(base_model),
                                                   original_filename = VALUES(original_filename),
                                                   filename = VALUES(filename)");
                        
                        if ($stmt) {
                            $stmt->bind_param("iisss", $modelId, $versionId, $baseModel, $originalFilename, $filename);
                            
                            if ($stmt->execute()) {
                                $synced++;
                            } else {
                                $errors[] = "Model {$modelId} version {$versionId}: " . $stmt->error;
                            }
                            
                            $stmt->close();
                        } else {
                            $errors[] = "Model {$modelId} version {$versionId}: Failed to prepare statement";
                        }
                    }
                }
                
                // Rate limiting - wait 500ms between requests
                usleep(500000);
                
            } else {
                $errors[] = "Model {$modelId}: Could not extract __NEXT_DATA__";
            }
            
        } catch (Exception $e) {
            $errors[] = "Model {$modelId}: " . $e->getMessage();
        }
    }
    
    // Close database connection
    $conn->close();
    
    // Clear any previous output and send JSON
    ob_end_clean();
    ob_start();
    echo json_encode([
        'success' => true,
        'synced' => $synced,
        'errors' => $errors
    ]);
    ob_end_flush();
    exit;
}

ob_end_clean();
ob_start();
echo json_encode(['success' => false, 'error' => 'Invalid action']);
ob_end_flush();
