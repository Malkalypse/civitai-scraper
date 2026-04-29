<?php

/** Get Civitai auth headers if token set in environment.
 * @return array Auth headers array or empty array if token not set
 */
function api_get_civitai_auth_headers() {
	$token = getenv( 'CIVITAI_API_TOKEN' );
	if( !$token || trim( $token ) === '' ) {
		return [];
	}

	return ['Authorization: Bearer ' . trim( $token )];
}

/** Pick download filename from files array.
 * @param mixed $files Files array from model version data
 * @return string|null Resulting filename or null if not found
 */
function api_pick_download_filename_from_files( $files ) {
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

/** Pick download file from files array.
 * @param mixed $files Files array from model version data
 * @return mixed Resulting file array or null if not found
 */
function api_pick_download_file_from_files( $files ) {
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

/** Extract filename from Content-Disposition header value.
 * @param mixed $headerValue Content-Disposition header value
 * @return mixed Extracted filename or null if not found
 */
function api_extract_filename_from_content_disposition( $headerValue ) {
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

/** Normalize filename candidate by trimming, removing dangerous characters, and filtering invalid names.
 * @param mixed $filename Candidate filename to normalize
 * @return mixed Normalized filename or null if invalid
 */
function api_normalize_filename_candidate( $filename ) {
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
	if( $lower === 'login' || $lower === 'signin' || $lower === 'authorize' ) {
		return null;
	}

	if( strpos( $filename, '.' ) === false ) {
		return null;
	}

	return $filename !== '' ? $filename : null;
}

/** Resolve filename from effective URL by extracting the path and applying filters.
 * @param mixed $effectiveUrl Effective URL to resolve filename from
 * @return mixed Resolved filename or null if cannot be determined
 */
function api_resolve_filename_from_effective_url( $effectiveUrl ) {
	if( !is_string( $effectiveUrl ) || trim( $effectiveUrl ) === '' ) {
		return null;
	}

	$path = parse_url( $effectiveUrl, PHP_URL_PATH );
	if( !is_string( $path ) || $path === '' ) {
		return null;
	}

	if( preg_match( '#/(login|signin|authorize)(/|$)#i', $path ) ) {
		return null;
	}

	$name = basename( $path );
	if( !is_string( $name ) || $name === '' || $name === 'download' ) {
		return null;
	}

	return rawurldecode( $name );
}

/** Resolve download filename from URL by checking Content-Disposition header and effective URL.
 * @param mixed $downloadUrl Download URL to resolve filename from
 * @return mixed Resolved filename (null if cannot be determined)
 */
function api_resolve_download_filename_from_url( $downloadUrl ) {
	if( !$downloadUrl ) {
		return null;
	}

	static $urlCache = [];
	if( isset( $urlCache[$downloadUrl] ) ) {
		return $urlCache[$downloadUrl];
	}

	$lastContentDisposition = null;
	$effectiveUrl = null;

	$ch = curl_init();
	curl_setopt_array( $ch, [
		CURLOPT_URL => $downloadUrl,
		CURLOPT_NOBODY => true,
		CURLOPT_HEADER => false,
		CURLOPT_FOLLOWLOCATION => true,
		CURLOPT_MAXREDIRS => 8,
		CURLOPT_TIMEOUT => 30,
		CURLOPT_SSL_VERIFYPEER => false,
		CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		CURLOPT_HTTPHEADER => api_get_civitai_auth_headers(),
		CURLOPT_HEADERFUNCTION => function( $ch, $headerLine ) use( &$lastContentDisposition ) {
			if( stripos( $headerLine, 'Content-Disposition:' ) === 0 ) {
				$lastContentDisposition = trim( substr( $headerLine, strlen( 'Content-Disposition:' ) ) );
			}
			return strlen( $headerLine );
		}
	] );

	curl_exec( $ch );
	$headError = curl_error( $ch );
	$headHttpCode = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
	$effectiveUrl = curl_getinfo( $ch, CURLINFO_EFFECTIVE_URL );

	$resolved = api_normalize_filename_candidate( api_extract_filename_from_content_disposition( $lastContentDisposition ) );
	if( !$resolved && !$headError && $headHttpCode >= 200 && $headHttpCode < 400 ) {
		$resolved = api_normalize_filename_candidate( api_resolve_filename_from_effective_url( $effectiveUrl ) );
	}

	if( !$resolved ) {
		$lastContentDisposition = null;
		$effectiveUrl = null;

		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL => $downloadUrl,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_MAXREDIRS => 8,
			CURLOPT_TIMEOUT => 30,
			CURLOPT_SSL_VERIFYPEER => false,
			CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER => api_get_civitai_auth_headers(),
			CURLOPT_RANGE => '0-0',
			CURLOPT_HEADERFUNCTION => function( $ch, $headerLine ) use( &$lastContentDisposition ) {
				if( stripos( $headerLine, 'Content-Disposition:' ) === 0 ) {
					$lastContentDisposition = trim( substr( $headerLine, strlen( 'Content-Disposition:' ) ) );
				}
				return strlen( $headerLine );
			}
		] );

		curl_exec( $ch );
		$getError = curl_error( $ch );
		$getHttpCode = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$effectiveUrl = curl_getinfo( $ch, CURLINFO_EFFECTIVE_URL );

		if( !$getError && $getHttpCode >= 200 && $getHttpCode < 400 ) {
			$resolved = api_normalize_filename_candidate( api_extract_filename_from_content_disposition( $lastContentDisposition ) );
			if( !$resolved ) {
				$resolved = api_normalize_filename_candidate( api_resolve_filename_from_effective_url( $effectiveUrl ) );
			}
		}
	}

	$urlCache[$downloadUrl] = $resolved ? trim( $resolved ) : null;
	return $urlCache[$downloadUrl];
}