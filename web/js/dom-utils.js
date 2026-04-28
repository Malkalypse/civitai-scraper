/** Escape HTML special characters to prevent XSS vulnerabilities
 * @param {string} text input text to escape
 * @returns {string} escaped text safe for insertion
 */
export function escapeHtml( text ) {
	const div = document.createElement( 'div' );
	div.textContent = text;
	return div.innerHTML;
}


/** Copy text to clipboard with fallback for older browsers
 * @param {string} text text to copy to clipboard
 * @returns {Promise<boolean>} true if copy succeeded, otherwise false
 */
export async function copyTextWithFallback( text ) {
	const value = typeof text === 'string' ? text : String( text ?? '' );
	if( value.trim() === '' ) {
		return false;
	}

	if( navigator.clipboard && typeof navigator.clipboard.writeText === 'function' ) {
		try {
			await navigator.clipboard.writeText( value );
			return true;
		} catch( error ) {
			console.warn( 'Clipboard API write failed, trying fallback:', error );
		}
	}

	try {
		const textarea = document.createElement( 'textarea' );
		textarea.value = value;
		textarea.setAttribute( 'readonly', '' );
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		textarea.style.top = '0';
		document.body.appendChild( textarea );
		textarea.focus();
		textarea.select();
		textarea.setSelectionRange( 0, textarea.value.length );
		const copied = document.execCommand( 'copy' );
		document.body.removeChild( textarea );
		return copied === true;
	} catch( error ) {
		console.warn( 'Fallback copy failed:', error );
		return false;
	}
}