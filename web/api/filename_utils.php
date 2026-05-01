<?php

/** Filename resolution and download selection helpers.
 *
 * This class is the OOP entry point for filename-related behavior.
 */
class FilenameResolver {

	/** Get Civitai auth headers if token set in environment.
	 * @return array Auth headers array or empty array if token not set
	 */
	public static function getCivitaiAuthHeaders() {
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
	public static function pickDownloadFilenameFromFiles( $files ) {
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
	public static function pickDownloadFileFromFiles( $files ) {
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
	public static function extractFilenameFromContentDisposition( $headerValue ) {
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
	public static function normalizeFilenameCandidate( $filename ) {
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
	public static function resolveFilenameFromEffectiveUrl( $effectiveUrl ) {
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
	public static function resolveDownloadFilenameFromUrl( $downloadUrl ) {
		if( !$downloadUrl ) {
			return null;
		}

		static $urlCache = [];
		if( isset( $urlCache[$downloadUrl] ) ) {
			return $urlCache[$downloadUrl];
		}

		$lastContentDisposition = null;
		$effectiveUrl = null;

		$headResult = HttpClient::head( $downloadUrl, 30, self::getCivitaiAuthHeaders() );
		$resolved = self::normalizeFilenameCandidate( self::extractFilenameFromContentDisposition( $headResult['contentDisposition'] ) );
		if( !$resolved && $headResult['ok'] ) {
			$resolved = self::normalizeFilenameCandidate( self::resolveFilenameFromEffectiveUrl( $headResult['effectiveUrl'] ) );
		}

		if( !$resolved ) {
			$rangeResult = HttpClient::rangeHeader( $downloadUrl, 30, self::getCivitaiAuthHeaders() );
			if( $rangeResult['ok'] ) {
				$resolved = self::normalizeFilenameCandidate( self::extractFilenameFromContentDisposition( $rangeResult['contentDisposition'] ) );
				if( !$resolved ) {
					$resolved = self::normalizeFilenameCandidate( self::resolveFilenameFromEffectiveUrl( $rangeResult['effectiveUrl'] ) );
				}
			}
		}

		$urlCache[$downloadUrl] = $resolved ? trim( $resolved ) : null;
		return $urlCache[$downloadUrl];
	}
}
