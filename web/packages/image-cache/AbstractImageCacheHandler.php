<?php

require_once __DIR__ . '/ImageCacheManager.php';

/** Generic base class for image cache endpoint handlers.
 *
 * Subclasses override hook methods to adapt behaviour for a specific source:
 *   normalizeUrl()    — canonicalize the incoming URL before cache lookup/download
 *   getFallbackUrls() — supply alternative URLs when the primary download fails
 *   onImageStored()   — persist extra metadata after a successful save
 */
abstract class AbstractImageCacheHandler {

	/** Path to a Python image-optimization script. Empty = Python step disabled. */
	protected string $pythonScriptPath = '';

	/** Maximum side length (px) for resized thumbnails. */
	protected int $maxSide = 450;

	/** JPEG quality used when saving. */
	protected int $quality = 75;

	/** HTTP download timeout in seconds. */
	protected int $downloadTimeout = 15;

	public function __construct(
		protected string $cacheDir,
		protected string $metadataDir
	) {}

	// ------------------------------------------------------------------ hooks

	/** Canonicalize the incoming URL. Override to apply CDN → origin conversions. */
	protected function normalizeUrl( string $url ): string {
		return $url;
	}

	/** Return ordered fallback URLs to try when the primary download fails.
	 * @return string[]
	 */
	protected function getFallbackUrls( string $primaryUrl ): array {
		return [];
	}

	/** Called after a successful image save. Override to persist extra metadata. */
	protected function onImageStored( $imageId, array $input, ImageCacheManager $cache ): void {}

	// ------------------------------------------------------------------ entry

	/** Process a cache request. Terminates request execution via respond(). */
	public function handle( array $input ): void {
		$imageUrl  = isset( $input['imageUrl'] ) ? ( string )$input['imageUrl'] : '';
		$lookupUrl = isset( $input['lookupUrl'] ) ? ( string )$input['lookupUrl'] : '';

		if( $imageUrl === '' ) {
			$this->respond( ['error' => 'No image URL provided'] );
		}

		$imageUrl = $this->normalizeUrl( $imageUrl );
		$imageId  = ImageCacheManager::extractImageIdFromUrl( $imageUrl );
		if( !$imageId && $lookupUrl !== '' ) {
			$imageId = ImageCacheManager::extractImageIdFromUrl( $lookupUrl );
		}

		$cache = new ImageCacheManager( $this->cacheDir, $this->metadataDir );
		$cache->ensureDirectories();

		// Fast path: canonical <imageId>.<ext> exists on disk
		if( $imageId ) {
			$hit = $cache->resolveCachedImage( $imageId );
			if( is_array( $hit ) ) {
				$this->removeOversizedCachedImage( $hit['path'] );
				if( file_exists( $hit['path'] ) ) {
					$this->respondCached( $hit['url'], $imageId );
				}
				// File was oversized and deleted — fall through to re-download
			}
		}

		$cachePaths = $cache->buildCachePathsForImage( $imageUrl, $imageId );
		$download   = !empty( $input['download'] );

		// Canonical filename exists — check for oversized, then serve
		if( file_exists( $cachePaths['cachedFilePath'] ) ) {
			$this->removeOversizedCachedImage( $cachePaths['cachedFilePath'] );
			if( file_exists( $cachePaths['cachedFilePath'] ) ) {
				$this->onImageStored( $imageId, $input, $cache );
				$this->respondCached( $cachePaths['cachedFileUrl'], $imageId );
			}
		}

		// Legacy filename — rename to canonical on hit
		if( !file_exists( $cachePaths['cachedFilePath'] ) && file_exists( $cachePaths['legacyCachedFilePath'] ) ) {
			$this->removeOversizedCachedImage( $cachePaths['legacyCachedFilePath'] );
			if( file_exists( $cachePaths['legacyCachedFilePath'] ) ) {
				@rename( $cachePaths['legacyCachedFilePath'], $cachePaths['cachedFilePath'] );
				$servePath = file_exists( $cachePaths['cachedFilePath'] )
					? $cachePaths['cachedFileUrl']
					: $cachePaths['legacyCachedFileUrl'];
				$this->onImageStored( $imageId, $input, $cache );
				$this->respondCached( $servePath, $imageId );
			}
		}

		if( !$download ) {
			$this->respond( ['cached' => false, 'remoteUrl' => $imageUrl] );
		}

		// Download the image
		$headers = ['Accept: image/*,*/*;q=0.8', 'Cache-Control: no-cache', 'Pragma: no-cache'];
		$result  = $this->fetchUrl( $imageUrl, $this->downloadTimeout, $headers );

		if( !$result['ok'] ) {
			foreach( $this->getFallbackUrls( $imageUrl ) as $fallbackUrl ) {
				$fallback = $this->fetchUrl( ( string )$fallbackUrl, $this->downloadTimeout, $headers );
				if( $fallback['ok'] ) {
					$result = $fallback;
					break;
				}
			}
		}

		if( $result['ok'] ) {
			$imageData = $result['body'];
			$dest      = $cachePaths['cachedFilePath'];
			$ext       = $cachePaths['extension'];

			$saved = $this->optimizeWithPython( $imageData, $dest, $ext );
			if( !$saved ) {
				$saved = $this->saveResized( $imageData, $dest, $ext );
			}
			if( !$saved ) {
				// Only write raw bytes when the image is already within the size limit.
				// If both resize paths failed on an oversized image, skip caching rather
				// than storing a full-resolution file.
				$rawSize = @getimagesizefromstring( $imageData );
				if( !$rawSize || max( (int)$rawSize[0], (int)$rawSize[1] ) <= $this->maxSide ) {
					$saved = file_put_contents( $dest, $imageData ) !== false;
				}
			}

			if( $saved || file_exists( $dest ) ) {
				$this->onImageStored( $imageId, $input, $cache );
				$this->respond( [
					'cached'        => false,
					'downloaded'    => true,
					'localUrl'      => $cachePaths['cachedFileUrl'],
					'optimizedSize' => file_exists( $dest ) ? ( int )filesize( $dest ) : strlen( $imageData ),
					'sourceUrl'     => $imageUrl,
					'imageId'       => $imageId
				] );
			}
		}

		$this->respond( [
			'error'     => 'Failed to download image',
			'httpCode'  => $result['httpCode'],
			'remoteUrl' => $imageUrl
		] );
	}

	// ------------------------------------------------------------------ http

	/** Fetch a URL via cURL, returning status and body.
	 * @return array{ok: bool, body: string, httpCode: int, error: string}
	 */
	protected function fetchUrl( string $url, int $timeout, array $headers = [] ): array {
		$ch = curl_init();
		curl_setopt_array( $ch, [
			CURLOPT_URL            => $url,
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_TIMEOUT        => $timeout,
			CURLOPT_SSL_VERIFYPEER => false,
			CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			CURLOPT_HTTPHEADER     => $headers,
			CURLOPT_ENCODING       => ''
		] );
		$body     = curl_exec( $ch );
		$httpCode = ( int )curl_getinfo( $ch, CURLINFO_HTTP_CODE );
		$error    = curl_error( $ch );
		curl_close( $ch );

		return [
			'ok'       => is_string( $body ) && $body !== '' && $httpCode >= 200 && $httpCode < 300,
			'body'     => is_string( $body ) ? $body : '',
			'httpCode' => $httpCode,
			'error'    => $error
		];
	}

	// ------------------------------------------------------------------ image processing

	/** Remove a cached image if its largest side exceeds $maxSide. */
	protected function removeOversizedCachedImage( string $filePath ): void {
		if( !file_exists( $filePath ) ) {
			return;
		}

		$size = @getimagesize( $filePath );
		if( !is_array( $size ) || !isset( $size[0], $size[1] ) ) {
			return;
		}

		if( max( ( int )$size[0], ( int )$size[1] ) > $this->maxSide ) {
			@unlink( $filePath );
		}
	}

	/** Optimize image bytes with the configured Python script.
	 * Returns false when the script is unavailable or execution fails.
	 */
	protected function optimizeWithPython( string $imageData, string $destPath, string $ext ): bool {
		if( $imageData === '' || $this->pythonScriptPath === '' || !is_file( $this->pythonScriptPath ) ) {
			return false;
		}

		$tmpSource = tempnam( sys_get_temp_dir(), 'img_src_' );
		if( $tmpSource === false ) {
			return false;
		}

		$tmpSourceWithExt = $tmpSource . '.' . $ext;
		@rename( $tmpSource, $tmpSourceWithExt );

		if( file_put_contents( $tmpSourceWithExt, $imageData ) === false ) {
			@unlink( $tmpSourceWithExt );
			return false;
		}

		$command = sprintf(
			'python %s %s %s %d %d 2>&1',
			escapeshellarg( $this->pythonScriptPath ),
			escapeshellarg( $tmpSourceWithExt ),
			escapeshellarg( $destPath ),
			$this->maxSide,
			$this->quality
		);

		$output = shell_exec( $command );
		@unlink( $tmpSourceWithExt );

		return is_string( $output )
			&& strpos( trim( $output ), 'SUCCESS' ) !== false
			&& file_exists( $destPath );
	}

	/** Save image data resized so its largest side ≤ $maxSide using PHP GD.
	 * Returns false to allow the caller to fall back to raw save.
	 */
	protected function saveResized( string $imageData, string $destPath, string $ext ): bool {
		if( $imageData === '' || !function_exists( 'imagecreatefromstring' ) ) {
			return false;
		}

		// Large source images can exhaust the default PHP memory limit during GD decode.
		$prevMemoryLimit = ini_get( 'memory_limit' );
		ini_set( 'memory_limit', '512M' );
		$source = @imagecreatefromstring( $imageData );
		ini_set( 'memory_limit', $prevMemoryLimit );
		if( !$source ) {
			return false;
		}

		$srcW = imagesx( $source );
		$srcH = imagesy( $source );
		if( $srcW <= 0 || $srcH <= 0 ) {
			imagedestroy( $source );
			return false;
		}

		if( max( $srcW, $srcH ) <= $this->maxSide ) {
			imagedestroy( $source );
			return file_put_contents( $destPath, $imageData ) !== false;
		}

		$scale  = ( float )$this->maxSide / ( float )max( $srcW, $srcH );
		$tgtW   = max( 1, ( int )round( $srcW * $scale ) );
		$tgtH   = max( 1, ( int )round( $srcH * $scale ) );
		$target = imagecreatetruecolor( $tgtW, $tgtH );
		if( !$target ) {
			imagedestroy( $source );
			return false;
		}

		if( $ext === 'png' ) {
			imagealphablending( $target, false );
			imagesavealpha( $target, true );
		}

		$ok = imagecopyresampled( $target, $source, 0, 0, 0, 0, $tgtW, $tgtH, $srcW, $srcH );
		imagedestroy( $source );
		if( !$ok ) {
			imagedestroy( $target );
			return false;
		}

		if( $ext === 'png' ) {
			$saved = imagepng( $target, $destPath, 6 );
		} elseif( $ext === 'webp' && function_exists( 'imagewebp' ) ) {
			$saved = imagewebp( $target, $destPath, $this->quality );
		} elseif( $ext === 'gif' ) {
			$saved = imagegif( $target, $destPath );
		} else {
			$saved = imagejpeg( $target, $destPath, $this->quality );
		}

		imagedestroy( $target );
		return $saved === true;
	}

	// ------------------------------------------------------------------ response

	/** Emit a JSON payload and terminate request execution. */
	private function respond( array $payload ): void {
		while( ob_get_level() ) ob_end_clean();
		echo json_encode( $payload );
		exit;
	}

	/** Shorthand for a cached-image response. */
	private function respondCached( string $localUrl, $imageId ): void {
		$this->respond( ['cached' => true, 'localUrl' => $localUrl, 'imageId' => $imageId] );
	}
}
