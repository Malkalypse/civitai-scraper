<?php
/**
 * Mark image workflow state in database.
 * Writes metadata to images table and updates workflow_hash column.
 */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input					= api_read_json_input();
$imageId				= isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;
$modelId				= isset( $input['modelId'] ) ? ( string )$input['modelId'] : '';
$modelVersionId = isset( $input['modelVersionId'] ) ? ( string )$input['modelVersionId'] : '';
$imageFilename	= isset( $input['imageFilename'] ) ? trim( ( string )$input['imageFilename'] ) : '';
$workflowState	= isset( $input['workflowState'] ) ? trim( ( string )$input['workflowState'] ) : '';
$hasWorkflowKey	= array_key_exists( 'workflow', ( array )$input );
$workflowValue	= $hasWorkflowKey ? $input['workflow'] : null;

if( $imageId <= 0 ) {
	api_send_failure( 'Missing or invalid imageId' );
}

/** Normalize non-empty string for storage
 * @param mixed $value Input value to normalize (string or other)
 * @return string	Normalized string (trimmed, or empty if null/invalid)
 */
function normalizeNonEmptyString( $value ): string {
	if( $value === null ) {
		return '';
	}
	$text = trim( ( string )$value );
	return $text;
}

/** Normalize workflow hash for storage, using '-1' sentinel for null/invalid values
 * @param mixed $value Input value to normalize (string or other)
 * @return string	Normalized string (trimmed, or '-1' if null/invalid)
 */
function normalizeWorkflowHashForStorage( $value ): string {
	if( $value === null ) {
		return '-1';
	}

	$text = trim( ( string )$value );
	if( $text === '' || $text === '-1' ) {
		return '-1';
	}

	return $text;
}

/** Normalize parameters hash for storage, using empty string for null/invalid values
 * @param mixed $value Input value to normalize (string or other)
 * @return string	Normalized string (trimmed, or empty if null/invalid)
 */
function normalizeParametersHashForStorage( $value ): string {
	if( $value === null ) {
		return '';
	}

	return trim( ( string )$value );
}

try {
	$db = api_db_connect();
	if( $db->connect_error ) {
		api_send_failure( 'Database connection failed: ' . $db->connect_error, 500 );
	}
	$db->set_charset( 'utf8mb4' );

	// Use -1 sentinel for confirmed missing workflow.
	$workflowHash		= '-1';
	$parametersHash	= '';
	if( $workflowState === 'present' ) {
		$workflowHash = $hasWorkflowKey ? normalizeNonEmptyString( $workflowValue ) : '';
		if( $workflowHash === '' || $workflowHash === '-1' ) {
			api_send_failure( 'Missing workflow hash' );
		}
		$parametersHash = '';
	} elseif( $workflowState === 'parameters_only' ) {
		$workflowHash		= '-1';
		$parametersHash	= $hasWorkflowKey ? normalizeParametersHashForStorage( $workflowValue ) : '';
		if( $parametersHash === '' ) {
			$parametersHash = '1';
		}
	} elseif( $workflowState === 'missing' ) {
		$workflowHash		= '-1';
		$parametersHash	= '';
	} elseif( $hasWorkflowKey ) {
		$workflowHash = normalizeWorkflowHashForStorage( $workflowValue );
	}

	// Prepare model version ID as integer
	$modelVersionId = ( int )$modelVersionId;

	// Upsert into images table: insert or update the image record with metadata
		$sql = 'INSERT INTO images (image_id, model_id, model_version_id, image_filename, workflow_hash, parameters_hash) ' .
			'VALUES (?, ?, ?, ?, ?, ?) ' .
				 'ON DUPLICATE KEY UPDATE model_id = VALUES(model_id), ' .
				 '                        model_version_id = VALUES(model_version_id), ' .
				 '                        image_filename = VALUES(image_filename), ' .
				 '                        workflow_hash = VALUES(workflow_hash), ' .
			'                        parameters_hash = VALUES(parameters_hash), ' .
				 '                        updated_at = CURRENT_TIMESTAMP';

	$stmt = $db->prepare( $sql );
	if( !$stmt ) {
		$db->close();
		api_send_failure( 'Prepare failed: ' . $db->error, 500 );
	}

	// Bind parameters: i = int, s = string
	$modelIdInt = ( int )$modelId;
	if( $modelIdInt === 0 && $modelId !== '0' && $modelId !== '' ) {
		$modelIdInt = 0;
	}

	$stmt->bind_param( 'iiisss', $imageId, $modelIdInt, $modelVersionId, $imageFilename, $workflowHash, $parametersHash );
	if( !$stmt->execute() ) {
		$error = $stmt->error;
		$stmt->close();
		$db->close();
		api_send_failure( 'Execute failed: ' . $error, 500 );
	}

	$stmt->close();
	$db->close();

	// Return success response
	echo json_encode( [
		'success'						=> true,
		'imageId'						=> $imageId,
		'workflowNull'			=> $workflowHash === '-1',
		'parametersPresent'	=> $parametersHash !== ''
	] );

} catch( Exception $e ) {
	api_send_failure( 'Exception: ' . $e->getMessage(), 500 );
}
