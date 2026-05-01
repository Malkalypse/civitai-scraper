<?php
/** Read workflow entry presence from images table */

require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../workflow_hash_utils.php';
ApiResponse::setJsonHeader();

$input    = ApiResponse::readJsonInput();
$imageId  = isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;

if( $imageId <= 0 ) {
	ApiResponse::sendFailure( 'Missing or invalid imageId' );
}

$hasWorkflowEntry = false;
$workflowNull     = false;
$workflowHash     = '';
$parametersHash   = '';

try {
	$db = api_db_connect();
	if( $db->connect_error ) {
		ApiResponse::sendFailure( 'Database connection failed: ' . $db->connect_error, 500 );
	}
	$db->set_charset( 'utf8mb4' );

	// Query the images table for workflow_hash + parameters_hash classification.
	$sql  = 'SELECT workflow_hash, parameters_hash FROM images WHERE image_id = ? LIMIT 1';
	$stmt = $db->prepare( $sql );
	if( !$stmt ) {
		$db->close();
		ApiResponse::sendFailure( 'Prepare failed: ' . $db->error, 500 );
	}

	$stmt->bind_param( 'i', $imageId );
	if( !$stmt->execute() ) {
		$error = $stmt->error;
		$stmt->close();
		$db->close();
		ApiResponse::sendFailure( 'Execute failed: ' . $error, 500 );
	}

	$result = $stmt->get_result();
	if( $result && ( $row = $result->fetch_assoc() ) ) {
		$workflowState    = WorkflowStateManager::describeWorkflowState( $row['workflow_hash'], $row['parameters_hash'] ?? null );
		$hasWorkflowEntry = $workflowState['hasWorkflowEntry'];
		$workflowNull     = $workflowState['workflowNull'];
		$workflowHash     = $workflowState['workflowHash'];
		$parametersHash   = $workflowState['parametersHash'];
	}
	$stmt->close();
	$db->close();

	ApiResponse::sendJson( [
		'success'						=> true,
		'imageId'						=> $imageId,
		'hasWorkflowEntry'	=> $hasWorkflowEntry,
		'workflowNull'			=> $workflowNull,
		'workflowHash'			=> $workflowHash,
		'parametersHash'		=> $parametersHash,
		'parametersPresent'	=> $parametersHash !== ''
	] );

} catch( Exception $e ) {
	ApiResponse::sendFailure( 'Exception: ' . $e->getMessage(), 500 );
}
