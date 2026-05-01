<?php

/** HTTP client helpers for API/network requests.
 *
 * This class is the OOP entry point for HTTP request behavior.
 */
class HttpClient {

	/** Perform an HTTP GET request and return normalized response fields.
	 * @param string	$url			absolute URL to request.
	 * @param int		$timeout	request timeout in seconds.
	 * @param array	$headers	optional HTTP request headers.
	 * @return array{ok: bool, body: string, httpCode: int, contentType: string, error: string}
	 */
	public static function get(
		string	$url,
		int			$timeout = 20,
		array		$headers = ['Accept: */*']
	): array {
		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL							=> $url,
			CURLOPT_RETURNTRANSFER	=> true,
			CURLOPT_FOLLOWLOCATION	=> true,
			CURLOPT_TIMEOUT					=> $timeout,
			CURLOPT_SSL_VERIFYPEER	=> false,
			CURLOPT_USERAGENT				=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER			=> $headers,
			CURLOPT_ENCODING				=> ''
		] );

		$body				= curl_exec( $ch );
		$httpCode		= ( int )curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$contentType	= ( string )curl_getinfo( $ch, CURLINFO_CONTENT_TYPE );
		$error				= curl_error( $ch );

		return [
			'ok'					=> is_string( $body ) && $body !== '' && $httpCode >= 200 && $httpCode < 300,
			'body'				=> is_string( $body ) ? $body : '',
			'httpCode'		=> $httpCode,
			'contentType'	=> $contentType,
			'error'				=> $error
		];
	}

	/** Perform an HTTP Range GET request for the first N bytes.
	 * @param string	$url			absolute URL to request.
	 * @param int		$maxBytes	maximum bytes to request from byte 0.
	 * @param int		$timeout	request timeout in seconds.
	 * @param array	$headers	optional HTTP request headers.
	 * @return array{ok: bool, body: string, httpCode: int, error: string}
	 */
	public static function getPartial(
		string	$url,
		int			$maxBytes	= 4194304,
		int			$timeout	= 30,
		array		$headers	= ['Accept: */*']
	): array {
		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL => $url,
			CURLOPT_RETURNTRANSFER	=> true,
			CURLOPT_FOLLOWLOCATION	=> true,
			CURLOPT_TIMEOUT				=> $timeout,
			CURLOPT_SSL_VERIFYPEER	=> false,
			CURLOPT_USERAGENT				=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER			=> $headers,
			CURLOPT_RANGE						=> '0-' . ( $maxBytes - 1 )
		] );

		$body			= curl_exec( $ch );
		$httpCode	= ( int )curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$error		= curl_error( $ch );

		$ok = is_string( $body ) && $body !== '' && ( $httpCode === 200 || $httpCode === 206 );

		return [
			'ok'				=> $ok,
			'body'			=> is_string( $body ) ? $body : '',
			'httpCode'	=> $httpCode,
			'error'			=> $error
		];
	}

	/** Perform an HTTP HEAD request and return HTTP code, error, Content-Disposition header, and effective URL.
	 * @param string	$url			absolute URL to request.
	 * @param int		$timeout	request timeout in seconds.
	 * @param array	$headers	optional HTTP request headers.
	 * @return array{ok: bool, httpCode: int, error: string, contentDisposition: string, effectiveUrl: string}
	 */
	public static function head(
		string	$url,
		int			$timeout = 30,
		array		$headers = ['Accept: */*']
	): array {
		$lastContentDisposition = '';
		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL						=> $url,
			CURLOPT_NOBODY				=> true,
			CURLOPT_HEADER				=> false,
			CURLOPT_FOLLOWLOCATION	=> true,
			CURLOPT_MAXREDIRS			=> 8,
			CURLOPT_TIMEOUT				=> $timeout,
			CURLOPT_SSL_VERIFYPEER	=> false,
			CURLOPT_USERAGENT			=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER		=> $headers,
			CURLOPT_HEADERFUNCTION	=> static function( $ch, $headerLine ) use( &$lastContentDisposition ) {
				if( stripos( $headerLine, 'Content-Disposition:' ) === 0 ) {
					$lastContentDisposition = trim( substr( $headerLine, strlen( 'Content-Disposition:' ) ) );
				}
				return strlen( $headerLine );
			}
		] );

		curl_exec( $ch );
		$httpCode		= ( int )curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$effectiveUrl	= ( string )curl_getinfo( $ch, CURLINFO_EFFECTIVE_URL );
		$error				= curl_error( $ch );
		curl_close( $ch );

		return [
			'ok'								=> $error === '' && $httpCode >= 200 && $httpCode < 400,
			'httpCode'					=> $httpCode,
			'error'							=> $error,
			'contentDisposition'	=> $lastContentDisposition,
			'effectiveUrl'			=> $effectiveUrl
		];
	}

	/** Perform an HTTP GET with Range: bytes=0-0 and return HTTP code, error, Content-Disposition header, and effective URL.
	 * Useful as a fallback when a HEAD request does not return a Content-Disposition header.
	 * @param string	$url			absolute URL to request.
	 * @param int		$timeout	request timeout in seconds.
	 * @param array	$headers	optional HTTP request headers.
	 * @return array{ok: bool, httpCode: int, error: string, contentDisposition: string, effectiveUrl: string}
	 */
	public static function rangeHeader(
		string	$url,
		int			$timeout = 30,
		array		$headers = ['Accept: */*']
	): array {
		$lastContentDisposition = '';
		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL						=> $url,
			CURLOPT_RETURNTRANSFER	=> true,
			CURLOPT_FOLLOWLOCATION	=> true,
			CURLOPT_MAXREDIRS			=> 8,
			CURLOPT_TIMEOUT				=> $timeout,
			CURLOPT_SSL_VERIFYPEER	=> false,
			CURLOPT_USERAGENT			=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER		=> $headers,
			CURLOPT_RANGE					=> '0-0',
			CURLOPT_HEADERFUNCTION	=> static function( $ch, $headerLine ) use( &$lastContentDisposition ) {
				if( stripos( $headerLine, 'Content-Disposition:' ) === 0 ) {
					$lastContentDisposition = trim( substr( $headerLine, strlen( 'Content-Disposition:' ) ) );
				}
				return strlen( $headerLine );
			}
		] );

		curl_exec( $ch );
		$httpCode		= ( int )curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$effectiveUrl	= ( string )curl_getinfo( $ch, CURLINFO_EFFECTIVE_URL );
		$error				= curl_error( $ch );
		curl_close( $ch );

		return [
			'ok'								=> $error === '' && $httpCode >= 200 && $httpCode < 400,
			'httpCode'					=> $httpCode,
			'error'							=> $error,
			'contentDisposition'	=> $lastContentDisposition,
			'effectiveUrl'			=> $effectiveUrl
		];
	}
}
