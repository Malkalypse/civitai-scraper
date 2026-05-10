<?php

/** Shared cache management helpers for image cache endpoints. */
class ImageCacheManager {

	private string $cacheDir;
	private string $generationDir;

	public function __construct( string $cacheDir, string $generationDir ) {
		$this->cacheDir      = $cacheDir;
		$this->generationDir = $generationDir;
	}

	/** Ensure cache directories exist. */
	public function ensureDirectories(): void {
		if( !file_exists( $this->cacheDir ) ) {
			mkdir( $this->cacheDir, 0755, true );
		}
		if( !file_exists( $this->generationDir ) ) {
			mkdir( $this->generationDir, 0755, true );
		}
	}

	/** Extract image id from URL if it matches known patterns.
	 * @param mixed $url URL string to extract image ID from
	 * @return mixed Image ID as integer (null if not found)
	 */
	public static function extractImageIdFromUrl( $url ) {
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

	/** Resolve a single cached image by image ID.
	 * Checks for <imageId>.jpg on disk directly — no metadata lookup needed.
	 * @param mixed $imageId Image ID to look up
	 * @return mixed Associative array with keys 'path', 'filename', 'url' if found, or null if not found
	 */
	public function resolveCachedImage( $imageId ) {
		if( !is_numeric( $imageId ) || ( int )$imageId <= 0 ) {
			return null;
		}

		$imageId = ( int )$imageId;

		// Primary: <imageId>.jpg (canonical name after migration)
		foreach( ['jpg', 'png', 'webp', 'gif'] as $ext ) {
			$filename = $imageId . '.' . $ext;
			$candidatePath = $this->cacheDir . '/' . $filename;
			if( is_file( $candidatePath ) ) {
				return [
					'path'			=> $candidatePath,
					'filename'	=> $filename,
					'url'				=> 'cache/images/' . $filename
				];
			}
		}

		return null;
	}

	/** Build cache filenames, paths, and URLs for primary and legacy naming schemes.
	 * @param mixed $imageUrl Source image URL
	 * @param mixed $imageId Image ID value
	 * @return mixed Associative array of derived cache naming/path values
	 */
	public function buildCachePathsForImage( $imageUrl, $imageId ) {
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

		// Canonical filename: <imageId>.jpg — simple, direct, no metadata lookup needed.
		// Falls back to URL-derived name when no imageId is known.
		$hasId = $imageId && ( int )$imageId > 0;
		$canonicalFilename = $hasId ? ( ( int )$imageId . '.jpg' ) : ( $baseName . '.' . $extension );

		// Legacy: old <imageId>-<uuid>-<hash>.<ext> naming kept as fallback for pre-migration files.
		$legacyFilename = $hasId
			? ( ( int )$imageId . '-' . $baseName . '.' . $extension )
			: ( $baseName . '.' . $extension );

		return [
			'imageFilename'				=> $canonicalFilename,
			'cachedFilePath'			=> $this->cacheDir . '/' . $canonicalFilename,
			'cachedFileUrl'				=> 'cache/images/' . $canonicalFilename,
			'legacyImageFilename'	=> $legacyFilename,
			'legacyCachedFilePath'	=> $this->cacheDir . '/' . $legacyFilename,
			'legacyCachedFileUrl'	=> 'cache/images/' . $legacyFilename
		];
	}

	/** Upsert image generation metadata.
	 * @param mixed $imageId Image ID value
	 * @param mixed $payload Payload value (associative array with keys like 'modelId', 'modelVersionId', 'imageFilename')
	 */
	public function upsertImageGenerationMetadata( $imageId, $payload ): void {
		if( !is_numeric( $imageId ) || ( int )$imageId <= 0 || !is_array( $payload ) ) {
			return;
		}

		$imageId = ( int )$imageId;
		if( !is_dir( $this->generationDir ) ) {
			@mkdir( $this->generationDir, 0755, true );
		}

		$filePath = $this->generationDir . '/' . $imageId . '.json';
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

	/** Load generation metadata by model.
	 * @param mixed $targetModelId Optional model ID to filter results for
	 * @return mixed Array with two elements:
	 * - [0] => associative array of modelId => [filename => true]
	 * - [1] => array of metadata entries for target model (if specified)
	 */
	public function loadGenerationMetadataByModel( $targetModelId = null ) {
		/** @var array<string, array<string, bool>> $byModel */
		$byModel      = [];
		$modelScoped  = [];

		$files = glob( $this->generationDir . '/*.json' );
		foreach( $files as $file ) {
			if( !is_file( $file ) ) {
				continue;
			}

			$raw = @file_get_contents( $file );
			if( $raw === false ) {
				continue;
			}

			$row = json_decode( $raw, true );
			if( !is_array( $row ) ) {
				continue;
			}

			$storedImageId  = isset( $row['imageId'] ) ? ( int )$row['imageId'] : 0;
			$storedModelId  = isset( $row['modelId'] ) ? ( string )$row['modelId'] : '';

			if( $storedModelId !== '' ) {
				if( !isset( $byModel[$storedModelId] ) ) {
					$byModel[$storedModelId] = [];
				}
				$byModel[$storedModelId][$storedImageId] = true;
			}

			if( $targetModelId !== null && $targetModelId !== '' && $storedModelId === ( string )$targetModelId ) {
				$modelScoped[] = [
					'path'		=> $file,
					'imageId'	=> $storedImageId
				];
			}
		}

		return [$byModel, $modelScoped];
	}

	/** Get file size in bytes, returning 0 for invalid paths.
	 * @param mixed $path File path to check
	 * @return int File size in bytes (or 0 if invalid)
	 */
	public static function getFileSizeBytes( $path ): int {
		if( !is_string( $path ) || !is_file( $path ) ) {
			return 0;
		}

		$size = @filesize( $path );
		return is_numeric( $size ) ? ( int )$size : 0;
	}
}
