<?php
require_once __DIR__ . '/../../config/site.php';
header('Content-Type: application/json');

/** Get civitai auth headers
 * @return array array of headers or empty array if no token is set
 */
function getCivitaiAuthHeaders() {
	$token = getenv( 'CIVITAI_API_TOKEN' );
	if( !$token || trim( $token ) === '' ) {
		return [];
	}
	return ['Authorization: Bearer ' . trim( $token )];
}

$input			= json_decode(file_get_contents( 'php://input' ), true);
$versionId	= isset( $input['versionId'] ) ? ( int )$input['versionId'] : 0;

if( $versionId <= 0 ) {
	http_response_code( 400 );
	echo json_encode( ['error' => 'Missing or invalid versionId'] );
	exit;
}

/** Pick download filename from files array
 * @param mixed $files Files array from model version data
 * @return string|null Resulting filename or null if not found
 */
function pickDownloadFilenameFromFiles( $files ) {
	if( !is_array( $files ) || empty( $files ) ) {
		return null;
	}

	foreach( $files as $file ) {
		if( !empty( $file['primary'] ) && !empty( $file['name'] ) ) {
			return $file['name'];
		}
	}

	foreach( $files as $file ) {
		if( ( $file['type'] ?? null ) === 'Model' && !empty( $file['name'] ) ) {
			return $file['name'];
		}
	}

	foreach( $files as $file ) {
		if( !empty( $file['name'] ) && substr( $file['name'], -12 ) === '.safetensors' ) {
			return $file['name'];
		}
	}

	foreach( $files as $file ) {
		if( !empty( $file['name'] ) ) {
			return $file['name'];
		}
	}

	return null;
}

/** Pick download file from files array
 * @param mixed $files Files array from model version data
 * @return mixed Resulting file array or null if not found
 */
function pickDownloadFileFromFiles( $files ) {
	if( !is_array( $files ) || empty( $files ) ) {
		return null;
	}

	foreach( $files as $file ) {
		if( !empty( $file['primary'] ) && !empty( $file['name'] ) ) {
			return $file;
		}
	}

	foreach( $files as $file ) {
		if( ( $file['type'] ?? null ) === 'Model' && !empty( $file['name'] ) ) {
			return $file;
		}
	}

	foreach( $files as $file ) {
		if( !empty( $file['name'] ) && substr( $file['name'], -12 ) === '.safetensors' ) {
			return $file;
		}
	}

	foreach( $files as $file ) {
		if( !empty( $file['name'] ) ) {
			return $file;
		}
	}

	return null;
}

/** Extract filename from Content-Disposition header
 * @param mixed $headerValue Content-Disposition header value
 * @return mixed Extracted filename (null if not found)
 */
function extractFilenameFromContentDisposition( $headerValue ) {
	if( !is_string( $headerValue ) || trim( $headerValue ) === '' ) {
		return null;
	}

	if( preg_match( '/filename\*=([^\'\s;]+)\'\'([^;\r\n]+)/i', $headerValue, $matches ) ) {
		return rawurldecode( trim( $matches[2], " \t\n\r\0\x0B\"'" ) );
	}

	if( preg_match( '/filename="([^"]+)"/i', $headerValue, $matches ) ) {
		return trim( $matches[1] );
	}

	if( preg_match( '/filename=([^;\r\n]+)/i', $headerValue, $matches ) ) {
		return trim( $matches[1], " \t\n\r\0\x0B\"'" );
	}

	return null;
}

/** Normalize filename candidate by validating and sanitizing it
 * @param mixed $filename Candidate filename to normalize
 * @return mixed Normalized filename (null if invalid)
 */
function normalizeFilenameCandidate( $filename ) {
	if( !is_string( $filename ) ) {
		return null;
	}

	$filename = trim( $filename );
	if( $filename === '' ) {
		return null;
	}

	$filename = str_replace( ["\r", "\n", "\0"], '', $filename );
	$filename = basename( $filename );

	$lower = strtolower( $filename );
	if ( $lower === 'login' || $lower === 'signin' || $lower === 'authorize' ) {
		return null;
	}

	if ( strpos( $filename, '.' ) === false ) {
		return null;
	}

	return $filename !== '' ? $filename : null;
}

/** Resolve filename from effective URL by extracting the last path segment and validating it
 * @param mixed $effectiveUrl Effective URL to extract filename from
 * @return mixed Resolved filename or null if not valid or cannot be extracted
 */
function resolveFilenameFromEffectiveUrl( $effectiveUrl ) {
	if( !is_string( $effectiveUrl ) || trim( $effectiveUrl ) === '') {
		return null;
	}

	$path = parse_url( $effectiveUrl, PHP_URL_PATH );
	if( !is_string( $path ) || $path === '' ) {
		return null;
	}

	if( preg_match('#/(login|signin|authorize)(/|$)#i', $path ) ) {
		return null;
	}

	$name = basename( $path );
	if( !is_string( $name ) || $name === '' || $name === 'download' ) {
		return null;
	}

	return rawurldecode( $name );
}

/** Resolve download filename from a given download URL by performing HTTP HEAD and GET requests to extract filename from headers or effective URL
 * @param mixed $downloadUrl Download URL to resolve filename from
 * @return mixed Resolved filename or null if not found
 */
function resolveDownloadFilenameFromUrl( $downloadUrl ) {
	if( !$downloadUrl ) {
		return null;
	}

	static $urlCache = [];
	if( isset( $urlCache[$downloadUrl] ) ) {
		return $urlCache[$downloadUrl];
	}

	$lastContentDisposition	= null;
	$effectiveUrl						= null;

	$ch = curl_init();
	curl_setopt_array( $ch, [
		CURLOPT_URL							=> $downloadUrl,
		CURLOPT_NOBODY					=> true,
		CURLOPT_HEADER					=> false,
		CURLOPT_FOLLOWLOCATION	=> true,
		CURLOPT_MAXREDIRS				=> 8,
		CURLOPT_TIMEOUT					=> 30,
		CURLOPT_SSL_VERIFYPEER	=> false,
		CURLOPT_USERAGENT				=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		CURLOPT_HTTPHEADER			=> getCivitaiAuthHeaders(),
		CURLOPT_HEADERFUNCTION	=> function( $ch, $headerLine ) use( &$lastContentDisposition ) {
			if( stripos( $headerLine, 'Content-Disposition:' ) === 0 ) {
				$lastContentDisposition = trim( substr( $headerLine, strlen( 'Content-Disposition:' ) ) );
			}
			return strlen( $headerLine );
		}
	]);

	curl_exec( $ch );
	$headError		= curl_error( $ch );
	$headHttpCode	= curl_getinfo( $ch, CURLINFO_HTTP_CODE );
	$effectiveUrl	= curl_getinfo( $ch, CURLINFO_EFFECTIVE_URL );

	$resolved = normalizeFilenameCandidate( extractFilenameFromContentDisposition( $lastContentDisposition ) );
	if( !$resolved && !$headError && $headHttpCode >= 200 && $headHttpCode < 400 ) {
		$resolved = normalizeFilenameCandidate( resolveFilenameFromEffectiveUrl( $effectiveUrl ) );
	}

	if( !$resolved ) {
		$lastContentDisposition	= null;
		$effectiveUrl						= null;

		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL							=> $downloadUrl,
			CURLOPT_RETURNTRANSFER	=> true,
			CURLOPT_FOLLOWLOCATION	=> true,
			CURLOPT_MAXREDIRS				=> 8,
			CURLOPT_TIMEOUT					=> 30,
			CURLOPT_SSL_VERIFYPEER	=> false,
			CURLOPT_USERAGENT				=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER			=> getCivitaiAuthHeaders(),
			CURLOPT_RANGE						=> '0-0',
			CURLOPT_HEADERFUNCTION	=> function( $ch, $headerLine ) use( &$lastContentDisposition ) {
				if( stripos( $headerLine, 'Content-Disposition:' ) === 0 ) {
					$lastContentDisposition = trim( substr( $headerLine, strlen( 'Content-Disposition:' ) ) );
				}
				return strlen( $headerLine );
			}
		] );

		curl_exec( $ch );
		$getError			= curl_error( $ch );
		$getHttpCode	= curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$effectiveUrl	= curl_getinfo( $ch, CURLINFO_EFFECTIVE_URL );

		if( !$getError && $getHttpCode >= 200 && $getHttpCode < 400 ) {
			$resolved = normalizeFilenameCandidate( extractFilenameFromContentDisposition( $lastContentDisposition ) );
			if( !$resolved ) {
				$resolved = normalizeFilenameCandidate( resolveFilenameFromEffectiveUrl( $effectiveUrl ) );
			}
		}
	}

	$urlCache[$downloadUrl] = $resolved ? trim( $resolved ) : null;
	return $urlCache[$downloadUrl];
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
	CURLOPT_HTTPHEADER			=> getCivitaiAuthHeaders()
] );

$response	= curl_exec( $ch );
$httpCode	= curl_getinfo( $ch, CURLINFO_HTTP_CODE );
$error		= curl_error( $ch );

if( $error ) {
	http_response_code( 502 );
	echo json_encode( ['error' => "cURL error: {$error}"] );
	exit;
}

if( $httpCode !== 200 || !$response ) {
	http_response_code( 502 );
	echo json_encode( ['error' => "Failed to fetch model version {$versionId} (HTTP {$httpCode})"] );
	exit;
}

$decoded = json_decode( $response, true );
if( !is_array( $decoded ) ) {
	http_response_code( 502 );
	echo json_encode( ['error' => 'Invalid JSON response from Civitai API'] );
	exit;
}

$selectedFile	= pickDownloadFileFromFiles( $decoded['files'] ?? [] );
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

$filename = resolveDownloadFilenameFromUrl( $downloadUrl );
if( !$filename ) {
	$filename = pickDownloadFilenameFromFiles( $decoded['files'] ?? [] );
}

if( $filename ) {
	$filename = trim( $filename );
}

echo json_encode( [
	'success'			=> true,
	'versionId'		=> $versionId,
	'filename'		=> $filename,
	'downloadUrl'	=> $downloadUrl
] );
