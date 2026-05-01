<?php

/** Common JSON API response helpers.
 *
 * This class is the OOP entry point for request/response behavior.
 */
class ApiResponse {

	/** Send JSON content-type header. */
	public static function setJsonHeader() {
		header( 'Content-Type: application/json' );
	}

	/** Decode request JSON body into an associative array */
	public static function readJsonInput() {
		$raw			= file_get_contents( 'php://input' );
		$decoded	= json_decode( $raw, true );
		return is_array( $decoded ) ? $decoded : [];
	}

	/** Send a JSON response with status code
	 * @param mixed $payload Data to encode as JSON in response body
	 * @param int $statusCode HTTP status code to send (default 200)
	*/
	public static function sendJson( $payload, $statusCode = 200 ) {
		http_response_code( ( int )$statusCode );
		echo json_encode( $payload );
	}

	/** Send an error payload and stop execution
	 * @param mixed	$message		Error message or data to include in response
	 * @param int		$statusCode	HTTP status code to send (default 400)
	 * @param array	$extra			Optional additional data to include in response
	 */
	public static function sendError( $message, $statusCode = 400, $extra = [] ) {
		$payload = array_merge(
			['error' => $message],
			is_array( $extra ) ? $extra : []
		);
		self::sendJson( $payload, $statusCode );
		exit;
	}

	/** Send a standardized success:false error payload and stop execution
	 * @param mixed	$message		Error message or data to include in response
	 * @param int		$statusCode	HTTP status code to send (default 400)
	 * @param array	$extra			Optional additional data to include in response
	 */
	public static function sendFailure( $message, $statusCode = 400, $extra = [] ) {
		$payload = array_merge(
			['success' => false, 'error' => $message],
			is_array( $extra ) ? $extra : []
		);
		self::sendJson( $payload, $statusCode );
		exit;
	}
}

function api_db_connect() {
	return new mysqli( 'localhost', 'root', '', 'civitai_models' );
}

