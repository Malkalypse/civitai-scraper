<?php
/** Rename Model File and Update Database
 * 
 * Renames a physical model file and updates the database
 */

require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../file_utils.php';
require_once __DIR__ . '/../../prefs.php';
ApiResponse::setJsonHeader();


/** Build a normalized rename request bundle from raw input
 * @param array $inputParams Raw input parameters from request
 * @return array Normalized rename request parameters
*/
function buildRenameRequest( array $inputParams ): array {
	$normalized = FileUtils::normalizeFilenames(
		$inputParams['oldFilename'],
		$inputParams['newFilename'],
		$inputParams['originalFilename']
	);

	return [
		'oldFilename'				=> $normalized['oldFilename'],
		'newFilename'				=> $normalized['newFilename'],
		'extension'					=> $normalized['extension'],
		'originalFilename'	=> $inputParams['originalFilename'],
		'modelId'						=> $inputParams['modelId'],
		'versionId'					=> $inputParams['versionId'],
		'baseModel'					=> $inputParams['baseModel'],
		'allowMissingFile'	=> $inputParams['allowMissingFile'],
		'renameFolderMode'	=> determineRenameMode( $inputParams['originalFilename'] )
	];
}

/** Determine if rename operation is for folder or file
 * @param string|null $originalFilename Source-of-origin filename from input
 * @return bool True if folder rename, false if file rename
 */
function determineRenameMode( ?string $originalFilename ): bool {
	if( is_string( $originalFilename ) && $originalFilename !== '' ) {
		return( strtolower( substr( $originalFilename, -4 ) ) === '.zip' );
	}
	return false;
}


/** Parse and validate rename request input
 * @return array Input parameters array with all expected keys
 */
function parseRenameInput() {

	// Read and decode JSON input
	$input            = ApiResponse::readJsonInput();
	$originalFilename = isset( $input['originalFilename'] ) ? trim( ( string )$input['originalFilename'] ) : null;
	$oldFilename      = $input['oldFilename'] ?? null;
	$newFilename      = $input['newFilename'] ?? null;
	$modelId          = $input['modelId'] ?? null;
	$versionId        = $input['versionId'] ?? null;
	$baseModel        = $input['baseModel'] ?? null;
	$allowMissingFile = !empty( $input['allowMissingFile'] );

	// Validate required parameters
	if( is_string( $baseModel ) ) {
		$baseModel = trim( $baseModel );
		if( $baseModel === '' ) {
			$baseModel = null;
		}
	}
	if( !$oldFilename || !$newFilename ) {
		ApiResponse::sendFailure( 'Missing filename parameters', 400 );
	}
	if( strpos( $oldFilename, '..' ) !== false || strpos( $newFilename, '..' ) !== false ) {
		ApiResponse::sendFailure( 'Invalid filename (contains ..)', 400 );
	}

	// Normalize filenames and extract extension 
	return [
		'oldFilename'       => $oldFilename,
		'newFilename'       => $newFilename,
		'originalFilename'  => $originalFilename,
		'modelId'           => $modelId,
		'versionId'         => $versionId,
		'baseModel'         => $baseModel,
		'allowMissingFile'  => $allowMissingFile
	];
}


/** Resolve path context for the current rename request
 * @param array $renameRequest Normalized rename request parameters
 * @return array Resolved path context including model type, base path, and search roots
*/
function resolveModelPathContext( array $renameRequest ): array {
	global $debug;

	$pathPrefs	= loadModelPathPrefs();
	$modelType	= fetchModelType( $renameRequest['modelId'], $renameRequest['versionId'] );
	$typeFolder	= resolveTypeFolder( $modelType, $renameRequest['extension'], $pathPrefs );

	$modelBasePath = is_string( $typeFolder ) && $typeFolder !== ''
		? $pathPrefs['modelsRootPath'] . '/' . $typeFolder
		: $pathPrefs['modelsRootPath'];

	$candidateBasePaths	= buildCandidateBasePaths( $typeFolder, $pathPrefs );
	$searchRoots				= buildSearchRoots( $candidateBasePaths );

	$debug .= "\n  modelType: " . json_encode( $modelType );
	$debug .= "\n  modelBasePath: " . json_encode( $modelBasePath );
	$debug .= "\n  candidateBasePaths: " . json_encode( $candidateBasePaths );

	return [
		'modelType'						=> $modelType,
		'modelBasePath'				=> $modelBasePath,
		'candidateBasePaths'	=> $candidateBasePaths,
		'searchRoots'					=> $searchRoots
	];
}

/** Load model-path preferences and derive default search roots
 * @return array Loaded path preferences with resolved default base paths for model types
*/
function loadModelPathPrefs(): array {
	$modelsRootPath	= web_models_root_path();
	$lorasDir				= web_model_subdir( 'lora' );
	$checkpointsDir = web_model_subdir( 'checkpoint' );
	$unetDir				= web_model_subdir( 'unet' );

	return [
		'modelsRootPath'		=> $modelsRootPath,
		'lorasDir'					=> $lorasDir,
		'checkpointsDir'		=> $checkpointsDir,
		'unetDir'						=> $unetDir,
		'defaultBasePaths'	=> [
			web_model_path( 'lora' ),
			web_model_path( 'checkpoint' ),
			web_model_path( 'unet' )
		]
	];
}

/** Fetch the stored model type for a model/version pair
 * @param int|null $modelId		Model ID from input
 * @param int|null $versionId	Version ID from input
 * @return string|null Trimmed model type string or null on failure
*/
function fetchModelType( ?int $modelId, ?int $versionId ): ?string {

	// If missing modelID or versionIDs, return null
	if( !$modelId || !$versionId ) {
		return null;
	}

	// Connect to database and query for model type
	$db = api_db_connect();
	if( $db->connect_error ) {
		ApiResponse::sendFailure( 'Database connection failed', 500 );
	}
	$db->set_charset( 'utf8mb4' );
	$typeStmt = $db->prepare(
		"SELECT type FROM models WHERE model_id = ? AND version_id = ? LIMIT 1"
	);
	$typeStmt->bind_param( 'ii', $modelId, $versionId );

	// Execute query and check for errors
	if( !$typeStmt->execute() ) {
		$typeStmt->close();
		$db->close();
		ApiResponse::sendFailure( 'Failed to fetch model type: ' . $typeStmt->error, 500 );
	}

	// Fetch result and extract type
	$typeResult	= $typeStmt->get_result();
	$typeRow		= $typeResult ? $typeResult->fetch_assoc() : null;
	$typeStmt->close();

	// Validate type value and return
	if( !$typeRow || !isset( $typeRow['type'] ) || trim( $typeRow['type'] ) === '' ) {
		$db->close();
		ApiResponse::sendFailure( 'Could not determine model type for specified model/version', 400 );
	}
	$db->close();
	return trim( $typeRow['type'] );
}

/** Resolve the preferred storage subdirectory for a model type
 * @param string|null	$modelType	Model type string from database
 * @param string|null	$extension	Resolved normalized extension for gguf special case
 * @param array				$pathPrefs	Loaded path preferences for directory resolution
 * @return string|null Resolved subdirectory name or null to use root models directory
*/
function resolveTypeFolder(
	?string $modelType,
	?string $extension,
	array		$pathPrefs
): ?string {

	// If model type is missing or empty, return null
	if( !is_string( $modelType ) || trim( $modelType ) === '' ) {
		return null;
	}

	// Define normalized type aliases for known model types
	$modelType			= trim( $modelType );
	$normalizedType	= preg_replace( '/[^a-z0-9]+/', '', strtolower( $modelType ) );

	$typeFolderMap = [
		'lora'				=> $pathPrefs['lorasDir'],
		'checkpoint'	=> $pathPrefs['checkpointsDir']
	];

	if( isset( $typeFolderMap[$normalizedType] ) ) {
		$typeFolder = $typeFolderMap[$normalizedType];
	} else {

		$typeFolder = strtolower( trim( $modelType ) );
		$typeFolder = preg_replace( '/[^a-z0-9]+/', '_', $typeFolder );
		$typeFolder = trim( $typeFolder, '_' );

		if( $typeFolder === '' ) {
			$typeFolder = $pathPrefs['lorasDir'];
		} elseif( substr( $typeFolder, -1 ) !== 's' ) {
			$typeFolder .= 's';
		}

	}

	if( $normalizedType === 'checkpoint' && strtolower( ( string )$extension ) === '.gguf' ) {
		$typeFolder = $pathPrefs['unetDir'];
	}

	return $typeFolder;
}

/** Build ordered candidate base paths for this request
 * @param string|null	$typeFolder	Resolved type folder for the model (or null for root)
 * @param array				$pathPrefs	Loaded path preferences for directory resolution
 * @return array Ordered list of candidate base paths to search for the model file/folder
*/
function buildCandidateBasePaths( ?string $typeFolder, array $pathPrefs ): array {
	if( !is_string( $typeFolder ) || $typeFolder === '' ) {
		return $pathPrefs['defaultBasePaths'];
	}

	$modelBasePath			= $pathPrefs['modelsRootPath'] . '/' . $typeFolder;
	$candidateBasePaths	= [$modelBasePath];

	foreach( $pathPrefs['defaultBasePaths'] as $fallbackPath ) {
		if( !in_array( $fallbackPath, $candidateBasePaths, true ) ) {
			$candidateBasePaths[] = $fallbackPath;
		}
	}

	return $candidateBasePaths;
}

/** Build list of valid search root directories
 * @param array $candidateBasePaths Candidate paths to validate
 * @return array List of verified directory paths
 */
function buildSearchRoots( array $candidateBasePaths ): array {
	$searchRoots = [];
	foreach( $candidateBasePaths as $candidatePath ) {
		if( is_string( $candidatePath ) && $candidatePath !== '' && is_dir( $candidatePath ) ) {
			$searchRoots[] = $candidatePath;
		}
	}

	if( empty( $searchRoots ) ) {
		ApiResponse::sendFailure( 'No valid model directories found to search', 400 );
	}

	return $searchRoots;
}


/** Find, resolve, and return paths for old and new files/folders
 * @param array $renameRequest	Normalized rename request parameters
 * @param array $pathContext		Resolved path context for the request
 * @return array Structured result with old/new paths and context (or failure response)
*/
function findFileOrDirectory( array $renameRequest, array $pathContext ): array {
	$searchRoots			= $pathContext['searchRoots'];
	$allowMissingFile	= $renameRequest['allowMissingFile'];
	$modelId					= $renameRequest['modelId'];
	$versionId				= $renameRequest['versionId'];
	$isFolderMode			= $renameRequest['renameFolderMode'];
	$oldFilename			= $renameRequest['oldFilename'];
	$newFilename			= $renameRequest['newFilename'];
	$extension				= $renameRequest['extension'];
	$scopedSubdir			= $renameRequest['baseModel'];

	$renameTargets = FileUtils::findRenameTargets(
		$searchRoots,
		$isFolderMode,
		$oldFilename,
		$newFilename,
		$extension,
		$scopedSubdir
	);
	
	if( $renameTargets ) {
		return $renameTargets;
	}

	if( $allowMissingFile && $modelId && $versionId ) {
		return ['allowDbOnlyUpdate' => true];
	}

	$fileOrFolder	= $isFolderMode ? 'Folder' : 'File';
	$searchName		= $isFolderMode ? $oldFilename : ( $oldFilename . $extension );
	ApiResponse::sendFailure( "$fileOrFolder not found for rename: $searchName", 404 );
}

/** Update only the database filename when the file is intentionally missing
 * @param array $renameRequest Normalized rename request parameters
 * @return int Number of affected rows in the database update
*/
function updateMissingFileDatabaseFilename( array $renameRequest ): int {
	$db		= api_db_connect();
	$stmt	= $db->prepare( "UPDATE models SET filename = ? WHERE model_id = ? AND version_id = ?" );
	$stmt->bind_param( 'sii', $renameRequest['newFilename'], $renameRequest['modelId'], $renameRequest['versionId'] );

	if( !$stmt->execute() ) {
		$stmt->close();
		$db->close();
		ApiResponse::sendFailure( 'Database update failed: ' . $stmt->error, 500 );
	}

	$affectedRows = $stmt->affected_rows;
	$stmt->close();
	$db->close();

	return $affectedRows;
}

/** Update the database filename after a successful filesystem rename
 * @param array $renameRequest Normalized rename request parameters
 * @param array $renameTargets Resolved rename target paths
 * @return array Result of the database update operation
*/
function updateDatabaseFilename( array $renameRequest, array $renameTargets ): array {
	$newFilename	= $renameRequest['newFilename'];
	$modelId			= $renameRequest['modelId'];
	$versionId		= $renameRequest['versionId'];
	$oldFilePath	= $renameTargets['oldPath'];
	$newFilePath	= $renameTargets['newPath'];

	if( !$modelId || !$versionId ) {
		return ['wasUpdated' => false, 'affectedRows' => 0];
	}

	$db = api_db_connect();

	// Update the filename in the models table
	$stmt = $db->prepare( "UPDATE models SET filename = ? WHERE model_id = ? AND version_id = ?" );
	$stmt->bind_param( "sii", $newFilename, $modelId, $versionId );

	if( !$stmt->execute() ) {
		// Database update failed - try to revert file rename
		rename( $newFilePath, $oldFilePath );
		$error = $stmt->error;
		$stmt->close();
		$db->close();
		ApiResponse::sendFailure( "Database update failed: $error", 500 );
	}

	$affectedRows = $stmt->affected_rows;
	$stmt->close();
	$db->close();
	return ['wasUpdated' => true, 'affectedRows' => $affectedRows];
}

/** Build and send rename response payload based on result case
 * @param string			$case						Identifier for response case to determine payload structure
 * @param array				$renameRequest	Normalized rename request parameters
 * @param array				$pathContext		Resolved path context for request
 * @param array|null	$renameTargets	Resolved rename target paths (if applicable)
 * @param int					$affectedRows		Number of affected rows in database update (if applicable)
 * @param string|null	$warning				Optional warning message to include in response
*/
function sendRenameResponse(
	string	$case,
	array		$renameRequest,
	array		$pathContext,
	?array	$renameTargets	= null,
	int			$affectedRows		= 0,
	?string	$warning				= null
): void {
	global $debug;

	$response = [
		'success'			=> true,
		'oldFilename'	=> $renameRequest['oldFilename'],
		'newFilename'	=> $renameRequest['newFilename'],
		'modelId'			=> $renameRequest['modelId'],
		'versionId'		=> $renameRequest['versionId'],
		'debug'				=> $debug
	];

	switch( $case ) {
		case 'db_only_missing_file':
			$response['folder']						= null;
			$response['databaseUpdated']	= true;
			$response['fileRenamed']			= false;
			$response['affectedRows']			= $affectedRows;
			$response['type']							= $pathContext['modelType'];
			$response['modelBasePath']		= $pathContext['modelBasePath'];
			$response['warning']					= ( $renameRequest['renameFolderMode'] ? 'Folder' : 'File' ) . ' not found for rename. Database filename was still updated.';
			break;

		case 'file_only':
			if( !$renameTargets ) {
				ApiResponse::sendFailure( 'Missing rename targets for file-only response', 500 );
			}
			$response['folder']						= $renameTargets['relativeFolder'];
			$response['databaseUpdated']	= false;
			$response['reason']						= 'Missing modelId or versionId';
			$response['modelBasePath']		= $renameTargets['rootPath'];
			break;

		case 'rename_and_db_update':
			if( !$renameTargets ) {
				ApiResponse::sendFailure( 'Missing rename targets for rename response', 500 );
			}
			$response['folder']						= $renameTargets['relativeFolder'];
			$response['databaseUpdated']	= true;
			$response['fileRenamed']			= true;
			$response['affectedRows']			= $affectedRows;
			$response['type']							= $pathContext['modelType'];
			$response['modelBasePath']		= $renameTargets['rootPath'];
			$response['warning']					= $warning;
			break;

		default:
			ApiResponse::sendFailure( 'Unknown rename response case', 500 );
	}

	ApiResponse::sendJson( $response );
	exit;
}

$debug = '';

try {
	// Build request, resolve context, and find targets
	$renameRequest	= buildRenameRequest( parseRenameInput() );
	$pathContext		= resolveModelPathContext( $renameRequest );
	$findResult			= findFileOrDirectory( $renameRequest, $pathContext );

	// Handle case where file/folder is missing but database update is allowed
	if( isset( $findResult['allowDbOnlyUpdate'] ) ) {
		if( !$renameRequest['modelId'] || !$renameRequest['versionId'] ) {
			ApiResponse::sendFailure( 'Cannot update database filename without modelId/versionId', 400 );
		}
		$affectedRows = updateMissingFileDatabaseFilename( $renameRequest );
		sendRenameResponse( 'db_only_missing_file', $renameRequest, $pathContext, null, $affectedRows );
	}

	// Check if new filename/folder already exists
	if( file_exists( $findResult['newPath'] ) || is_dir( $findResult['newPath'] ) ) {
		ApiResponse::sendFailure( 'A file or folder with that name already exists', 409 );
	}

	// Rename the file or folder on disk
	if( !rename( $findResult['oldPath'], $findResult['newPath'] ) ) {
		ApiResponse::sendFailure( 'Failed to rename ' . ( $renameRequest['renameFolderMode'] ? 'folder' : 'file' ) . ' on disk', 500 );
	}

	// Update database filename
	$dbResult = updateDatabaseFilename( $renameRequest, $findResult );

	// Send response based on whether database was updated
	if( $dbResult['wasUpdated'] ) {
		sendRenameResponse( 'rename_and_db_update', $renameRequest, $pathContext, $findResult, $dbResult['affectedRows'] );
	} else {
		sendRenameResponse( 'file_only', $renameRequest, $pathContext, $findResult );
	}

// Catch unexpected exceptions and return failure response
} catch( Exception $e ) {
	ApiResponse::sendFailure( 'Exception: ' . $e->getMessage(), 500 );
}

?>
