<?php
/**
 * Rename Model File and Update Database
 * 
 * Renames a physical model file and updates the database
 */

header('Content-Type: application/json');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);
$oldFilename = $input['oldFilename'] ?? null;
$newFilename = $input['newFilename'] ?? null;
$originalDownloadFilename = isset($input['originalDownloadFilename']) ? trim((string)$input['originalDownloadFilename']) : null;
$modelId = $input['modelId'] ?? null;
$versionId = $input['versionId'] ?? null;
$baseModel = $input['baseModel'] ?? null;
$allowMissingFile = !empty($input['allowMissingFile']);

if (is_string($baseModel)) {
  $baseModel = trim($baseModel);
  if ($baseModel === '') {
    $baseModel = null;
  }
}

if (!$oldFilename || !$newFilename) {
  echo json_encode(['success' => false, 'error' => 'Missing filename parameters']);
  exit;
}

// Strip .safetensors extension if present (will be added back)
if (substr($oldFilename, -12) === '.safetensors') {
  $oldFilename = substr($oldFilename, 0, -12);
}
if (substr($newFilename, -12) === '.safetensors') {
  $newFilename = substr($newFilename, 0, -12);
}

// Add .safetensors extension for file operations
$oldFilenameWithExt = $oldFilename . '.safetensors';
$newFilenameWithExt = $newFilename . '.safetensors';

$renameFolderMode = false;
if (is_string($originalDownloadFilename) && $originalDownloadFilename !== '') {
  $renameFolderMode = (strtolower(substr($originalDownloadFilename, -4)) === '.zip');
}

// Validate filenames
if (strpos($oldFilename, '..') !== false || strpos($newFilename, '..') !== false) {
  echo json_encode(['success' => false, 'error' => 'Invalid filename (contains ..)']);
  exit;
}

// Base model directory (type-specific folder will be selected from DB row type)
$modelBasePath = 'D:/AI/models/loras';
$candidateBasePaths = [$modelBasePath];

try {
  $db = null;
  $modelType = null;
  $missingFileWarning = null;

  $respondWithDbOnlyUpdate = function ($warningMessage = null) use (&$db, $oldFilename, $newFilename, $modelId, $versionId, &$modelType, &$modelBasePath) {
    if (!$db || !$modelId || !$versionId) {
      echo json_encode(['success' => false, 'error' => 'Cannot update database filename without modelId/versionId']);
      exit;
    }

    $stmt = $db->prepare("UPDATE models SET filename = ? WHERE model_id = ? AND version_id = ?");
    $stmt->bind_param("sii", $newFilename, $modelId, $versionId);

    if (!$stmt->execute()) {
      echo json_encode(['success' => false, 'error' => 'Database update failed: ' . $stmt->error]);
      $stmt->close();
      $db->close();
      exit;
    }

    $affectedRows = $stmt->affected_rows;
    $stmt->close();
    $db->close();

    echo json_encode([
      'success' => true,
      'oldFilename' => $oldFilename,
      'newFilename' => $newFilename,
      'folder' => null,
      'databaseUpdated' => true,
      'fileRenamed' => false,
      'affectedRows' => $affectedRows,
      'modelId' => $modelId,
      'versionId' => $versionId,
      'type' => $modelType,
      'modelBasePath' => $modelBasePath,
      'warning' => $warningMessage
    ]);
    exit;
  };

  // Resolve model type from DB row being updated, then choose the proper model folder
  if ($modelId && $versionId) {
    $db = new mysqli('localhost', 'root', '', 'civitai_models');

    if ($db->connect_error) {
      echo json_encode(['success' => false, 'error' => 'Database connection failed']);
      exit;
    }

    $db->set_charset('utf8mb4');

    $typeStmt = $db->prepare("SELECT type FROM models WHERE model_id = ? AND version_id = ? LIMIT 1");
    $typeStmt->bind_param("ii", $modelId, $versionId);

    if (!$typeStmt->execute()) {
      echo json_encode(['success' => false, 'error' => 'Failed to fetch model type: ' . $typeStmt->error]);
      $typeStmt->close();
      $db->close();
      exit;
    }

    $typeResult = $typeStmt->get_result();
    $typeRow = $typeResult ? $typeResult->fetch_assoc() : null;
    $typeStmt->close();

    if (!$typeRow || !isset($typeRow['type']) || trim($typeRow['type']) === '') {
      $db->close();
      echo json_encode(['success' => false, 'error' => 'Could not determine model type for the specified model/version']);
      exit;
    }

    $modelType = trim($typeRow['type']);
    $normalizedType = strtolower(preg_replace('/[^a-z0-9]+/', '', $modelType));

    // Extend this map as new model type folders are introduced
    $typeFolderMap = [
      'lora' => 'loras',
      'checkpoint' => 'checkpoints'
    ];

    if (isset($typeFolderMap[$normalizedType])) {
      $typeFolder = $typeFolderMap[$normalizedType];
    } else {
      $typeFolder = strtolower(trim($modelType));
      $typeFolder = preg_replace('/[^a-z0-9]+/', '_', $typeFolder);
      $typeFolder = trim($typeFolder, '_');
      if ($typeFolder === '') {
        $typeFolder = 'loras';
      } elseif (substr($typeFolder, -1) !== 's') {
        $typeFolder .= 's';
      }
    }

    $modelBasePath = 'D:/AI/models/' . $typeFolder;
    $candidateBasePaths = [$modelBasePath];

    // Fallback candidates to tolerate historical type/path mismatches in DB rows
    foreach (['D:/AI/models/loras', 'D:/AI/models/checkpoints'] as $fallbackPath) {
      if (!in_array($fallbackPath, $candidateBasePaths, true)) {
        $candidateBasePaths[] = $fallbackPath;
      }
    }
  }

  // Find the file in the directory structure
  $oldFilePath = null;
  $newFilePath = null;
  $relativeFolder = null;

  $searchRoots = [];
  foreach ($candidateBasePaths as $candidatePath) {
    if (is_string($candidatePath) && $candidatePath !== '' && is_dir($candidatePath)) {
      $searchRoots[] = $candidatePath;
    }
  }

  if (empty($searchRoots)) {
    echo json_encode(['success' => false, 'error' => 'No valid model directories found to search']);
    exit;
  }

  $findFileRecursively = function ($rootPath, $targetFilename) {
    $iterator = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($rootPath, RecursiveDirectoryIterator::SKIP_DOTS),
      RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $file) {
      if ($file->isFile() && $file->getFilename() === $targetFilename) {
        return $file->getPathname();
      }
    }

    return null;
  };

  $findDirectoryRecursively = function ($rootPath, $targetDirectoryName) {
    if (!is_dir($rootPath)) {
      return null;
    }

    $iterator = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($rootPath, RecursiveDirectoryIterator::SKIP_DOTS),
      RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($iterator as $entry) {
      if ($entry->isDir() && $entry->getFilename() === $targetDirectoryName) {
        return $entry->getPathname();
      }
    }

    return null;
  };

  if ($renameFolderMode) {
    $oldDirectoryPath = null;
    $newDirectoryPath = null;

    if ($baseModel) {
      foreach ($searchRoots as $rootPath) {
        $targetFolder = $rootPath . DIRECTORY_SEPARATOR . $baseModel;

        if (is_dir($targetFolder)) {
          $directMatch = $targetFolder . DIRECTORY_SEPARATOR . $oldFilename;
          if (is_dir($directMatch)) {
            $oldDirectoryPath = $directMatch;
            $newDirectoryPath = $targetFolder . DIRECTORY_SEPARATOR . $newFilename;
            $relativeFolder = $baseModel;
            $modelBasePath = $rootPath;
            break;
          }

          $foundDir = $findDirectoryRecursively($targetFolder, $oldFilename);
          if ($foundDir) {
            $oldDirectoryPath = $foundDir;
            $parentFolder = dirname($foundDir);
            $newDirectoryPath = $parentFolder . DIRECTORY_SEPARATOR . $newFilename;
            $relativeFolder = str_replace($rootPath . DIRECTORY_SEPARATOR, '', $parentFolder);
            $relativeFolder = str_replace('\\', '/', $relativeFolder);
            $modelBasePath = $rootPath;
            break;
          }
        }
      }
    }

    if (!$oldDirectoryPath) {
      foreach ($searchRoots as $rootPath) {
        $foundDir = $findDirectoryRecursively($rootPath, $oldFilename);
        if ($foundDir) {
          $oldDirectoryPath = $foundDir;
          $parentFolder = dirname($foundDir);
          $newDirectoryPath = $parentFolder . DIRECTORY_SEPARATOR . $newFilename;
          $relativeFolder = str_replace($rootPath . DIRECTORY_SEPARATOR, '', $parentFolder);
          $relativeFolder = str_replace('\\', '/', $relativeFolder);
          $modelBasePath = $rootPath;
          break;
        }
      }
    }

    if (!$oldDirectoryPath) {
      if ($allowMissingFile && $modelId && $versionId) {
        $missingFileWarning = 'Folder not found for rename: ' . $oldFilename . '. Database filename was still updated.';
        $respondWithDbOnlyUpdate($missingFileWarning);
      }
      echo json_encode(['success' => false, 'error' => 'Folder not found for rename: ' . $oldFilename]);
      exit;
    }

    if (is_dir($newDirectoryPath) || file_exists($newDirectoryPath)) {
      echo json_encode(['success' => false, 'error' => 'A folder with that name already exists']);
      exit;
    }

    if (!rename($oldDirectoryPath, $newDirectoryPath)) {
      echo json_encode(['success' => false, 'error' => 'Failed to rename folder']);
      exit;
    }

    $oldFilePath = $oldDirectoryPath;
    $newFilePath = $newDirectoryPath;
  }
  
  // If baseModel is provided, try that folder first, then fall back to recursive search
  if (!$renameFolderMode && $baseModel) {
    foreach ($searchRoots as $rootPath) {
      $targetFolder = $rootPath . DIRECTORY_SEPARATOR . $baseModel;
      $candidateFilePath = $targetFolder . DIRECTORY_SEPARATOR . $oldFilenameWithExt;

      if (is_dir($targetFolder) && file_exists($candidateFilePath)) {
        $oldFilePath = $candidateFilePath;
        $newFilePath = $targetFolder . DIRECTORY_SEPARATOR . $newFilenameWithExt;
        $relativeFolder = $baseModel;
        $modelBasePath = $rootPath;
        break;
      }

      if (is_dir($targetFolder)) {
        $foundInTarget = $findFileRecursively($targetFolder, $oldFilenameWithExt);
        if ($foundInTarget) {
          $oldFilePath = $foundInTarget;
          $folder = dirname($foundInTarget);
          $newFilePath = $folder . DIRECTORY_SEPARATOR . $newFilenameWithExt;
          $relativeFolder = str_replace($rootPath . DIRECTORY_SEPARATOR, '', $folder);
          $relativeFolder = str_replace('\\', '/', $relativeFolder);
          $modelBasePath = $rootPath;
          break;
        }
      }
    }

    // Fallback: if exact baseModel path isn't found, search full roots
    if (!$oldFilePath) {
      foreach ($searchRoots as $rootPath) {
        $foundPath = $findFileRecursively($rootPath, $oldFilenameWithExt);
        if ($foundPath) {
          $oldFilePath = $foundPath;
          $folder = dirname($foundPath);
          $newFilePath = $folder . DIRECTORY_SEPARATOR . $newFilenameWithExt;
          $relativeFolder = str_replace($rootPath . DIRECTORY_SEPARATOR, '', $folder);
          $relativeFolder = str_replace('\\', '/', $relativeFolder);
          $modelBasePath = $rootPath;
          break;
        }
      }
    }

    if (!$oldFilePath) {
      if ($allowMissingFile && $modelId && $versionId) {
        $missingFileWarning = 'File not found for rename: ' . $oldFilenameWithExt . '. Database filename was still updated.';
        $respondWithDbOnlyUpdate($missingFileWarning);
      }
      echo json_encode(['success' => false, 'error' => 'File not found for rename: ' . $oldFilenameWithExt]);
      exit;
    }
  } elseif (!$renameFolderMode) {
    // Fallback: Search through all subdirectories (less precise, may cause issues with duplicate filenames)
    foreach ($searchRoots as $rootPath) {
      $foundPath = $findFileRecursively($rootPath, $oldFilenameWithExt);
      if ($foundPath) {
        $oldFilePath = $foundPath;
        $folder = dirname($foundPath);
        $newFilePath = $folder . DIRECTORY_SEPARATOR . $newFilenameWithExt;

        // Get relative folder path for database
        $relativeFolder = str_replace($rootPath . DIRECTORY_SEPARATOR, '', $folder);
        $relativeFolder = str_replace('\\', '/', $relativeFolder);
        $modelBasePath = $rootPath;
        break;
      }
    }
    
    if (!$oldFilePath) {
      if ($allowMissingFile && $modelId && $versionId) {
        $missingFileWarning = 'File not found: ' . $oldFilenameWithExt . '. Database filename was still updated.';
        $respondWithDbOnlyUpdate($missingFileWarning);
      }
      echo json_encode(['success' => false, 'error' => 'File not found: ' . $oldFilenameWithExt]);
      exit;
    }
  }
  
  // Check if new filename already exists
  if (!$renameFolderMode && file_exists($newFilePath)) {
    echo json_encode(['success' => false, 'error' => 'A file with that name already exists']);
    exit;
  }
  
  // Rename the physical file (folder mode already renamed above)
  if (!$renameFolderMode) {
    if (!rename($oldFilePath, $newFilePath)) {
      echo json_encode(['success' => false, 'error' => 'Failed to rename file']);
      exit;
    }
  }
  
  // Update database if modelId and versionId are provided
  // Store filename WITHOUT .safetensors extension in database
  if ($modelId && $versionId) {
    // Update the filename in the models table
    $stmt = $db->prepare("UPDATE models SET filename = ? WHERE model_id = ? AND version_id = ?");
    $stmt->bind_param("sii", $newFilename, $modelId, $versionId);
    
    if (!$stmt->execute()) {
      // Database update failed - try to revert file rename
      rename($newFilePath, $oldFilePath);
      echo json_encode(['success' => false, 'error' => 'Database update failed: ' . $stmt->error]);
      $stmt->close();
      $db->close();
      exit;
    }
    
    $affectedRows = $stmt->affected_rows;
    $stmt->close();
    $db->close();
    
    // Include affected rows in response for debugging
    echo json_encode([
      'success' => true,
      'oldFilename' => $oldFilename,
      'newFilename' => $newFilename,
      'folder' => $relativeFolder,
      'databaseUpdated' => true,
      'fileRenamed' => true,
      'affectedRows' => $affectedRows,
      'modelId' => $modelId,
      'versionId' => $versionId,
      'type' => $modelType,
      'modelBasePath' => $modelBasePath,
      'warning' => $missingFileWarning
    ]);
  } else {
    if ($db) {
      $db->close();
    }

    // No database update
    echo json_encode([
      'success' => true,
      'oldFilename' => $oldFilename,
      'newFilename' => $newFilename,
      'folder' => $relativeFolder,
      'databaseUpdated' => false,
      'reason' => 'Missing modelId or versionId',
      'modelId' => $modelId,
      'versionId' => $versionId,
      'modelBasePath' => $modelBasePath
    ]);
  }
  
} catch (Exception $e) {
  echo json_encode(['success' => false, 'error' => 'Exception: ' . $e->getMessage()]);
}
?>
