<?php

class CivitaiUrl {

	/** Extract the UUID segment from a CDN URL (image.civitai.com or image.civitai.red).
	 * CDN URL format: /{hash}/{uuid}/{params}
	 * @param string $url CDN URL to extract UUID from
	 * @return string|null UUID string, or null if URL does not match CDN format
	 */
	private static function extractUuidFromCdnUrl( string $url ): ?string {
		$pattern = '~^(?:' . preg_quote( SITE_CDN_BASE, '~' ) . '|' . preg_quote( SITE_CDN_LEGACY, '~' ) . ')/[^/]+/([^/?#]+)~i';
		if( preg_match( $pattern, $url, $matches ) ) {
			return $matches[1];
		}
		return null;
	}

	/** Normalize a Civitai image URL to the canonical B2 storage /original form.
	 * CDN URLs (image.civitai.com, image.civitai.red) are converted to B2 storage.
	 * @param mixed $url URL to normalize
	 * @return mixed Normalized URL or original value when not applicable
	 */
	public static function toOriginalUrl( $url ) {
		if( !is_string( $url ) ) {
			return $url;
		}

		if( stripos( $url, SITE_STORAGE_BASE ) !== false ) {
			$normalizedB2 = preg_replace( '~/original=true(?=[/?#]|$)~i', '/original', $url, 1, $replacedB2Count );
			if( $replacedB2Count > 0 && is_string( $normalizedB2 ) ) {
				return $normalizedB2;
			}

			return $url;
		}

		if( stripos( $url, SITE_CDN_BASE ) === false && stripos( $url, SITE_CDN_LEGACY ) === false ) {
			return $url;
		}

		// CDN URL: extract UUID and return canonical B2 storage URL
		$uuid = self::extractUuidFromCdnUrl( $url );
		if( $uuid !== null ) {
			return SITE_STORAGE_BASE . '/' . $uuid . '/original';
		}

		return $url;
	}


	/** Convert a Civitai image URL to a thumbnail URL.
	 * CDN URLs are converted to B2 storage /original (CDN resize is unavailable for offline images;
	 * cache_image.php resizes locally after download).
	 * @param mixed		$url												Original image URL
	 * @param string	$transform									Transform string (retained for B2-native and non-CDN URLs if applicable)
	 * @param bool		$preserveExistingOptimized	Whether to preserve existing optimized transforms unchanged
	 * @return mixed URL suitable for local caching or original value when not applicable
	 */
	public static function toThumbnailUrl( $url, $transform = 'anim=false,width=450,optimized=true', $preserveExistingOptimized = false ) {
		if( !is_string( $url ) ) {
			return $url;
		}

		if( stripos( $url, SITE_CDN_BASE ) === false && stripos( $url, SITE_CDN_LEGACY ) === false ) {
			return $url;
		}

		// CDN URL: extract UUID and return B2 storage URL (local cache pipeline resizes)
		$uuid = self::extractUuidFromCdnUrl( $url );
		if( $uuid !== null ) {
			return SITE_STORAGE_BASE . '/' . $uuid . '/original';
		}

		return $url;
	}
}
