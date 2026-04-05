<?php
/**
 * Get Models Folder Structure
 *
 * - Returns folder and file structure for models, optionally filtered by type.
 */

header( 'Content-Type: application/json' );
require_once __DIR__ . '/../debug.php';

function collectExistingFileNames($basePath) {
	debug_api_to_console('collectExistingFileNames reached: basePath=' . $basePath);
	$names = [];

	if (!is_dir($basePath)) {
		return $names;
	}

	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator($basePath, RecursiveDirectoryIterator::SKIP_DOTS),
		RecursiveIteratorIterator::SELF_FIRST
	);

	foreach ($iterator as $entry) {
		if ($entry->isDir()) {
			$dirName = $entry->getFilename();
			$dirNameLower = strtolower($dirName);
			$dirNameNoExtLower = strtolower(pathinfo($dirName, PATHINFO_FILENAME));

			$names[$dirNameLower] = true;
			$names[$dirNameNoExtLower] = true;
			continue;
		}

		if (!$entry->isFile()) {
			continue;
		}

		$fileName = $entry->getFilename();
		$fileNameLower = strtolower($fileName);
		$fileNameNoExtLower = strtolower(pathinfo($fileName, PATHINFO_FILENAME));

		$names[$fileNameLower] = true;
		$names[$fileNameNoExtLower] = true;
	}

	return $names;
}

// Database connection
$host = 'localhost';
$user = 'root';
$pass = '';
$dbname = 'civitai_models';

$conn = new mysqli($host, $user, $pass, $dbname);

if ($conn->connect_error) {
	flush_api_debug_header();
	echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
	exit;
}

try {
	$type = isset($_GET['type']) ? trim($_GET['type']) : '';

	$whereSql = '';
	$params = [];
	$paramTypes = '';
	$typeFolderPath = null;

	if ($type !== '') {
		$normalizedType = strtoupper($type);

		$typeAliases = [
			'LORA' => [
				'dbType' => 'LORA',
				'folderPath' => 'D:/AI/models/loras'
			],
			'CHECKPOINT' => [
				'dbType' => 'CHECKPOINT',
				'folderPath' => 'D:/AI/models/checkpoints'
			]
		];

		if (!isset($typeAliases[$normalizedType])) {
			flush_api_debug_header();
			echo json_encode(['error' => 'Invalid model type']);
			$conn->close();
			exit;
		}

		$dbType = $typeAliases[$normalizedType]['dbType'];
		$typeFolderPath = $typeAliases[$normalizedType]['folderPath'];
		$whereSql = 'WHERE UPPER(type) = ?';
		$paramTypes = 's';
		$params[] = $dbType;
	}

	$existingFileNames = $typeFolderPath ? collectExistingFileNames($typeFolderPath) : [];

	$query = "SELECT model_id, version_id, base_model, filename
						FROM models
						{$whereSql}
						ORDER BY filename";

	$stmt = $conn->prepare($query);
	if (!$stmt) {
		throw new Exception('Database prepare failed: ' . $conn->error);
	}

	if ($paramTypes !== '') {
		$stmt->bind_param($paramTypes, ...$params);
	}

	if (!$stmt->execute()) {
		throw new Exception('Database query failed: ' . $stmt->error);
	}

	$result = $stmt->get_result();

	// Organize by folder (using base_model as folder name)
	$folderMap = [];

	while ($row = $result->fetch_assoc()) {
		$folderName = $row['base_model'] ?: 'Unknown';
		$rawFileName = (string)$row['filename'];
		$fileName = pathinfo($rawFileName, PATHINFO_FILENAME);

		$exists = true;
		if ($typeFolderPath) {
			$candidateKeys = [
				strtolower($rawFileName),
				strtolower(pathinfo($rawFileName, PATHINFO_FILENAME)),
				strtolower($fileName),
				strtolower($fileName . '.safetensors'),
				strtolower($fileName . '.zip')
			];

			$exists = false;
			foreach ($candidateKeys as $key) {
				if ($key !== '' && isset($existingFileNames[$key])) {
					$exists = true;
					break;
				}
			}
		}

		if (!isset($folderMap[$folderName])) {
			$folderMap[$folderName] = [];
		}

		$folderMap[$folderName][] = [
			'name' => $fileName,
			'modelId' => $row['model_id'],
			'versionId' => $row['version_id'],
			'exists' => $exists
		];
	}

	// Convert to structure format and sort
	$structure = [];
	foreach ($folderMap as $folderName => $files) {
		usort($files, function ($a, $b) {
			return strcasecmp($a['name'], $b['name']);
		});

		$structure[] = [
			'folder' => $folderName,
			'files' => $files
		];
	}

	usort($structure, function ($a, $b) {
		return strcmp($a['folder'], $b['folder']);
	});

	flush_api_debug_header();
	echo json_encode([
		'success' => true,
		'data' => $structure
	]);

	$stmt->close();
	$conn->close();
} catch (Exception $e) {
	if (isset($stmt) && $stmt instanceof mysqli_stmt) {
		$stmt->close();
	}
	if (isset($conn)) {
		$conn->close();
	}
	flush_api_debug_header();
	echo json_encode(['error' => 'Exception: ' . $e->getMessage()]);
}
