<?php
/** Update original filename in database for a model/version.
 */

require_once __DIR__ . '/api_utils.php';
api_set_json_header();

$input						= api_read_json_input();
$modelId					= isset( $input['modelId'] ) ? ( int )$input['modelId'] : 0;
$versionId				= isset( $input['versionId'] ) ? ( int )$input['versionId'] : 0;
$originalFilename	= isset( $input['originalFilename'] ) ? trim( (string )$input['originalFilename'] ) : null;

if( $versionId <= 0 ) {
	api_send_failure( 'Missing or invalid versionId', 400 );
}

if( $originalFilename !== null && strpos( $originalFilename, "\0" ) !== false ) {
	api_send_failure( 'Invalid filename', 400 );
}

$conn = api_db_connect();
if( $conn->connect_error ) {
	api_send_failure( 'Database connection failed: ' . $conn->connect_error, 500 );
}

$conn->set_charset( 'utf8mb4' );

$normalized = ( $originalFilename === null || $originalFilename === '' ) ? null : $originalFilename;

$stmt = $conn->prepare( 'UPDATE models SET original_filename = ? WHERE version_id = ?' );
if( !$stmt ) {
	$conn->close();
	api_send_failure( 'Prepare failed: ' . $conn->error, 500 );
}

$stmt->bind_param( 'si', $normalized, $versionId );
$ok = $stmt->execute();
$affectedRows = $stmt->affected_rows;
$error = $stmt->error;
$stmt->close();

if( !$ok ) {
	$conn->close();
	api_send_failure( 'Update failed: ' . $error, 500 );
}

$selectStmt = $conn->prepare('SELECT model_id, original_filename FROM models WHERE version_id = ? LIMIT 1');
if( !$selectStmt ) {
	$conn->close();
	api_send_failure( 'Verification query prepare failed: ' . $conn->error, 500 );
}

$selectStmt->bind_param( 'i', $versionId );
$selectStmt->execute();
$result = $selectStmt->get_result();
$row = $result ? $result->fetch_assoc() : null;
$selectStmt->close();
$conn->close();

if( !$row ) {
	api_send_failure( 'Model/version not found', 404 );
}

api_send_json( [
	'success' => true,
	'requestedModelId' => $modelId > 0 ? $modelId : null,
	'modelId' => isset($row['model_id']) ? (int)$row['model_id'] : null,
	'versionId' => $versionId,
	'originalFilename' => $row['original_filename'],
	'affectedRows' => $affectedRows
] );
