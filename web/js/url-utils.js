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
