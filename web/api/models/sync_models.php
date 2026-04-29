<?php
require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../filename_utils.php';
api_set_json_header();

$conn = api_db_connect();

if( $conn->connect_error ) {
	api_send_error( 'Database connection failed: ' . $conn->connect_error, 500 );
}

$data = api_read_json_input();

if( !isset( $data['modelVersions'] ) ) {
	api_send_error( 'Missing required parameter: modelVersions', 400 );
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

	$url	= SITE_URL_API_REST . '/model-versions/' . $versionId;
	$ch		= curl_init();
	curl_setopt_array( $ch, [
		CURLOPT_URL							=> $url,
		CURLOPT_RETURNTRANSFER	=> true,
		CURLOPT_FOLLOWLOCATION	=> true,
		CURLOPT_MAXREDIRS				=> 5,
		CURLOPT_TIMEOUT					=> 30,
		CURLOPT_SSL_VERIFYPEER	=> false,
		CURLOPT_USERAGENT				=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		CURLOPT_HTTPHEADER			=> api_get_civitai_auth_headers()
	] );

	$response = curl_exec( $ch );
	$httpCode	= curl_getinfo( $ch, CURLINFO_HTTP_CODE );
	$error		= curl_error( $ch );

	if( $error || $httpCode !== 200 || !$response ) {
		$cache[$versionId] = null;
		return null;
	}

	$decoded = json_decode( $response, true);
	if( !is_array( $decoded ) ) {
		$cache[$versionId] = null;
		return null;
	}

	$selectedFile	= api_pick_download_file_from_files( $decoded['files'] ?? [] );
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

	$resolvedFilename = api_resolve_download_filename_from_url( $downloadUrl );
	if( !$resolvedFilename ) {
		$resolvedFilename = api_pick_download_filename_from_files( $decoded['files'] ?? [] );
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
		$originalFilenameRaw = api_pick_download_filename_from_files( $version['files'] ?? [] );
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

api_send_json( [
	'success'	=> true,
	'stats'		=> $stats,
	'message'	=> "Synced {$stats['inserted']} new records, updated {$stats['updated']} existing records"
] );
?>
