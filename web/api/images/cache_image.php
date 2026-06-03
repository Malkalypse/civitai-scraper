<?php
/** Image Cache Handler — Civitai-specific endpoint.
 *
 * Extends AbstractImageCacheHandler with:
 *   - URL normalisation via CivitaiUrl::toThumbnailUrl
 *   - B2 ↔ CDN fallback URL construction
 *   - Model/version metadata persistence after a successful save
 */

// Clean any previous output, then start buffering to catch errors.
while( ob_get_level() ) ob_end_clean();
ob_start();

ini_set( 'log_errors', '1' );
ini_set( 'error_log', __DIR__ . '/../../cache/error.log' );
ini_set( 'display_errors', '0' );
error_reporting( E_ALL );

header( 'Content-Type: application/json' );

require_once __DIR__ . '/../../config/site.php';
require_once __DIR__ . '/../civitai_url_utils.php';
require_once __DIR__ . '/../../packages/image-cache/AbstractImageCacheHandler.php';


class CivitaiImageCacheHandler extends AbstractImageCacheHandler {

	public function __construct( string $cacheDir, string $metadataDir ) {
		parent::__construct( $cacheDir, $metadataDir );
		$this->pythonScriptPath = __DIR__ . '/../../python/optimize_image.py';
	}

	protected function normalizeUrl( string $url ): string {
		return CivitaiUrl::toThumbnailUrl( $url, 'anim=false,width=450,optimized=true', true );
	}

	protected function getFallbackUrls( string $primaryUrl ): array {
		$fallbacks = [];

		if( strpos( $primaryUrl, SITE_STORAGE_BASE . '/' ) === 0 ) {
			// B2 failed — try both CDN origins
			$uuid = explode( '/', substr( $primaryUrl, strlen( SITE_STORAGE_BASE . '/' ) ) )[0] ?? null;
			if( $uuid ) {
				$fallbacks[] = SITE_CDN_BASE   . '/' . SITE_CDN_HASH . '/' . $uuid . '/original=true';
				$fallbacks[] = SITE_CDN_LEGACY . '/' . SITE_CDN_HASH . '/' . $uuid . '/original=true';
			}
		} elseif( stripos( $primaryUrl, SITE_CDN_BASE ) !== false || stripos( $primaryUrl, SITE_CDN_LEGACY ) !== false ) {
			// CDN failed — try B2 first, then the other CDN origin
			$b2Url = CivitaiUrl::toOriginalUrl( $primaryUrl );
			if( $b2Url !== $primaryUrl ) {
				$fallbacks[] = $b2Url;
			}
			if( stripos( $primaryUrl, SITE_CDN_BASE ) !== false ) {
				$fallbacks[] = str_ireplace( SITE_CDN_BASE, SITE_CDN_LEGACY, $primaryUrl );
			} else {
				$fallbacks[] = str_ireplace( SITE_CDN_LEGACY, SITE_CDN_BASE, $primaryUrl );
			}
		}

		return $fallbacks;
	}

	protected function onImageStored( $imageId, array $input, ImageCacheManager $cache ): void {
		if( !$imageId ) {
			return;
		}
		$cache->upsertImageGenerationMetadata( $imageId, [
			'modelId'        => $input['modelId']  ?? null,
			'modelVersionId' => $input['versionId'] ?? null
		] );
	}
}


$cacheDir      = __DIR__ . '/../../cache/images';
$generationDir = __DIR__ . '/../../cache/image_generation';
$handler       = new CivitaiImageCacheHandler( $cacheDir, $generationDir );
$input         = json_decode( file_get_contents( 'php://input' ), true ) ?? [];
$handler->handle( $input );
