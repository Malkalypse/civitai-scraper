<?php
require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../filename_utils.php';

api_set_json_header();

$input			= json_decode(file_get_contents( 'php://input' ), true);
$versionId	= isset( $input['versionId'] ) ? ( int )$input['versionId'] : 0;

if( $versionId <= 0 ) {
	api_send_error( 'Missing or invalid versionId', 400 );
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

$response	= curl_exec( $ch );
$httpCode	= curl_getinfo( $ch, CURLINFO_HTTP_CODE );
$error		= curl_error( $ch );

if( $error ) {
	api_send_error( "cURL error: {$error}", 502 );
}

if( $httpCode !== 200 || !$response ) {
	api_send_error( "Failed to fetch model version {$versionId} (HTTP {$httpCode})", 502 );
}

$decoded = json_decode( $response, true );
if( !is_array( $decoded ) ) {
	api_send_error( 'Invalid JSON response from Civitai API', 502 );
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

$filename = api_resolve_download_filename_from_url( $downloadUrl );
if( !$filename ) {
	$filename = api_pick_download_filename_from_files( $decoded['files'] ?? [] );
}

if( $filename ) {
	$filename = trim( $filename );
}

api_send_json( [
	'success'			=> true,
	'versionId'		=> $versionId,
	'filename'		=> $filename,
	'downloadUrl'	=> $downloadUrl
] );
