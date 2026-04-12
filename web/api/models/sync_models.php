<?php
require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$conn = api_db_connect();

if ($conn->connect_error) {
	api_send_error('Database connection failed: ' . $conn->connect_error, 500);
}

$data = api_read_json_input();

if (!isset($data['modelVersions'])) {
	api_send_error('Missing required parameter: modelVersions', 400);
}

$modelVersions = $data['modelVersions'];
$filename = isset($data['filename']) ? trim($data['filename']) : null;
$filenameEscaped = ($filename !== null && $filename !== '') ? $conn->real_escape_string($filename) : null;
$modelType = isset($data['modelType']) ? trim($data['modelType']) : 'LoRA';
if ($modelType === '') {
	$modelType = 'LoRA';
}
$modelType = $conn->real_escape_string($modelType);
$stats = ['inserted' => 0, 'updated' => 0, 'errors' => []];

function getCivitaiAuthHeaders() {
	$token = getenv('CIVITAI_API_TOKEN');
	if (!$token || trim($token) === '') {
		return [];
	}
	return ['Authorization: Bearer ' . trim($token)];
}

function pickDownloadFilenameFromFiles($files) {
	if (!is_array($files) || empty($files)) {
		return null;
	}

	foreach ($files as $file) {
		if (!empty($file['primary']) && !empty($file['name'])) {
			return $file['name'];
		}
	}

	foreach ($files as $file) {
		if (($file['type'] ?? null) === 'Model' && !empty($file['name'])) {
			return $file['name'];
		}
	}

	foreach ($files as $file) {
		if (!empty($file['name']) && substr($file['name'], -12) === '.safetensors') {
			return $file['name'];
		}
	}

	foreach ($files as $file) {
		if (!empty($file['name'])) {
			return $file['name'];
		}
	}

	return null;
}

function pickDownloadFileFromFiles($files) {
	if (!is_array($files) || empty($files)) {
		return null;
	}

	foreach ($files as $file) {
		if (!empty($file['primary']) && !empty($file['name'])) {
			return $file;
		}
	}

	foreach ($files as $file) {
		if (($file['type'] ?? null) === 'Model' && !empty($file['name'])) {
			return $file;
		}
	}

	foreach ($files as $file) {
		if (!empty($file['name']) && substr($file['name'], -12) === '.safetensors') {
			return $file;
		}
	}

	foreach ($files as $file) {
		if (!empty($file['name'])) {
			return $file;
		}
	}

	return null;
}

function extractFilenameFromContentDisposition($headerValue) {
	if (!is_string($headerValue) || trim($headerValue) === '') {
		return null;
	}

	if (preg_match('/filename\*=([^\'\s;]+)\'\'([^;\r\n]+)/i', $headerValue, $matches)) {
		return rawurldecode(trim($matches[2], " \t\n\r\0\x0B\"'"));
	}

	if (preg_match('/filename="([^"]+)"/i', $headerValue, $matches)) {
		return trim($matches[1]);
	}

	if (preg_match('/filename=([^;\r\n]+)/i', $headerValue, $matches)) {
		return trim($matches[1], " \t\n\r\0\x0B\"'");
	}

	return null;
}

function normalizeFilenameCandidate($filename) {
	if (!is_string($filename)) {
		return null;
	}

	$filename = trim($filename);
	if ($filename === '') {
		return null;
	}

	$filename = str_replace(["\r", "\n", "\0"], '', $filename);
	$filename = basename($filename);

	$lower = strtolower($filename);
	if ($lower === 'login' || $lower === 'signin' || $lower === 'authorize') {
		return null;
	}

	if (strpos($filename, '.') === false) {
		return null;
	}

	return $filename !== '' ? $filename : null;
}

function resolveFilenameFromEffectiveUrl($effectiveUrl) {
	if (!is_string($effectiveUrl) || trim($effectiveUrl) === '') {
		return null;
	}

	$path = parse_url($effectiveUrl, PHP_URL_PATH);
	if (!is_string($path) || $path === '') {
		return null;
	}

	if (preg_match('#/(login|signin|authorize)(/|$)#i', $path)) {
		return null;
	}

	$name = basename($path);
	if (!is_string($name) || $name === '' || $name === 'download') {
		return null;
	}

	return rawurldecode($name);
}

function resolveDownloadFilenameFromUrl($downloadUrl) {
	if (!$downloadUrl) {
		return null;
	}

	static $urlCache = [];
	if (isset($urlCache[$downloadUrl])) {
		return $urlCache[$downloadUrl];
	}

	$lastContentDisposition = null;
	$effectiveUrl = null;

	$ch = curl_init();
	curl_setopt_array($ch, [
		CURLOPT_URL => $downloadUrl,
		CURLOPT_NOBODY => true,
		CURLOPT_HEADER => false,
		CURLOPT_FOLLOWLOCATION => true,
		CURLOPT_MAXREDIRS => 8,
		CURLOPT_TIMEOUT => 30,
		CURLOPT_SSL_VERIFYPEER => false,
		CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		CURLOPT_HTTPHEADER => getCivitaiAuthHeaders(),
		CURLOPT_HEADERFUNCTION => function ($ch, $headerLine) use (&$lastContentDisposition) {
			if (stripos($headerLine, 'Content-Disposition:') === 0) {
				$lastContentDisposition = trim(substr($headerLine, strlen('Content-Disposition:')));
			}
			return strlen($headerLine);
		}
	]);

	curl_exec($ch);
	$headError = curl_error($ch);
	$headHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	$effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);

	$resolved = normalizeFilenameCandidate(extractFilenameFromContentDisposition($lastContentDisposition));
	if (!$resolved && !$headError && $headHttpCode >= 200 && $headHttpCode < 400) {
		$resolved = normalizeFilenameCandidate(resolveFilenameFromEffectiveUrl($effectiveUrl));
	}

	if (!$resolved) {
		$lastContentDisposition = null;
		$effectiveUrl = null;

		$ch = curl_init();
		curl_setopt_array($ch, [
			CURLOPT_URL => $downloadUrl,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_MAXREDIRS => 8,
			CURLOPT_TIMEOUT => 30,
			CURLOPT_SSL_VERIFYPEER => false,
			CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER => getCivitaiAuthHeaders(),
			CURLOPT_RANGE => '0-0',
			CURLOPT_HEADERFUNCTION => function ($ch, $headerLine) use (&$lastContentDisposition) {
				if (stripos($headerLine, 'Content-Disposition:') === 0) {
					$lastContentDisposition = trim(substr($headerLine, strlen('Content-Disposition:')));
				}
				return strlen($headerLine);
			}
		]);

		curl_exec($ch);
		$getError = curl_error($ch);
		$getHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);

		if (!$getError && $getHttpCode >= 200 && $getHttpCode < 400) {
			$resolved = normalizeFilenameCandidate(extractFilenameFromContentDisposition($lastContentDisposition));
			if (!$resolved) {
				$resolved = normalizeFilenameCandidate(resolveFilenameFromEffectiveUrl($effectiveUrl));
			}
		}
	}

	$urlCache[$downloadUrl] = $resolved ? trim($resolved) : null;
	return $urlCache[$downloadUrl];
}

function fetchVersionFilenameFromApi($versionId) {
	if (!$versionId) {
		return null;
	}

	static $cache = [];
	if (isset($cache[$versionId])) {
		return $cache[$versionId];
	}

	$url = "https://civitai.com/api/v1/model-versions/{$versionId}";
	$ch = curl_init();
	curl_setopt_array($ch, [
		CURLOPT_URL => $url,
		CURLOPT_RETURNTRANSFER => true,
		CURLOPT_FOLLOWLOCATION => true,
		CURLOPT_MAXREDIRS => 5,
		CURLOPT_TIMEOUT => 30,
		CURLOPT_SSL_VERIFYPEER => false,
		CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		CURLOPT_HTTPHEADER => getCivitaiAuthHeaders()
	]);

	$response = curl_exec($ch);
	$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	$error = curl_error($ch);

	if ($error || $httpCode !== 200 || !$response) {
		$cache[$versionId] = null;
		return null;
	}

	$decoded = json_decode($response, true);
	if (!is_array($decoded)) {
		$cache[$versionId] = null;
		return null;
	}

	$selectedFile = pickDownloadFileFromFiles($decoded['files'] ?? []);
	$downloadUrl = $selectedFile['downloadUrl'] ?? ($decoded['downloadUrl'] ?? null);

	if ($downloadUrl && !empty($selectedFile['metadata']) && is_array($selectedFile['metadata'])) {
		$queryParts = [];

		if (!empty($selectedFile['type'])) {
			$queryParts['type'] = $selectedFile['type'];
		}

		foreach (['format', 'size', 'fp'] as $metaKey) {
			if (!empty($selectedFile['metadata'][$metaKey])) {
				$queryParts[$metaKey] = $selectedFile['metadata'][$metaKey];
			}
		}

		if (!empty($queryParts)) {
			$separator = (strpos($downloadUrl, '?') !== false) ? '&' : '?';
			$downloadUrl .= $separator . http_build_query($queryParts);
		}
	}

	$resolvedFilename = resolveDownloadFilenameFromUrl($downloadUrl);
	if (!$resolvedFilename) {
		$resolvedFilename = pickDownloadFilenameFromFiles($decoded['files'] ?? []);
	}

	$cache[$versionId] = $resolvedFilename ? trim($resolvedFilename) : null;
	return $cache[$versionId];
}

// Process each model version
foreach ($modelVersions as $version) {
	$modelId = isset($version['modelId']) ? intval($version['modelId']) : null;
	$versionId = isset($version['id']) ? intval($version['id']) : null;
	$baseModel = isset($version['baseModel']) ? $conn->real_escape_string($version['baseModel']) : null;
	
	// Get canonical download filename from Civitai API, then fallback to provided version files
	$originalFilenameRaw = fetchVersionFilenameFromApi($versionId);
	if (!$originalFilenameRaw) {
		$originalFilenameRaw = pickDownloadFilenameFromFiles($version['files'] ?? []);
	}
	$originalFilename = $originalFilenameRaw ? $conn->real_escape_string($originalFilenameRaw) : null;
	
	if ($modelId === null || $versionId === null) {
		$stats['errors'][] = "Missing model_id or version_id for a version";
		continue;
	}
	
	// Insert or update the model
	$sql = "INSERT INTO models (model_id, version_id, type, base_model, original_filename, filename) 
			VALUES ($modelId, $versionId, " . 
			"'$modelType', " . 
			($baseModel ? "'$baseModel'" : "NULL") . ", " . 
			($originalFilename ? "'$originalFilename'" : "NULL") . ", " . 
			($filenameEscaped ? "'$filenameEscaped'" : "NULL") . ") 
			ON DUPLICATE KEY UPDATE 
				type = VALUES(type),
				base_model = VALUES(base_model), 
				original_filename = VALUES(original_filename),
				filename = VALUES(filename)";
	
	if ($conn->query($sql) === TRUE) {
		if ($conn->affected_rows > 0) {
			if ($conn->insert_id > 0) {
				$stats['inserted']++;
			} else {
				$stats['updated']++;
			}
		}
	} else {
		$stats['errors'][] = "SQL Error for model $modelId version $versionId: " . $conn->error;
	}
}

$conn->close();

echo json_encode([
	'success' => true,
	'stats' => $stats,
	'message' => "Synced {$stats['inserted']} new records, updated {$stats['updated']} existing records"
]);
?>
