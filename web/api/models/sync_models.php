<?php
require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../filename_utils.php';
ApiResponse::setJsonHeader();

$conn = api_db_connect();

if( $conn->connect_error ) {
	ApiResponse::sendError( 'Database connection failed: ' . $conn->connect_error, 500 );
}

$data = ApiResponse::readJsonInput();

if( !isset( $data['modelVersions'] ) ) {
	ApiResponse::sendError( 'Missing required parameter: modelVersions', 400 );
}

$modelVersions		= $data['modelVersions'];
$filename					= isset( $data['filename'] ) ? trim( $data['filename'] ) : null;
$filenameEscaped	= ( $filename !== null && $filename !== '' ) ? $conn->real_escape_string( $filename ) : null;
$modelType				= isset( $data['modelType'] ) ? trim( $data['modelType'] ) : 'LoRA';
if( $modelType === '' ) {
	$modelType = 'LoRA';
}
$modelType = $conn->real_escape_string( $modelType );
$stats = ['inserted' => 0, 'updated' => 0, 'errors' => []];

/** Fetch version filename from Civitai API, with caching
 * @param mixed $versionId Version ID to fetch filename for
 * @return mixed Resolved filename or null if cannot be determined
 */
function fetchVersionFilenameFromApi( $versionId ) {
	if( !$versionId ) {
		return null;
	}

	static $cache = [];
	if( isset( $cache[$versionId] ) ) {
		return $cache[$versionId];
	}

	$url = SITE_URL_API_REST . '/model-versions/' . $versionId;
	$httpResult = HttpClient::get(
		$url,
		30,
		FilenameResolver::getCivitaiAuthHeaders()
	);

	if( $httpResult['error'] || $httpResult['httpCode'] !== 200 || !$httpResult['ok'] ) {
		$cache[$versionId] = null;
		return null;
	}

	$decoded = json_decode( $httpResult['body'], true );
	if( !is_array( $decoded ) ) {
		$cache[$versionId] = null;
		return null;
	}

	$selectedFile	= FilenameResolver::pickDownloadFileFromFiles( $decoded['files'] ?? [] );
	$downloadUrl	= $selectedFile['downloadUrl'] ?? ( $decoded['downloadUrl'] ?? null );

	if( $downloadUrl && !empty( $selectedFile['metadata'] ) && is_array( $selectedFile['metadata'] ) ) {
		$queryParts = [];

		if( !empty( $selectedFile['type'] ) ) {
			$queryParts['type'] = $selectedFile['type'];
		}

		foreach( ['format', 'size', 'fp'] as $metaKey ) {
			if( !empty( $selectedFile['metadata'][$metaKey] ) ) {
				$queryParts[$metaKey] = $selectedFile['metadata'][$metaKey];
			}
		}

		if( !empty( $queryParts ) ) {
			$separator = ( strpos( $downloadUrl, '?' ) !== false ) ? '&' : '?';
			$downloadUrl .= $separator . http_build_query( $queryParts );
		}
	}

	$resolvedFilename = FilenameResolver::resolveDownloadFilenameFromUrl( $downloadUrl );
	if( !$resolvedFilename ) {
		$resolvedFilename = FilenameResolver::pickDownloadFilenameFromFiles( $decoded['files'] ?? [] );
	}

	$cache[$versionId] = $resolvedFilename ? trim( $resolvedFilename ) : null;
	return $cache[$versionId];
}

// Process each model version
foreach( $modelVersions as $version ) {
	$modelId		= isset( $version['modelId'] ) ? intval( $version['modelId'] ) : null;
	$versionId	= isset( $version['id'] ) ? intval( $version['id'] ) : null;
	$baseModel	= isset( $version['baseModel'] ) ? $conn->real_escape_string( $version['baseModel'] ) : null;
	
	// Get canonical download filename from Civitai API, then fallback to provided version files
	$originalFilenameRaw = fetchVersionFilenameFromApi( $versionId );
	if( !$originalFilenameRaw ) {
		$originalFilenameRaw = FilenameResolver::pickDownloadFilenameFromFiles( $version['files'] ?? [] );
	}
	$originalFilename = $originalFilenameRaw ? $conn->real_escape_string( $originalFilenameRaw ) : null;
	
	if( $modelId === null || $versionId === null ) {
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
	
	if( $conn->query( $sql ) === TRUE ) {
		if( $conn->affected_rows > 0 ) {
			if( $conn->insert_id > 0 ) {
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

ApiResponse::sendJson( [
	'success'	=> true,
	'stats'		=> $stats,
	'message'	=> "Synced {$stats['inserted']} new records, updated {$stats['updated']} existing records"
] );
?>
