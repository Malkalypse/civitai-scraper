/** Strip known extensions from a filename for display purposes, using original filename for reference.
 * @param {string} name Filename to strip extension from
 * @param {string} originalFilename Original filename to reference for known extension
 * @returns {string} Filename without known extension
 */
export function stripKnownExtension( name, originalFilename = '' ) {
	if( typeof name !== 'string' ) {
		return '';
	}

	let normalized = name.trim();
	if( normalized === '' ) {
		return '';
	}

	const originalExt = getFilenameExtension( originalFilename );
	if( originalExt && normalized.toLowerCase().endsWith( originalExt ) ) {
		return normalized.slice( 0, -originalExt.length );
	}

	// Backward-compatibility fallback for older rows where original filename may be missing.
	if( normalized.toLowerCase().endsWith( '.safetensors' ) ) {
		return normalized.slice( 0, -12 );
	}

	return normalized;
}
/** Get the file extension from a filename, including the dot, or empty string if none.
 * @param {string} name Filename to extract extension from
 * @returns {string} File extension including dot, or empty string if none
 */
export function getFilenameExtension( name ) {
	if( typeof name !== 'string' ) {
		return '';
	}

	const trimmed = name.trim();
	const lastDot = trimmed.lastIndexOf( '.' );
	if( lastDot <= 0 || lastDot === trimmed.length - 1 ) {
		return '';
	}

	return trimmed.substring( lastDot ).toLowerCase();
}