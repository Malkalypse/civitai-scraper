<?php
/** Get Image Generation Data
 *
 * Fetches generation metadata for a Civitai image from database or remote API.
 * Formats a COPY ALL style text block.
 */

require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/../http_utils.php';
require_once __DIR__ . '/../workflow_hash_utils.php';
header( 'Content-Type: application/json' );

$input                = json_decode( file_get_contents( 'php://input' ), true );
$imageId              = isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;
$inputModelId         = isset( $input['modelId'] ) ? ( string )$input['modelId'] : '';
$inputModelVersionId  = isset( $input['modelVersionId'] ) ? ( string )$input['modelVersionId'] : '';
$inputImageFilename   = isset( $input['imageFilename'] ) ? trim( ( string )$input['imageFilename'] ) : '';

if( $imageId <= 0 ) {
	ApiResponse::sendJson( ['success' => false, 'error' => 'Missing or invalid imageId'] );
	exit;
}

/** Compose generation parts from metadata
 * @param array $meta Metadata array from API response
 * @return array Array with keys 'promptText' and 'copyAllText' containing formatted generation data
 */
function composeGenerationParts( array $meta ): array {
	$rawParameters = isset( $meta['parameters'] ) ? trim( ( string )$meta['parameters'] ) : '';
	if( $rawParameters !== '' ) {
		$prompt = $rawParameters;
		if( preg_match( '/\R\s*Negative prompt\s*:/i', $rawParameters, $match, PREG_OFFSET_CAPTURE ) === 1 && isset( $match[0][1] ) ) {
			$prompt = trim( substr( $rawParameters, 0, (int)$match[0][1] ) );
		}

		return [
			'promptText'  => $prompt,
			'copyAllText' => $rawParameters
		];
	}

	$prompt         = isset( $meta['prompt'] ) ? trim( ( string )$meta['prompt'] ) : '';
	$negativePrompt = isset( $meta['negativePrompt'] ) ? trim( ( string )$meta['negativePrompt'] ) : '';

	$extractValue = static function( array $source, string $primaryKey, array $fallbackKeys = [] ) {
		$keys = array_merge( [ $primaryKey ], $fallbackKeys );
		foreach( $keys as $key ) {
			if( !array_key_exists( $key, $source ) ) {
				continue;
			}

			$value = $source[ $key ];
			if( is_array( $value ) || is_object( $value ) ) {
				continue;
			}

			$normalized = trim( ( string )$value );
			if( $normalized !== '' ) {
				return $normalized;
			}
		}

		return '';
	};

	$modelHashFromHashes = '';
	if( isset( $meta['hashes'] ) && is_array( $meta['hashes'] ) ) {
		$modelHashFromHashes = trim( ( string )( $meta['hashes']['model'] ?? '' ) );
	}

	$orderedOptions = [
		'Steps'         => $extractValue( $meta, 'steps' ),
		'CFG scale'     => $extractValue( $meta, 'cfgScale', [ 'CFG scale' ] ),
		'Sampler'       => $extractValue( $meta, 'sampler', [ 'Sampler' ] ),
		'Seed'          => $extractValue( $meta, 'seed', [ 'Seed' ] ),
		'VAE'           => $extractValue( $meta, 'VAE', [ 'vae' ] ),
		'Size'          => $extractValue( $meta, 'Size', [ 'size' ] ),
		'Model'         => $extractValue( $meta, 'Model', [ 'model' ] ),
		'Version'       => $extractValue( $meta, 'Version', [ 'version' ] ),
		'Model hash'    => $extractValue( $meta, 'Model hash', [ 'model hash' ] ),
		'Schedule type' => $extractValue( $meta, 'Schedule type', [ 'scheduleType', 'schedule type' ] ),
	];

	if( $orderedOptions['Model hash'] === '' && $modelHashFromHashes !== '' ) {
		$orderedOptions['Model hash'] = $modelHashFromHashes;
	}

	// Include ADetailer and related scalar meta fields if present.
	foreach( $meta as $key => $value ) {
		if( !is_string( $key ) ) {
			continue;
		}

		if( !is_scalar( $value ) ) {
			continue;
		}

		$normalizedValue = trim( ( string )$value );
		if( $normalizedValue === '' ) {
			continue;
		}

		$normalizedKey        = trim( $key );
		$startsWithADetailer  = stripos( $normalizedKey, 'ADetailer ' ) === 0;
		$isClipSkip           = strcasecmp( $normalizedKey, 'clipSkip' ) === 0 || strcasecmp( $normalizedKey, 'Clip skip' ) === 0;

		if( $startsWithADetailer ) {
			$orderedOptions[ $normalizedKey ] = $normalizedValue;
			continue;
		}

		if( $isClipSkip ) {
			$orderedOptions['Clip skip'] = $normalizedValue;
		}
	}

	$optionPairs = [];
	foreach( $orderedOptions as $label => $value ) {
		if( trim( ( string )$value ) === '' ) {
			continue;
		}
		$optionPairs[] = $label . ': ' . $value;
	}

	$copySegments = [];
	if( $prompt !== '' ) {
		$copySegments[] = $prompt;
	}
	if( $negativePrompt !== '' ) {
		$copySegments[] = 'Negative prompt: ' . $negativePrompt;
	}
	if( count( $optionPairs ) > 0 ) {
		$copySegments[] = implode( ', ', $optionPairs );
	}

	$copyAllText = implode( "\n", $copySegments );

	return [
		'promptText'  => $prompt,
		'copyAllText' => $copyAllText
	];
}

/** Determine if copyAllText entries in the database should be refreshed
 * @param string $promptText	Prompt text to check for presence
 * @param string $copyAllText	Copy all text to check for likely truncated/legacy format
 * @return bool True if the copyAllText should be refreshed from the source, false to keep existing text
 */
function shouldRefreshTruncatedCopyAllText( string $promptText, string $copyAllText ): bool {
	$trimmedCopy = trim( $copyAllText );
	if( $trimmedCopy === '' ) {
		return false;
	}

	$hasSteps						= stripos( $trimmedCopy, 'steps:' ) !== false;
	$hasNegativePrompt	= stripos( $trimmedCopy, 'negative prompt:' ) !== false;
	$hasCfgScale				= stripos( $trimmedCopy, 'cfg scale:' ) !== false;
	$hasModelHash				= stripos( $trimmedCopy, 'model hash:' ) !== false;

	// Older cached rows were saved as prompt + a few newline-separated fields.
	// Refresh these rows so the DB stores full generation details.
	$looksLikeLegacyMinimalFormat = $hasSteps && !$hasNegativePrompt && !$hasCfgScale && !$hasModelHash;

	// If prompt exists but copy text has very little detail, refresh once.
	$shortCopyForPrompt = trim( $promptText ) !== '' && strlen( $trimmedCopy ) < ( strlen( trim( $promptText ) ) + 120 );

	return $looksLikeLegacyMinimalFormat || $shortCopyForPrompt;
}

/** Send JSON response with generation data
 * @param mixed $success				Success status of operation
 * @param mixed $imageId        Image ID for data being sent
 * @param mixed $promptText	 		Prompt text to include
 * @param mixed $copyAllText    Copy all text to include
 * @param mixed $favorite				Favorite status to include
 * @param mixed $workflowHash   Workflow hash to include
 * @param mixed $parametersHash Parameters hash to include
 * @param mixed $cached         Cached status to include
 */
function sendResponse( $success, $imageId, $promptText = '', $copyAllText = '', $favorite = false, $workflowHash = '', $parametersHash = '', $cached = true ) {
	$workflowState = WorkflowStateManager::describeWorkflowState( $workflowHash, $parametersHash );
	
	ApiResponse::sendJson( [
		'success'           => $success,
		'imageId'           => $imageId,
		'promptText'        => $promptText,
		'copyAllText'       => $copyAllText,
		'favorite'          => $favorite,
		'workflowHash'      => $workflowState['workflowHash'],
		'workflowPresent'   => $workflowState['workflowHash'] !== '',
		'workflowNull'      => $workflowState['workflowNull'],
		'parametersHash'    => $workflowState['parametersHash'],
		'parametersPresent' => $workflowState['parametersPresent'],
		'cached'            => $cached
	] );
}


try {
	$db = api_db_connect();
	if( $db->connect_error ) {
		ApiResponse::sendJson( ['success' => false, 'error' => 'Database connection failed'] );
		exit;
	}
	$db->set_charset( 'utf8mb4' );

	// Try to read from database first
	$dbPromptText     = '';
	$dbCopyAllText    = '';
	$dbFavorite       = false;
	$dbWorkflowHash   = '';
	$dbParametersHash = '';
	$dbModelVersionId = 0;
	$dbModelId        = 0;
	$imageExists      = false;

	$sql = 'SELECT prompt_text, copy_all_text, favorite, workflow_hash, parameters_hash, model_version_id, model_id FROM images WHERE image_id = ? LIMIT 1';
	$stmt = $db->prepare( $sql );
	if( $stmt ) {
		$stmt->bind_param( 'i', $imageId );
		$stmt->execute();
		$result = $stmt->get_result();
		if( $result && ( $row = $result->fetch_assoc() ) ) {
			$imageExists      = true;
			$dbPromptText     = ( string )( $row['prompt_text'] ?? '' );
			$dbCopyAllText    = ( string )( $row['copy_all_text'] ?? '' );
			$dbFavorite       = ( bool )( $row['favorite'] ?? false );
			$dbWorkflowHash   = $row['workflow_hash'] ?? '';
			$dbParametersHash = $row['parameters_hash'] ?? '';
			$dbModelVersionId = ( int )( $row['model_version_id'] ?? 0 );
			$dbModelId        = ( int )( $row['model_id'] ?? 0 );
		}
		$stmt->close();
	}

	// If we have cached generation text in the database, return it immediately
	$hasGenerationText = (trim( $dbPromptText ) !== '' || trim( $dbCopyAllText ) !== '');
	
	if( $imageExists && $hasGenerationText && !shouldRefreshTruncatedCopyAllText( $dbPromptText, $dbCopyAllText ) ) {
		$db->close();
		sendResponse( true, $imageId, $dbPromptText, $dbCopyAllText, $dbFavorite, $dbWorkflowHash, $dbParametersHash, true );
		exit;
	}

	// Fetch from Civitai API
	$trpcInput  = json_encode( ['json' => ['id' => $imageId]] );
	$trpcUrl    = SITE_URL_API_TRPC . '/' . SITE_TRPC_IMAGE_GEN . '?input=' . urlencode($trpcInput);

	$httpResult = HttpClient::get( $trpcUrl, 20, ['Accept: application/json'] );

	if( !$httpResult['ok'] ) {
		$db->close();
		if( $imageExists ) {
			sendResponse( true, $imageId, $dbPromptText, $dbCopyAllText, $dbFavorite, $dbWorkflowHash, $dbParametersHash, true );
		} else {
			sendResponse( false, $imageId );
		}
		exit;
	}

	// Parse API response
	$data       = json_decode( $httpResult['body'], true );
	$jsonRoot   = $data['result']['data']['json'] ?? [];
	$meta       = $jsonRoot['meta'] ?? null;
	$resources  = isset( $jsonRoot['resources'] ) && is_array( $jsonRoot['resources'] ) ? $jsonRoot['resources'] : [];

	$resolvedModelId        = $inputModelId !== '' ? ( int )$inputModelId : $dbModelId;
	$resolvedModelVersionId = $inputModelVersionId !== '' ? ( int )$inputModelVersionId : $dbModelVersionId;

	// Extract model IDs from API resources if still missing
	if( ( $resolvedModelId === 0 || $resolvedModelVersionId === 0 ) && count( $resources ) > 0 && is_array( $resources[0] ) ) {
		$firstResource = $resources[0];
		if( $resolvedModelId === 0 && isset( $firstResource['modelId'] ) ) {
			$resolvedModelId = ( int )$firstResource['modelId'];
		}
		if( $resolvedModelVersionId === 0 && isset( $firstResource['modelVersionId'] ) ) {
			$resolvedModelVersionId = ( int )$firstResource['modelVersionId'];
		}
		if( $resolvedModelVersionId === 0 && isset( $firstResource['versionId'] ) ) {
			$resolvedModelVersionId = ( int )$firstResource['versionId'];
		}
	}

	$promptText   = '';
	$copyAllText  = '';
	$favorite     = $dbFavorite;

	if( !is_array( $meta ) ) {
		$db->close();
		sendResponse( true, $imageId, '', '', $favorite, $dbWorkflowHash, $dbParametersHash, false );
		exit;
	}

	$parts        = composeGenerationParts( $meta );
	$promptText   = $parts['promptText'];
	$copyAllText  = $parts['copyAllText'];

	// Update database with fetched generation data
	$imageFilename = $inputImageFilename !== '' ? $inputImageFilename : '';
	$updateSql = 'INSERT INTO images ' .
							 '(image_id, model_id, model_version_id, image_filename, prompt_text, copy_all_text, favorite, workflow_hash, parameters_hash) ' .
							 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' .
							 'ON DUPLICATE KEY UPDATE ' .
							 '  model_id = COALESCE(NULLIF(?, 0), model_id), ' .
							 '  model_version_id = COALESCE(NULLIF(?, 0), model_version_id), ' .
							 '  image_filename = COALESCE(NULLIF(?, ""), image_filename), ' .
							 '  prompt_text = ?, ' .
							 '  copy_all_text = ?, ' .
							 '  favorite = ?, ' .
							 '  updated_at = CURRENT_TIMESTAMP';

	$updateStmt = $db->prepare( $updateSql );
	if( $updateStmt ) {
		$updateStmt->bind_param( 'iiisssissiisssi',
			$imageId, $resolvedModelId, $resolvedModelVersionId, $imageFilename,
			$promptText, $copyAllText, $favorite, $dbWorkflowHash, $dbParametersHash,
			$resolvedModelId, $resolvedModelVersionId, $imageFilename,
			$promptText, $copyAllText, $favorite );
		$updateStmt->execute();
		$updateStmt->close();
	}

	$db->close();
	sendResponse( true, $imageId, $promptText, $copyAllText, $favorite, $dbWorkflowHash, $dbParametersHash, false );

} catch( Exception $e ) {
	ApiResponse::sendJson( [
		'success' => false,
		'error'   => 'Exception: ' . $e->getMessage()
	] );
}
