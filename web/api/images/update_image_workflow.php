<?php
/** Mark image workflow state in database
 * - Write metadata to images table
 * - Update workflow_hash column
 */

require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../workflow_hash_utils.php';
require_once __DIR__ . '/jsdc_utils.php';
ApiResponse::setJsonHeader();

$input					= ApiResponse::readJsonInput();
$imageId				= isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;
$modelId				= isset( $input['modelId'] ) ? ( string )$input['modelId'] : '';
$modelVersionId = isset( $input['modelVersionId'] ) ? ( string )$input['modelVersionId'] : '';
$workflowState	= isset( $input['workflowState'] ) ? trim( ( string )$input['workflowState'] ) : '';
$hasWorkflowKey	= array_key_exists( 'workflow', ( array )$input );
$workflowValue	= $hasWorkflowKey ? $input['workflow'] : null;
$parametersText	= isset( $input['parametersText'] ) ? trim( ( string )$input['parametersText'] ) : '';
$workflowText	= isset( $input['workflowText'] ) ? trim( ( string )$input['workflowText'] ) : '';
$keepOriginals	= isset( $input['keepOriginals'] ) && $input['keepOriginals'] === true;

if( $imageId <= 0 ) {
	ApiResponse::sendFailure( 'Missing or invalid imageId' );
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

try {
	$db = api_db_connect();
	if( $db->connect_error ) {
		ApiResponse::sendFailure( 'Database connection failed: ' . $db->connect_error, 500 );
	}
	$db->set_charset( 'utf8mb4' );

	// Use -1 sentinel for confirmed missing workflow.
	$workflowHash		= '-1';
	if( $workflowState === 'present' ) {
		$workflowHash = $hasWorkflowKey ? normalizeNonEmptyString( $workflowValue ) : '';
		if( $workflowHash === '' || $workflowHash === '-1' ) {
			ApiResponse::sendFailure( 'Missing workflow hash' );
		}
	} elseif( $workflowState === 'parameters_only' ) {
		// Store as P-<hash> in workflow_hash — no separate parameters_hash column needed.
		$normalizedParamHash = $hasWorkflowKey ? trim( ( string )$workflowValue ) : '';
		if( $normalizedParamHash === '' ) {
			$normalizedParamHash = '1';
		}
		$workflowHash = 'P-' . $normalizedParamHash;
	} elseif( $workflowState === 'missing' ) {
		$workflowHash		= '-1';
	} elseif( $hasWorkflowKey ) {
		$workflowHash = WorkflowStateManager::normalizeWorkflowHashForStorage( $workflowValue );
	}

	// Prepare model version ID as integer
	$modelVersionId = ( int )$modelVersionId;

	// Upsert into images table: insert or update the image record with metadata.
	// parameters_text is only written on insert or when the column is currently NULL,
	// preserving any value already captured from the original image.
	$sql = 'INSERT INTO images (image_id, model_id, model_version_id, workflow_hash, parameters_text) ' .
		'VALUES (?, ?, ?, ?, NULLIF(?, "")) ' .
		'ON DUPLICATE KEY UPDATE model_id = VALUES(model_id), ' .
		'                        model_version_id = VALUES(model_version_id), ' .
		'                        workflow_hash = VALUES(workflow_hash), ' .
		'                        parameters_text = COALESCE(parameters_text, NULLIF(VALUES(parameters_text), "")), ' .
		'                        updated_at = CURRENT_TIMESTAMP';

	$stmt = $db->prepare( $sql );
	if( !$stmt ) {
		$db->close();
		ApiResponse::sendFailure( 'Prepare failed: ' . $db->error, 500 );
	}

	$modelIdInt = ( int )$modelId;
	if( $modelIdInt === 0 && $modelId !== '0' && $modelId !== '' ) {
		$modelIdInt = 0;
	}

	$stmt->bind_param( 'iiiss', $imageId, $modelIdInt, $modelVersionId, $workflowHash, $parametersText );
	if( !$stmt->execute() ) {
		$error = $stmt->error;
		$stmt->close();
		$db->close();
		ApiResponse::sendFailure( 'Execute failed: ' . $error, 500 );
	}

	$stmt->close();
	$db->close();

	// Return success now — DB update is complete. JSDC caching is best-effort and must
	// not prevent the caller from learning that the hash was persisted successfully.
	ApiResponse::sendJson( [
		'success'						=> true,
		'imageId'						=> $imageId,
		'workflowNull'			=> $workflowHash === '-1',
		'parametersPresent'	=> str_starts_with( $workflowHash, 'P-' )
	] );

} catch( Throwable $e ) {
	ApiResponse::sendFailure( 'Exception: ' . $e->getMessage(), 500 );
}

// Store JSDC-compressed workflow when a real hash and workflow text are available.
// Runs after the response is sent (output buffering permitting) so JSDC errors are
// non-fatal from the caller's perspective.
if( $workflowHash !== '-1' && $workflowText !== '' ) {
	try {
		$workflowDecoded = json_decode( $workflowText, true );
		if( is_array( $workflowDecoded ) ) {
			$cacheDir = __DIR__ . '/../../cache/workflows';
			jsdc_store_workflow( $cacheDir, $workflowHash, $imageId, $workflowDecoded );
			if( $keepOriginals ) {
				$originalsDir = $cacheDir . '/originals';
				if( !is_dir( $originalsDir ) ) {
					mkdir( $originalsDir, 0755, true );
				}
				file_put_contents( $originalsDir . '/' . $imageId . '.json', $workflowText );
			}
		}
	} catch( Throwable $jsdc_error ) {
		error_log( 'JSDC store error for image ' . $imageId . ': ' . $jsdc_error->getMessage() );
	}
}
