<?php
/** Extract Workflow JSON from full-size PNG metadata */

// Increase limits for image processing
ini_set( 'memory_limit', '512M' );
set_time_limit( 120 );

error_reporting( E_ALL );
ini_set( 'display_errors', '0' );

$capturedErrors = [];

set_error_handler( static function( $errno, $errstr, $errfile, $errline ) use( &$capturedErrors ) {
	$capturedErrors[] = [
		'number'  => $errno,
		'message' => $errstr,
		'file'    => $errfile,
		'line'    => $errline
	];
	return false;
} );

require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../civitai_url_utils.php';
require_once __DIR__ . '/../http_utils.php';
require_once __DIR__ . '/../json_utils.php';
require_once __DIR__ . '/jpeg_metadata_utils.php';
require_once __DIR__ . '/png_metadata_utils.php';

header( 'Content-Type: application/json' );
header( 'X-Content-Type-Options: nosniff' );

/** Emit a JSON response and terminate execution.
 * @param mixed $payload Response payload
 * @param int $statusCode HTTP status code
 * @param int $jsonFlags Optional json_encode flags
 */
function api_respond_json_and_exit( $payload, $statusCode = 200, $jsonFlags = 0 ) {
	http_response_code( (int)$statusCode );
	echo json_encode( $payload, (int)$jsonFlags );
	exit;
}

$input              = json_decode( file_get_contents( 'php://input' ), true );
$imageId            = isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;
$imagePageUrl       = isset( $input['imagePageUrl'] ) ? trim( ( string )$input['imagePageUrl'] ) : '';
$fullImageUrlInput  = isset( $input['fullImageUrl'] ) ? trim( ( string )$input['fullImageUrl'] ) : '';

// Fetch only the first $maxBytes of an image URL using an HTTP Range request.
// PNG tEXt/zTXt/iTXt chunks always precede IDAT, so the first 4MB is more than
// enough to capture any workflow metadata without downloading the entire file.

/** Extract JPEG comment and APP1 segments from binary JPEG data
 * @param string $url URL to extract image ID from
 * @return int Extracted image ID (or 0 if not found)
 */
function extractImageIdFromPageUrl( string $url ): int {
	if( $url === '' ) {
		return 0;
	}

	if( preg_match( '~(?:^|/)images/(\d+)(?:[/?#].*)?$~i', $url, $matches ) ) {
		return ( int )$matches[1];
	}

	return 0;
}

/** Extract image URL from Civitai REST API or page scrape by image ID
 * @param int $imageId Image ID value
 * @return string Resolved image URL (or empty string if not found)
 */
function resolveImageUrlFromCivitaiById( int $imageId ): string {
	if( $imageId <= 0 ) {
		return '';
	}

	$apiUrl = SITE_URL_API_REST . '/images?imageId=' . $imageId;
	$response = api_http_get( $apiUrl, 20 );
	if( $response['ok'] ) {
		$decoded = json_decode( $response['body'], true );
		if( is_array( $decoded ) ) {
			$items = $decoded['items'] ?? null;
			if( is_array( $items ) && count( $items ) > 0 && is_array( $items[0] ) ) {
				$first = $items[0];
				if( isset( $first['url'] ) && is_string( $first['url'] ) && trim( $first['url'] ) !== '' ) {
					return api_civitai_to_original_url( trim( $first['url'] ) );
				}
			}

			if( isset( $decoded['url'] ) && is_string( $decoded['url'] ) && trim( $decoded['url'] ) !== '' ) {
				return api_civitai_to_original_url( trim( $decoded['url'] ) );
			}
		}
	}

	// API lookup failed or returned no items — scrape og:image from the image page
	$pageUrl      = SITE_URL_IMAGES . '/' . $imageId;
	$pageResponse = api_http_get( $pageUrl, 20 );
	if( $pageResponse['ok'] ) {
		if( preg_match( '~<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](https?://[^"\']+)["\']~i', $pageResponse['body'], $m ) ) {
			return api_civitai_to_original_url( $m[1] );
		}
		if( preg_match( '~<meta[^>]+content=["\'](https?://[^"\']+)["\'][^>]+property=["\']og:image["\']~i', $pageResponse['body'], $m ) ) {
			return api_civitai_to_original_url( $m[1] );
		}
	}

	return '';
}

/** Resolve image URL candidates from Civitai by image ID using multiple methods (API, tRPC, page scrape)
 * @param int $imageId Image ID value
 * @return array Resolved image URL candidates (empty array if not found)
 */
function resolveImageUrlCandidatesFromCivitaiById( int $imageId ): array {
	if( $imageId <= 0 ) {
		return [];
	}

	$candidates = [];
	$pushUnique = static function( string $url ) use( &$candidates ): void {
		$trimmed = trim( $url );
		if( $trimmed === '' ) {
			return;
		}

		if( !in_array( $trimmed, $candidates, true ) ) {
			$candidates[] = $trimmed;
		}
	};

	// Preferred: tRPC image.get often returns the canonical UUID for the original image.
	$trpcUrl = SITE_URL_API_TRPC . '/' . SITE_TRPC_IMAGE_GET . '?input=' . rawurlencode('{"json":{"id":' . $imageId . '}}');
	$trpcResponse = api_http_get( $trpcUrl, 20 );
	if( $trpcResponse['ok'] ) {
		$trpcDecoded = json_decode( $trpcResponse['body'], true );
		$trpcImage = $trpcDecoded['result']['data']['json'] ?? null;
		if( is_array( $trpcImage ) && isset( $trpcImage['url'] ) && is_string( $trpcImage['url'] ) && trim( $trpcImage['url'] ) !== '' ) {
			$raw = trim( $trpcImage['url'] );
			if (stripos($raw, 'http://') === 0 || stripos($raw, 'https://') === 0) {
				$pushUnique( api_civitai_to_original_url( $raw ) );
			} else {
				$pushUnique( SITE_STORAGE_BASE . '/' . $raw . '/original' );
			}
		}
	}

	$restResolved = resolveImageUrlFromCivitaiById( $imageId );
	if( $restResolved !== '' ) {
		$pushUnique( $restResolved );
	}

	$pageUrl      = SITE_URL_IMAGES . '/' . $imageId;
	$pageResponse = api_http_get( $pageUrl, 20 );
	if( $pageResponse['ok'] ) {
		if( preg_match( '~<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](https?://[^"\']+)["\']~i', $pageResponse['body'], $m ) ) {
			$pushUnique( api_civitai_to_original_url( $m[1] ) );
		}
		if( preg_match( '~<meta[^>]+content=["\'](https?://[^"\']+)["\'][^>]+property=["\']og:image["\']~i', $pageResponse['body'], $m ) ) {
			$pushUnique( api_civitai_to_original_url( $m[1] ) );
		}
	}

	return $candidates;
}

/** Select workflow JSON from metadata entries based on heuristics and preferred keys
 * @param array $entries Metadata entries to evaluate
 * @return array Selected workflow with keys 'key' (metadata keyword) and 'workflowText' (formatted JSON), or empty values if not found
 */
function selectWorkflowFromEntries( array $entries ): array {
	if( count( $entries ) === 0 ) {
		return ['key' => '', 'workflowText' => ''];
	}

	/** Heuristic to identify if decoded JSON looks like a ComfyUI prompt map (which is often used as a lightweight workflow representation in PNG metadata)
	 * @param mixed $decoded Decoded JSON value to evaluate
	 * @return bool True if it looks like a ComfyUI prompt map, false otherwise
	 */
	$looksLikeComfyPromptMap = static function( $decoded ): bool {
		if( !is_array( $decoded ) || count( $decoded ) === 0 ) {
			return false;
		}

		$checked = 0;
		foreach ( $decoded as $nodeId => $nodeDef ) {
			// Prompt-map format uses numeric (often stringified) node IDs as top-level keys.
			if( !is_scalar( $nodeId ) || !preg_match( '/^\d+$/', (string)$nodeId ) ) {
				continue;
			}

			if( !is_array( $nodeDef ) ) {
				continue;
			}

			$hasInputs		= isset( $nodeDef['inputs'] ) && is_array( $nodeDef['inputs'] );
			$hasClassType	= isset( $nodeDef['class_type'] ) && is_string( $nodeDef['class_type'] ) && trim( $nodeDef['class_type'] ) !== '';
			if( $hasInputs || $hasClassType ) {
				return true;
			}

			$checked++;
			if( $checked >= 20 ) {
				break;
			}
		}

		return false;
	};

	/** Heuristic to identify if decoded JSON looks like a workflow representation (either ComfyUI or more general)
	 * @param mixed $decoded Decoded JSON value to evaluate
	 * @return bool True if it looks like a workflow, false otherwise
	 */
	$looksLikeWorkflow = static function( $decoded ) use ( $looksLikeComfyPromptMap ): bool {
		if( !is_array( $decoded ) ) {
			return false;
		}

		if( isset( $decoded['nodes'] ) || isset( $decoded['last_node_id'] ) || isset( $decoded['prompt'] ) || isset( $decoded['extra_data'] ) ) {
			return true;
		}

		return $looksLikeComfyPromptMap( $decoded );
	};

	$preferredKeys = ['workflow', 'comfyui_workflow', 'comfy_workflow', 'comfyui', 'prompt'];

	foreach( $preferredKeys as $preferredKey ) {
		foreach( $entries as $entry ) {
			$key = strtolower( trim( ( string )( $entry['keyword'] ?? '' ) ) );
			$text = ( string )( $entry['text'] ?? '' );
			if( $key !== $preferredKey ) {
				continue;
			}

			$decoded = api_try_decode_json( $text );
			if( $decoded !== null && $looksLikeWorkflow( $decoded ) ) {
				return [
					'key'						=> ( string )( $entry['keyword'] ?? '' ),
					'workflowText'	=> json_encode( $decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES )
				];
			}
		}
	}

	foreach( $entries as $entry ) {
		$decoded = api_try_decode_json( ( string )( $entry['text'] ?? '' ) );
		if( !is_array( $decoded ) ) {
			continue;
		}

		if( $looksLikeWorkflow( $decoded ) ) {
			return [
				'key'						=> ( string )( $entry['keyword'] ?? '' ),
				'workflowText'	=> json_encode( $decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES )
			];
		}
	}

	return ['key' => '', 'workflowText' => ''];
}

/** Select parameters text from metadata entries based on heuristics and preferred keys
 * @param array $entries Metadata entries to evaluate
 * @return array Selected parameters with keys 'key' (metadata keyword) and 'parametersText' (formatted text), or empty values if not found
 */
function selectParametersFromEntries( array $entries ): array {
	if( count( $entries ) === 0 ) {
		return ['key' => '', 'parametersText' => ''];
	}

	$looksLikeA1111 = static function( string $text ): bool {
		$normalized = trim( $text );
		if( $normalized === '' ) {
			return false;
		}

		return stripos( $normalized, 'negative prompt:' ) !== false
			|| stripos( $normalized, 'steps:' ) !== false
			|| stripos( $normalized, 'sampler:' ) !== false;
	};

	// First pass: prefer explicit `parameters` keys used by PNG metadata.
	foreach( $entries as $entry ) {
		$key = strtolower( trim( ( string )( $entry['keyword'] ?? '' ) ) );
		if( $key !== 'parameters' ) {
			continue;
		}

		$text = trim( ( string )( $entry['text'] ?? '' ) );
		if( $looksLikeA1111( $text ) ) {
			return [
				'key'							=> ( string )( $entry['keyword'] ?? '' ),
				'parametersText'	=> $text
			];
		}
	}

	// Second pass: JPEG metadata commonly stores A1111 text under comment/xmp/user-comment keys.
	foreach( $entries as $entry ) {
		$text = trim( ( string )( $entry['text'] ?? '' ) );
		if( $looksLikeA1111( $text ) ) {
			return [
				'key'							=> ( string )( $entry['keyword'] ?? '' ),
				'parametersText'	=> $text
			];
		}
	}

	return ['key' => '', 'parametersText' => ''];
}

/** Resolve image URL from Civitai REST API by image ID
 * @param int $imageId Image ID value
 * @return string Resolved image URL (empty string if not found)
 */
function resolveImageUrlFromRestApi( int $imageId ): string {
	if( $imageId <= 0 ) {
		return '';
	}

	$response = api_http_get( SITE_URL_API_REST . '/images?imageId=' . $imageId, 20 );
	if( !$response['ok'] ) {
		return '';
	}

	$decoded = json_decode( $response['body'], true );
	if( !is_array( $decoded ) ) {
		return '';
	}

	$items = $decoded['items'] ?? null;
	if( is_array( $items ) && count( $items ) > 0 && is_array( $items[0] ) ) {
		$url = $items[0]['url'] ?? '';
		if( is_string( $url ) && trim( $url ) !== '' ) {
			return api_civitai_to_original_url( trim( $url ) );
		}
	}

	return '';
}

/** Resolve image URL from Civitai TRPC API by image ID
 * @param int $imageId Image ID value
 * @return string Resolved image URL (empty string if not found)
 */
function resolveImageUrlFromTrpc( int $imageId ): string {
	if( $imageId <= 0 ) {
		return '';
	}

	$trpcUrl	= SITE_URL_API_TRPC . '/' . SITE_TRPC_IMAGE_GET . '?input=' . rawurlencode( '{"json":{"id":' . $imageId . '}}' );
	$response	= api_http_get( $trpcUrl, 20 );
	if( !$response['ok'] ) {
		return '';
	}

	$decoded = json_decode( $response['body'], true );
	$imageData = $decoded['result']['data']['json'] ?? null;
	if( !is_array( $imageData ) ) {
		return '';
	}

	$raw = isset($imageData['url']) && is_string($imageData['url']) ? trim( $imageData['url'] ) : '';
	if( $raw === '' ) {
		return '';
	}

	if( stripos( $raw, 'http' ) === 0 ) {
		return api_civitai_to_original_url( $raw );
	}

	return SITE_STORAGE_BASE . '/' . $raw . '/original';
}

/** Extract Civitai image UUID from various forms of URLs
 * @param string $url URL to extract image ID from
 * @return string Extracted image UUID (empty string if not found)
 */
function extractCivitaiUuid( string $url ): string {
	if( preg_match( '~/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:/|$)~i', $url, $m ) ) {
		return strtolower( $m[1] );
	}
	return '';
}

// Build the ordered list of candidate URLs to try, most reliable first.
// For each resolved URL, both the B2 form and the image.civitai.com CDN form are added
// so that whichever storage backend hosts the original PNG for this image is covered.
// (Some images 404 on B2 but serve the original PNG from the CDN with /original=true.)

/** Build a list of candidate image URLs to try for metadata extraction, based on the caller URL and image ID.
 * @param string	$callerUrl	URL of the caller
 * @param int			$imageId		ID of the image
 * @return array list of candidate URLs
 */
function buildImageUrlCandidates( string $callerUrl, int $imageId ): array {
	$candidates = [];

	$addUnique = static function( string $url ) use( &$candidates ): void {
		$url = trim( $url );
		if( $url !== '' && !in_array( $url, $candidates, true ) ) {
			$candidates[] = $url;
		}
	};

	$addWithPngForms = static function( string $url ) use( $addUnique ): void {
		if( $url === '' ) {
			return;
		}
		$addUnique( $url );
		$uuid = extractCivitaiUuid( $url );
		if( $uuid !== '' ) {
			$addUnique( SITE_STORAGE_BASE . '/' . $uuid . '/original' );
			$addUnique( SITE_CDN_LEGACY . '/' . SITE_CDN_HASH . '/' . $uuid . '/original=true' );
		}
	};

	if( $callerUrl !== '' ) {
		$addWithPngForms( api_civitai_to_original_url( $callerUrl ) );
	}

	// Only call the remote APIs when the caller URL didn't already give us a UUID to work with.
	// Each API call can take up to 20 seconds (timeout); skipping them when unnecessary prevents
	// the script from being killed by Apache's connection timeout before the image is downloaded.
	$callerUuid = $callerUrl !== '' ? extractCivitaiUuid( $callerUrl ) : '';
	if( $imageId > 0 && $callerUuid === '' ) {
		$addWithPngForms( resolveImageUrlFromTrpc( $imageId ) );
		$addWithPngForms( resolveImageUrlFromRestApi( $imageId ) );
	}

	return $candidates;
}

try {
	$resolvedImageId	= $imageId > 0 ? $imageId : extractImageIdFromPageUrl( $imagePageUrl );
	$candidates				= buildImageUrlCandidates( $fullImageUrlInput, $resolvedImageId );
	
	if( count( $candidates ) === 0 ) {
		api_respond_json_and_exit( [
			'success'							=> false,
			'error'								=> 'Could not resolve full-size image URL',
			'imageId'							=> $resolvedImageId,
			'passedImageId'				=> $imageId,
			'passedPageUrl'				=> $imagePageUrl,
			'passedFullImageUrl'	=> $fullImageUrlInput
		] );
	}

	$downloadedUrl			= '';
	$lastHttpCode				= 0;
	$lastError					= '';
	$entries						= [];
	$selected						= ['key' => '', 'workflowText' => ''];
	$selectedParameters	= ['key' => '', 'parametersText' => ''];
	$confirmedPng				= false;
	$attemptedUrls			= [];
	$downloadAttempts		= 0;
	$lastFormat					= 'unknown';

	foreach( $candidates as $candidateUrl ) {
		$downloadAttempts++;
		$attemptedUrls[] = ['url' => $candidateUrl, 'attempt' => $downloadAttempts];

		$imageResponse = api_http_get_partial( $candidateUrl );
		if( !$imageResponse['ok'] ) {
			$lastHttpCode	= ( int )$imageResponse['httpCode'];
			$lastError		= $imageResponse['error'] ?? 'HTTP ' . $lastHttpCode;
			continue;
		}

		$binary	= $imageResponse['body'];
		$isPng	= strlen( $binary ) >= 8 && substr( $binary, 0, 8 ) === "\x89PNG\r\n\x1a\n";
		$isJpeg	= !$isPng && strlen( $binary ) >= 2 && substr( $binary, 0, 2 ) === "\xFF\xD8";

		if( $isPng ) {
			// PNG is the authoritative source: if it contains no workflow, no other URL will either.
			$lastFormat					= 'PNG';
			$confirmedPng				= true;
			$downloadedUrl			= $candidateUrl;
			$entries						= api_parse_png_text_chunks( $binary );
			$selected						= selectWorkflowFromEntries( $entries );
			$selectedParameters	= selectParametersFromEntries( $entries );
			break;
		} elseif( $isJpeg ) {
			$lastFormat					= 'JPEG';
			$downloadedUrl			= $candidateUrl;
			$entries						= api_parse_jpeg_metadata_entries( $binary );
			$selected						= selectWorkflowFromEntries( $entries );
			$selectedParameters	= selectParametersFromEntries( $entries );
			error_log( "Selected workflow: " . ( strlen( $selected['workflowText'] ) > 0 ? 'yes' : 'no' ) );
			if( $selected['workflowText'] !== '' ) {
				break;
			}
			// JPEG with no workflow: keep trying in case a later candidate returns the original PNG.
		} else {
			$lastFormat = 'unknown';
			// Non-PNG, non-JPEG (WebP, AVIF, etc.): these formats never carry ComfyUI workflow
			// metadata, so the original image simply has no workflow. Stop trying further candidates.
			$downloadedUrl = $candidateUrl;
			error_log( "Downloaded unknown format from $candidateUrl" );
			break;
		}
	}

	if( $downloadedUrl === '' ) {
		api_respond_json_and_exit( [
			'success'						=> false,
			'error'							=> 'Failed to download image',
			'httpCode'					=> $lastHttpCode,
			'fetchError'				=> $lastError,
			'imageId'						=> $resolvedImageId,
			'attemptedUrls'			=> $attemptedUrls,
			'downloadAttempts'	=> $downloadAttempts
		] );
	}

	if( $selected['workflowText'] === '' ) {
		if( $selectedParameters['parametersText'] !== '' ) {
			api_respond_json_and_exit( [
				'success'					=> true,
				'mode'						=> 'parameters',
				'message'					=> 'Parameters data found',
				'errorCode'				=> 'PARAMETERS_FOUND',
				'chunkCount'			=> count( $entries ),
				'imageId'					=> $resolvedImageId,
				'sourceKeyword'		=> $selectedParameters['key'],
				'parametersText'	=> mb_convert_encoding( $selectedParameters['parametersText'], 'UTF-8', 'UTF-8' ),
				'downloadedUrl'		=> $downloadedUrl,
				'format'					=> $lastFormat
			], 200, JSON_INVALID_UTF8_SUBSTITUTE );
		}

		// No workflow and no parameters found
		api_respond_json_and_exit( [
			'success'				=> false,
			'error'					=> 'No data',
			'errorCode'			=> 'WORKFLOW_NOT_FOUND',
			'chunkCount'		=> count( $entries ),
			'imageId'				=> $resolvedImageId,
			'downloadedUrl'	=> $downloadedUrl,
			'format'				=> $lastFormat,
			'confirmedPng'	=> $confirmedPng
		] );
	}

	api_respond_json_and_exit( [
		'success'				=> true,
		'imageId'				=> $resolvedImageId,
		'imageUrl'			=> $downloadedUrl,
		'sourceKeyword'	=> $selected['key'],
		'workflowText'	=> $selected['workflowText']
	], 200, JSON_INVALID_UTF8_SUBSTITUTE );
} catch( Throwable $e ) {
	api_respond_json_and_exit( [
		'success'					=> false,
		'error'						=> 'Exception: ' . $e->getMessage(),
		'type'						=> get_class( $e ),
		'file'						=> $e->getFile(),
		'line'						=> $e->getLine(),
		'capturedErrors'	=> $capturedErrors
	], 500 );
}
