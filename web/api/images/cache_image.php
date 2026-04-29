<?php
/** Image Cache Handler
 * 
 * Downloads and caches images locally, or serves from cache if available
 */

// Clean any previous output
while( ob_get_level() ) ob_end_clean();

require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../civitai_url_utils.php';

// Start output buffering to catch any errors
ob_start();

// Log errors to a file instead of outputting them
ini_set( 'log_errors', '1' );
ini_set( 'error_log', __DIR__ . '/../../cache/error.log' );
ini_set( 'display_errors', '0' );
error_reporting( E_ALL );

header( 'Content-Type: application/json' );


/** Extract image id from URL if it matches known patterns
 * @param mixed $url URL string to extract image ID from
 * @return mixed Image ID as integer (null if not found)
 */
function imageIdFromUrl( $url ) {
	if( !is_string( $url ) || $url === '' ) {
		return null;
	}

	if( preg_match( '~/(\d+)\.(?:jpe?g|png|webp|gif|avif|mp4|webm)(?:[?#].*)?$~i', $url, $matches ) ) {
		return ( int )$matches[1];
	}

	if( preg_match( '~(?:^|/)images/(\d+)(?:[/?#].*)?$~i', $url, $matches ) ) {
		return ( int )$matches[1];
	}

	return null;
}


/** Resolve a single cached image from metadata
 * @param mixed $imageId	Image ID to look up
 * @param mixed $cacheDir	Cache directory path
 * @return mixed Associative array with keys 'path', 'filename', 'url' if found, or null if not found or on error
 */
function resolveCachedImage( $imageId, $cacheDir ) {
	if( !is_numeric( $imageId ) || ( int )$imageId <= 0 || !is_string( $cacheDir ) || $cacheDir === '' ) {
		return null;
	}

	$imageId = ( int )$imageId;
	$metadataPath = __DIR__ . '/../../cache/image_generation/' . $imageId . '.json';
	if( !is_file( $metadataPath ) ) {
		return null;
	}

	$raw = @file_get_contents( $metadataPath );
	if( $raw === false ) {
		return null;
	}

	$decoded = json_decode( $raw, true );
	if( !is_array( $decoded ) ) {
		return null;
	}

	$imageFilename = isset( $decoded['imageFilename'] ) ? trim((string)$decoded['imageFilename']) : '';
	if( $imageFilename === '' ) {
		return null;
	}

	$safeFilename = basename( $imageFilename );
	if( $safeFilename === '' || $safeFilename === '.' || $safeFilename === '..' ) {
		return null;
	}

	$candidatePath = $cacheDir . '/' . $safeFilename;
	if( !is_file( $candidatePath ) ) {
		return null;
	}

	return [
		'path'			=> $candidatePath,
		'filename'	=> $safeFilename,
		'url'				=> 'cache/images/' . $safeFilename
	];
}


/** Emit a standard cached-image response payload.
 * @param mixed $localUrl Local cached URL
 * @param mixed $filename Cached filename
 * @param mixed $imageId Image ID value
 */
function respondWithCachedImage( $localUrl, $filename, $imageId ) {
	respondJsonAndExit( [
		'cached'		=> true,
		'localUrl'	=> $localUrl,
		'filename'	=> $filename,
		'imageId'		=> $imageId
	] );
}

/** Emit a JSON payload and terminate request execution.
 * @param mixed $payload Response payload
 */
function respondJsonAndExit( $payload ) {
	ob_end_clean();
	echo json_encode( $payload );
	exit;
}


/** Build cache filenames, paths, and URLs for primary and legacy naming schemes.
 * @param mixed $imageUr	Source image URL
 * @param mixed $imageId	Image ID value
 * @param mixed $cacheDir	Cache directory path
 * @return mixed Associative array of derived cache naming/path values
 */
function buildCachePathsForImage( $imageUrl, $imageId, $cacheDir ) {
	$matches = [];
	preg_match( '/\/([a-f0-9\-]{36})\//i', $imageUrl, $matches );

	if( !$matches ) {
		$baseName = md5( $imageUrl );
	} else {
		$baseName = $matches[1] . '-' . substr( md5( $imageUrl ), 0, 10 );
	}

	$filename = ( $imageId && $imageId > 0 )
		? ( ( int )$imageId . '-' . $baseName )
		: $baseName;

	$extension = 'jpg';
	if( preg_match( '/\.(jpe?g|png|webp|gif)($|\?)/i', $imageUrl, $extMatch ) ) {
		$extension = strtolower( $extMatch[1] );
		if( $extension === 'jpeg' ) {
			$extension = 'jpg';
		}
	}

	$legacyFilename = $baseName;

	return [
		'baseName'					=> $baseName,
		'filename'				=> $filename,
		'imageFilename'		=> $filename . '.' . $extension,
		'extension'				=> $extension,
		'cachedFilePath'	=> $cacheDir . '/' . $filename . '.' . $extension,
		'cachedFileUrl'		=> 'cache/images/' . $filename . '.' . $extension,
		'legacyFilename'		=> $legacyFilename,
		'legacyImageFilename' => $legacyFilename . '.' . $extension,
		'legacyCachedFilePath' => $cacheDir . '/' . $legacyFilename . '.' . $extension,
		'legacyCachedFileUrl' => 'cache/images/' . $legacyFilename . '.' . $extension
	];
}


/** Remove cached image if its max side exceeds the allowed thumbnail size.
 * @param mixed $filePath	Cached image file path
 * @param mixed $maxSide	Maximum allowed side length
 */
function removeOversizedCachedImage( $filePath, $maxSide = 450 ) {
	if( !file_exists( $filePath ) ) {
		return;
	}

	$imageSize = @getimagesize( $filePath );
	if( !is_array( $imageSize ) || !isset( $imageSize[0], $imageSize[1] ) ) {
		return;
	}

	$cachedMaxSide = max( ( int )$imageSize[0], ( int )$imageSize[1] );
	if( $cachedMaxSide > ( int )$maxSide ) {
		@unlink( $filePath );
	}
}


/** Persist model/image metadata only when a valid image ID exists.
 * @param mixed $imageId				Image ID value
 * @param mixed $modelId				Model ID value
 * @param mixed $modelVersionId	Model version ID value
 * @param mixed $imageFilename	Cached image filename
 */
function persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $imageFilename ) {
	if( !$imageId ) {
		return;
	}

	upsertImageGenerationMetadata( $imageId, [
		'modelId'					=> $modelId,
		'modelVersionId'	=> $modelVersionId,
		'imageFilename'		=> $imageFilename
	] );
}
/** Upsert image generation metadata
 * @param mixed $imageId Image ID value
 * @param mixed $payload Payload value (associative array with keys like 'modelId', 'modelVersionId', 'imageFilename')
 */
function upsertImageGenerationMetadata( $imageId, $payload ) {
	if( !is_numeric( $imageId ) || ( int )$imageId <= 0 || !is_array( $payload ) ) {
		return;
	}

	$imageId = ( int )$imageId;
	$generationDir = __DIR__ . '/../../cache/image_generation';
	if( !is_dir( $generationDir ) ) {
		@mkdir( $generationDir, 0755, true );
	}

	$filePath = $generationDir . '/' . $imageId . '.json';
	$existing = [];
	if( is_file( $filePath ) ) {
		$raw = @file_get_contents( $filePath );
		if( $raw !== false ) {
			$decoded = json_decode( $raw, true );
			if( is_array( $decoded ) ) {
				$existing = $decoded;
			}
		}
	}

	$merged = $existing;
	if( isset( $merged['sourceUrl'] ) ) {
		unset( $merged['sourceUrl'] );
	}
	$merged['imageId'] = $imageId;
	foreach( $payload as $key => $value ) {
		if( $value === null || $value === '' ) {
			continue;
		}
		$merged[$key] = $value;
	}
	$merged['updatedAt'] = date('c');

	@file_put_contents( $filePath, json_encode( $merged ) );
}

/** Optimize image bytes using python/optimize_image.py
 * @param mixed $imageData	Raw image bytes
 * @param mixed $destPath		Where to save optimized image
 * @param mixed $extension	Image file extension (e.g., 'jpg', 'png', 'webp')
 * @param mixed $maxSide		Maximum side length for resizing
 * @param mixed $quality		Image quality for optimization
 * @return mixed True on success, false on failure
 */
function optimizeWithPythonFromBytes(
	$imageData,
	$destPath,
	$extension,
	$maxSide = 450,
	$quality = 75
) {
	if( !is_string( $imageData ) || $imageData === '' ) {
		return false;
	}

	$tmpSource = tempnam( sys_get_temp_dir(), 'civitai_src_' );
	if( $tmpSource === false ) {
		return false;
	}

	$tmpSourceWithExt = $tmpSource . '.' . $extension;
	@rename( $tmpSource, $tmpSourceWithExt );

	if( file_put_contents( $tmpSourceWithExt, $imageData ) === false ) {
		@unlink( $tmpSourceWithExt );
		return false;
	}

	$pythonScript = __DIR__ . '/../../python/optimize_image.py';
	$command = sprintf(
		'python %s %s %s %d %d 2>&1',
		escapeshellarg( $pythonScript ),
		escapeshellarg( $tmpSourceWithExt ),
		escapeshellarg( $destPath ),
		( int )$maxSide,
		( int )$quality
	);

	$output = shell_exec( $command );

	@unlink( $tmpSourceWithExt );

	if( !is_string( $output ) ) {
		return false;
	}

	return strpos( trim( $output ), 'SUCCESS' ) !== false && file_exists( $destPath );
}


/** Save image data to disk resized so largest side <= maxSide
 * - Returns true on successful save, false to allow caller fallback
 * @param mixed $imageData	Raw image bytes
 * @param mixed $destPath		Where to save resized image
 * @param mixed $extension	Image file extension (e.g., 'jpg', 'png', 'webp')
 * @param mixed $maxSide		Maximum side length for resizing
 * @return mixed True on success, false on failure
 */
function saveResizedImageData( $imageData, $destPath, $extension, $maxSide = 450) {
	if( !is_string( $imageData ) || $imageData === '' ) {
		return false;
	}

	if( !function_exists( 'imagecreatefromstring' ) ) {
		return false;
	}

	$source = @imagecreatefromstring( $imageData );
	if( !$source ) {
		return false;
	}

	$srcWidth		= imagesx( $source );
	$srcHeight	= imagesy( $source );
	if( $srcWidth <= 0 || $srcHeight <= 0 ) {
		unset( $source );
		return false;
	}

	$largestSide = max( $srcWidth, $srcHeight );
	if( $largestSide <= (int)$maxSide ) {
		$savedOriginal = file_put_contents( $destPath, $imageData ) !== false;
		unset( $source );
		return $savedOriginal;
	}

	$scale				= ( float )$maxSide / ( float )$largestSide;
	$targetWidth	= max( 1, ( int )round( $srcWidth * $scale ) );
	$targetHeight = max( 1, ( int )round( $srcHeight * $scale ) );

	$target = imagecreatetruecolor( $targetWidth, $targetHeight );
	if( !$target ) {
		unset( $source );
		return false;
	}

	if( $extension === 'png' ) {
		imagealphablending( $target, false );
		imagesavealpha( $target, true );
	}

	$resampled = imagecopyresampled(
		$target,
		$source,
		0,
		0,
		0,
		0,
		$targetWidth,
		$targetHeight,
		$srcWidth,
		$srcHeight
	);

	if( !$resampled ) {
		unset( $target );
		unset( $source );
		return false;
	}

	$saved = false;
	if( $extension === 'png' ) {
		$saved = imagepng( $target, $destPath, 6 );
	} elseif( $extension === 'webp' && function_exists( 'imagewebp' ) ) {
		$saved = imagewebp( $target, $destPath, 75 );
	} elseif( $extension === 'gif' ) {
		$saved = imagegif( $target, $destPath );
	} else {
		$saved = imagejpeg( $target, $destPath, 75 );
	}

	unset( $target );
	unset( $source );
	return $saved === true;
}


// -------------------- Runtime flow --------------------

// Get POST data
$input          = json_decode( file_get_contents( 'php://input' ), true );
$imageUrl       = $input['imageUrl'] ?? null;
$lookupUrl      = $input['lookupUrl'] ?? null;
$modelId        = $input['modelId'] ?? null;
$modelVersionId = $input['versionId'] ?? null;

if( !$imageUrl ) {
	respondJsonAndExit( ['error' => 'No image URL provided'] );
}

$imageUrl = api_civitai_to_thumbnail_url( $imageUrl, 'anim=false,width=450,optimized=true', true );

$imageId = imageIdFromUrl($imageUrl);
if( !$imageId && is_string( $lookupUrl ) && $lookupUrl !== '' ) {
	$imageId = imageIdFromUrl( $lookupUrl );
}

// Create cache directories if they don't exist
$cacheDir = __DIR__ . '/../../cache/images';
if( !file_exists( $cacheDir ) ) {
	mkdir( $cacheDir, 0755, true );
}

// Fast path: if metadata already knows the cached local filename for this image ID,
// return it immediately and avoid URL-hash mismatch misses.
if( $imageId ) {
	$metadataCached = resolveCachedImage( $imageId, $cacheDir );
	if( is_array( $metadataCached ) ) {
		respondWithCachedImage( $metadataCached['url'], $metadataCached['filename'], $imageId );
	}
}

$cachePaths = buildCachePathsForImage( $imageUrl, $imageId, $cacheDir );

// Get the download flag
$download = $input['download'] ?? false;

// Check if already cached (in final location)
if( file_exists( $cachePaths['cachedFilePath'] ) ) {
	removeOversizedCachedImage( $cachePaths['cachedFilePath'], 450 );

	if( file_exists( $cachePaths['cachedFilePath'] ) ) {
		persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $cachePaths['imageFilename'] );
		respondWithCachedImage( $cachePaths['cachedFileUrl'], $cachePaths['imageFilename'], $imageId );
	}
}

// Fallback: accept legacy non-prefixed cached filename to avoid cache misses after naming changes.
if( !file_exists( $cachePaths['cachedFilePath'] ) && file_exists( $cachePaths['legacyCachedFilePath'] ) ) {
	removeOversizedCachedImage( $cachePaths['legacyCachedFilePath'], 450 );

	if( file_exists( $cachePaths['legacyCachedFilePath'] ) ) {
		persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $cachePaths['legacyImageFilename'] );
		respondWithCachedImage( $cachePaths['legacyCachedFileUrl'], $cachePaths['legacyImageFilename'], $imageId );
	}
}

// If not cached and not requesting download, just return remote URL
if( !$download ) {
	respondJsonAndExit( [
		'cached'		=> false,
		'remoteUrl'	=> $imageUrl
	] );
}

// Download the image (only if download flag is true)
$ch = curl_init();
curl_setopt_array( $ch, [
	CURLOPT_URL							=> $imageUrl,
	CURLOPT_RETURNTRANSFER	=> true,
	CURLOPT_FOLLOWLOCATION	=> true,
	CURLOPT_TIMEOUT					=> 10,
	CURLOPT_CONNECTTIMEOUT	=> 5,
	CURLOPT_SSL_VERIFYPEER	=> false,
	CURLOPT_USERAGENT				=> 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
] );

$imageData	= curl_exec( $ch );
$httpCode		= curl_getinfo( $ch, CURLINFO_HTTP_CODE );

if( $imageData && $httpCode === 200 ) {
	$saved = optimizeWithPythonFromBytes( $imageData, $cachePaths['cachedFilePath'], $cachePaths['extension'], 450, 75 );
	if( !$saved ) {
		$saved = saveResizedImageData( $imageData, $cachePaths['cachedFilePath'], $cachePaths['extension'], 450 );
	}
	if( !$saved ) {
		file_put_contents( $cachePaths['cachedFilePath'], $imageData );
	}
	$finalSize = file_exists( $cachePaths['cachedFilePath'] ) ? filesize( $cachePaths['cachedFilePath'] ) : strlen( $imageData );

	persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $cachePaths['imageFilename'] );
	
	respondJsonAndExit( [
		'cached'				=> false,
		'downloaded'		=> true,
		'localUrl'			=> $cachePaths['cachedFileUrl'],
		'filename'			=> $cachePaths['imageFilename'],
		'optimizedSize'	=> $finalSize,
		'sourceUrl'			=> $imageUrl,
		'imageId'				=> $imageId
	] );
} else {
	respondJsonAndExit( [
		'error'			=> 'Failed to download image',
		'httpCode'	=> $httpCode,
		'remoteUrl'	=> $imageUrl
	] );
}

exit; // Ensure clean exit
