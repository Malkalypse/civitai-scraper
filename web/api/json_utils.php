<?php

/** Decode JSON text only when the input appears to be a JSON object/array payload
 * @param string $value Raw text to parse
 * @return mixed decoded value on success, otherwise null
 */
function api_try_decode_json( string $value ) {
	$trimmed = trim( $value );
	if( $trimmed === '' ) {
		return null;
	}

	if( $trimmed[0] !== '{' && $trimmed[0] !== '[' ) {
		return null;
	}

	$decoded = json_decode( $trimmed, true );
	if( json_last_error() === JSON_ERROR_NONE ) {
		return $decoded;
	}

	return null;
}
