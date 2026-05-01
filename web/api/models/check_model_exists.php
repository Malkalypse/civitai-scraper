<?php
/** Check if Model Exists in Database
 * 
 * Checks if a specific model version exists in the models table
 */

require_once __DIR__ . '/../api_utils.php';
ApiResponse::setJsonHeader();

$conn = api_db_connect();

if( $conn->connect_error ) {
	ApiResponse::sendError( 'Database connection failed: ' . $conn->connect_error, 500 );
}

$data = ApiResponse::readJsonInput();

if( !isset( $data['versionId'] ) ) {
	ApiResponse::sendError( 'Missing required parameter: versionId', 400 );
}

$requestedModelId	= isset( $data['modelId'] ) ? intval( $data['modelId'] ) : null;
$versionId				= intval( $data['versionId'] );

// Check if the model version exists and get filename
$sql = "SELECT m.model_id, m.filename, m.original_filename
	FROM models m
	WHERE m.version_id = ?
	LIMIT 1";
$stmt			= $conn->prepare( $sql );
$stmt->bind_param( "i", $versionId );
$stmt->execute();
$result		= $stmt->get_result();
$modelRow	= $result->fetch_assoc();
$stmt->close();

$exists						= $modelRow !== null;
$modelId					= $exists ? ( int )$modelRow['model_id'] : null;
$filename					= $exists ? $modelRow['filename'] : null;
$originalFilename	= $exists ? $modelRow['original_filename'] : null;

$conn->close();

ApiResponse::sendJson( [
	'success'						=> true,
	'exists'						=> $exists,
	'filename'					=> $filename,
	'originalFilename'	=> $originalFilename,
	'requestedModelId'	=> $requestedModelId,
	'modelId'						=> $modelId,
	'versionId'					=> $versionId
] );
