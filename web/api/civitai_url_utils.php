<?php

/** Normalize a Civitai image URL to the canonical original/original=true form.
 * @param mixed $url URL to normalize
 * @return mixed Normalized URL or original value when not applicable
 */
function api_civitai_to_original_url( $url ) {
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

	$normalized = preg_replace(
		'~/(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)(?=/|$)~i',
		'/original=true',
		$url,
		1,
		$replacedCount
	);

	if( $replacedCount > 0 && is_string( $normalized ) ) {
		return $normalized;
	}

	if( stripos( $url, SITE_CDN_LEGACY ) !== false ) {
		$path = substr( $url, strlen( SITE_CDN_LEGACY ) );
		if( preg_match( '~^/[^/]+/([^/]+)(?:/(.*))?$~i', $path, $matches ) ) {
			$token = $matches[1];
			$tail = isset( $matches[2] ) ? trim( $matches[2], '/' ) : '';

			if( $tail !== '' ) {
				$tail = preg_replace( '~^(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)/?~i', '', $tail );
				$tail = ltrim( (string)$tail, '/' );
			}

			$newUrl = SITE_CDN_BASE . '/' . SITE_CDN_HASH . '/' . $token . '/original=true';
			if( $tail !== '' ) {
				$newUrl .= '/' . $tail;
			}

			return $newUrl;
		}
	}

	return $url;
}


/** Convert a Civitai image URL to a thumbnail URL with the specified transform.
 * @param mixed $url Original image URL
 * @param string $transform Transform string to apply
 * @param bool $preserveExistingOptimized Whether to preserve existing optimized transforms unchanged
 * @return mixed URL with specified transform applied or original value when not applicable
 */
function api_civitai_to_thumbnail_url( $url, $transform = 'anim=false,width=450,optimized=true', $preserveExistingOptimized = false ) {
	if( !is_string( $url ) || ( stripos( $url, SITE_CDN_BASE ) === false && stripos( $url, SITE_CDN_LEGACY ) === false ) ) {
		return $url;
	}

	if( $preserveExistingOptimized && preg_match( '~/anim=false,(?:width|height)=\d+,optimized=true(?=/|$)~i', $url ) ) {
		return $url;
	}

	$normalized = preg_replace(
		'~/(?:original=true|anim=false,(?:width|height)=\d+,optimized=true)(?=/|$)~i',
		'/' . $transform,
		$url,
		1,
		$replacedCount
	);

	if( $replacedCount > 0 && is_string( $normalized ) ) {
		return $normalized;
	}

	if( stripos( $url, SITE_CDN_LEGACY ) !== false ) {
		$path = substr( $url, strlen( SITE_CDN_LEGACY ) );
		if( preg_match( '~^/[^/]+/([^/]+)(?:/(.*))?$~i', $path, $matches ) ) {
			$token = $matches[1];
			$tail = isset( $matches[2] ) ? trim( $matches[2], '/' ) : '';
			$newUrl = SITE_CDN_BASE . '/' . SITE_CDN_HASH . '/' . $token . '/' . $transform;
			if( $tail !== '' && stripos( $tail, 'original=true' ) !== 0 ) {
				$newUrl .= '/' . $tail;
			}

			return $newUrl;
		}
	}

	return $url;
}