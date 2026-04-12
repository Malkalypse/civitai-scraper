<?php

/** Common API utilities for JSON endpoints and DB access. */
function api_set_json_header() {
	header( 'Content-Type: application/json' );
}

/** Decode request JSON body into an associative array */
function api_read_json_input() {
	$raw			= file_get_contents( 'php://input' );
	$decoded	= json_decode( $raw, true );
	return is_array( $decoded ) ? $decoded : [];
}

/** Send a JSON response with status code */
function api_send_json( $payload, $statusCode = 200 ) {
	http_response_code( (int)$statusCode );
	echo json_encode( $payload );
}

/** Send an error payload and stop execution
 * @param mixed	$message Error message or data to include in response
 * @param int		$statusCode HTTP status code to send (default 400)
 * @param array	$extra Optional additional data to include in response
 */
function api_send_error( $message, $statusCode = 400, $extra = [] ) {
	$payload = array_merge(
		['error' => $message],
		is_array( $extra ) ? $extra : []
	);
	api_send_json( $payload, $statusCode );
	exit;
}

/** Send a standardized success:false error payload and stop execution
 * @param mixed	$message Error message or data to include in response
 * @param int		$statusCode HTTP status code to send (default 400)
 * @param array	$extra Optional additional data to include in response
 */
function api_send_failure( $message, $statusCode = 400, $extra = [] ) {
	$payload = array_merge(
		['success' => false, 'error' => $message],
		is_array( $extra ) ? $extra : []
	);
	api_send_json( $payload, $statusCode );
	exit;
}

/** Create the default civitai_models DB connection. */
function api_db_connect() {
	return new mysqli( 'localhost', 'root', '', 'civitai_models' );
}
