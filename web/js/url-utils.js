/** Extract the image ID from a given URL
 * @param {string} url The URL to extract the image ID from
 * @returns {number|null} The extracted image ID, or null if not found
 */
export function imageIdFromUrl( url ) {
	if( !url || typeof url !== 'string' ) {
		return null;
	}

	const match = url.match( /\/images\/(\d+)/i );
	if( !match || !match[1] ) {
		return null;
	}

	const imageId = Number( match[1] );
	return Number.isInteger( imageId ) && imageId > 0 ? imageId : null;
}

/** Extract the filename from a given URL, removing query parameters and fragments
 * @param {string} url The URL to extract the filename from
 * @returns {string} The extracted filename, or an empty string if not found
 */
export function extractFilenameFromUrl( url ) {
	if( !url || typeof url !== 'string' ) {
		return '';
	}

	const cleanUrl = url.split( '?' )[0].split( '#' )[0];
	const parts = cleanUrl.split( '/' );
	if( parts.length === 0 ) {
		return '';
	}

	const filename = parts[parts.length - 1] || '';
	return filename.trim();
}

const CIVITAI_B2_BASE = 'https://image-b2.civitai.com/file/civitai-media-cache';

/** Convert a Civitai image URL or bare UUID to the canonical B2 storage URL.
 * Handles CDN URLs (image.civitai.com, image.civitai.red) and bare UUIDs.
 * @param {string} url Civitai image URL or bare UUID
 * @returns {string} B2 storage URL with /original path, or original value if not applicable
 */
export function toCivitaiOriginalUrl( url ) {
	if ( !url || typeof url !== 'string' ) return url;

	// Bare UUID — no http prefix (returned by Civitai tRPC/gallery APIs)
	if ( !url.startsWith( 'http' ) ) {
		return `${ CIVITAI_B2_BASE }/${ url }/original`;
	}

	// CDN URL (image.civitai.com or image.civitai.red): extract UUID (second path segment)
	const match = url.match( /^https?:\/\/image\.civitai\.(?:com|red)\/[^/]+\/([^/?#]+)/i );
	if ( match ) {
		return `${ CIVITAI_B2_BASE }/${ match[1] }/original`;
	}

	return url;
}
