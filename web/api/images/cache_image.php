<?php
/** Image Cache Handler
 * 
 * Downloads and caches images locally, or serves from cache if available
 */

// Clean any previous output
while( ob_get_level() ) ob_end_clean();

require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../civitai_url_utils.php';
require_once __DIR__ . '/../http_utils.php';
require_once __DIR__ . '/image_cache_manager_utils.php';

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
	return ImageCacheManager::extractImageIdFromUrl( $url );
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
 * @param ImageCacheManager $cache	Cache manager instance
 */
function persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $imageFilename, ImageCacheManager $cache ) {
	if( !$imageId ) {
		return;
	}

	$cache->upsertImageGenerationMetadata( $imageId, [
		'modelId'					=> $modelId,
		'modelVersionId'	=> $modelVersionId,
		'imageFilename'		=> $imageFilename
	] );
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

$imageUrl = CivitaiUrl::toThumbnailUrl( $imageUrl, 'anim=false,width=450,optimized=true', true );

$imageId = ImageCacheManager::extractImageIdFromUrl( $imageUrl );
if( !$imageId && is_string( $lookupUrl ) && $lookupUrl !== '' ) {
	$imageId = ImageCacheManager::extractImageIdFromUrl( $lookupUrl );
}

// Create cache directories if they don't exist
$cacheDir = __DIR__ . '/../../cache/images';
$generationDir = __DIR__ . '/../../cache/image_generation';
$cache = new ImageCacheManager( $cacheDir, $generationDir );
$cache->ensureDirectories();

// Fast path: if metadata already knows the cached local filename for this image ID,
// return it immediately and avoid URL-hash mismatch misses.
if( $imageId ) {
	$metadataCached = $cache->resolveCachedImage( $imageId );
	if( is_array( $metadataCached ) ) {
		respondWithCachedImage(
			$metadataCached['url'],
			$metadataCached['filename'],
			$imageId
		);
	}
}

$cachePaths = $cache->buildCachePathsForImage( $imageUrl, $imageId );

// Get the download flag
$download = $input['download'] ?? false;

// Check if already cached (in final location)
if( file_exists( $cachePaths['cachedFilePath'] ) ) {
	removeOversizedCachedImage( $cachePaths['cachedFilePath'], 450 );

	if( file_exists( $cachePaths['cachedFilePath'] ) ) {
		persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $cachePaths['imageFilename'], $cache );
		respondWithCachedImage( $cachePaths['cachedFileUrl'], $cachePaths['imageFilename'], $imageId );
	}
}

// Fallback: accept legacy non-prefixed cached filename to avoid cache misses after naming changes.
if( !file_exists( $cachePaths['cachedFilePath'] ) && file_exists( $cachePaths['legacyCachedFilePath'] ) ) {
	removeOversizedCachedImage( $cachePaths['legacyCachedFilePath'], 450 );

	if( file_exists( $cachePaths['legacyCachedFilePath'] ) ) {
		persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $cachePaths['legacyImageFilename'], $cache );
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
$imageResult = HttpClient::get( $imageUrl, 10 );

if( $imageResult['ok'] ) {
	$imageData = $imageResult['body'];
	$saved = optimizeWithPythonFromBytes( $imageData, $cachePaths['cachedFilePath'], $cachePaths['extension'], 450, 75 );
	if( !$saved ) {
		$saved = saveResizedImageData( $imageData, $cachePaths['cachedFilePath'], $cachePaths['extension'], 450 );
	}
	if( !$saved ) {
		file_put_contents( $cachePaths['cachedFilePath'], $imageData );
	}
	$finalSize = file_exists( $cachePaths['cachedFilePath'] ) ? filesize( $cachePaths['cachedFilePath'] ) : strlen( $imageData );

	persistImageMetadataIfAvailable( $imageId, $modelId, $modelVersionId, $cachePaths['imageFilename'], $cache );
	
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
		'httpCode'	=> $imageResult['httpCode'],
		'remoteUrl'	=> $imageUrl
	] );
}

exit; // Ensure clean exit
