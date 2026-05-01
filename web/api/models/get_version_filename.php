<?php
require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../filename_utils.php';

ApiResponse::setJsonHeader();

$input			= json_decode(file_get_contents( 'php://input' ), true);
$versionId	= isset( $input['versionId'] ) ? ( int )$input['versionId'] : 0;

if( $versionId <= 0 ) {
	ApiResponse::sendError( 'Missing or invalid versionId', 400 );
}

$url = SITE_URL_API_REST . '/model-versions/' . $versionId;
$httpResult = HttpClient::get(
  $url,
  30,
  FilenameResolver::getCivitaiAuthHeaders()
);

if ($httpResult['error']) {
  ApiResponse::sendError("cURL error: {$httpResult['error']}", 502);
}
if ($httpResult['httpCode'] !== 200 || !$httpResult['ok']) {
  ApiResponse::sendError("Failed to fetch model version {$versionId} (HTTP {$httpResult['httpCode']})", 502);
}

$decoded = json_decode($httpResult['body'], true);
if( !is_array( $decoded ) ) {
	ApiResponse::sendError( 'Invalid JSON response from Civitai API', 502 );
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

$filename = FilenameResolver::resolveDownloadFilenameFromUrl( $downloadUrl );
if( !$filename ) {
	$filename = FilenameResolver::pickDownloadFilenameFromFiles( $decoded['files'] ?? [] );
}

if( $filename ) {
	$filename = trim( $filename );
}

ApiResponse::sendJson( [
	'success'			=> true,
	'versionId'		=> $versionId,
	'filename'		=> $filename,
	'downloadUrl'	=> $downloadUrl
] );
