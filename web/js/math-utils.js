/** Parse float value from raw string (fallback to default on failure)
 * @param {string} value					raw string to parse as float
 * @param {number} fallbackValue	default value to return if parsing fails
 * @returns {number} parsed float value or fallback if parsing fails
 */
export function parseFloatFromText( value, fallbackValue ) {
	const parsed = Number.parseFloat( String( value || '' ).trim() );
	return Number.isFinite( parsed ) ? parsed : fallbackValue;
}

/** Parse size value from raw string in format "WIDTHxHEIGHT" (fallback to default on failure)
 * @param {string} rawSize raw size string (e.g. "512x512")
 * @returns {{width: number, height: number}} parsed width and height values
 */
export function parseSizeValue( rawSize ) {
	const match = String( rawSize || '' ).match( /(\d+)\s*[xX]\s*(\d+)/ );
	if( !match ) {
		return { width: 512, height: 512 };
	}

	return {
		width: parseIntegerFromText( match[1], 512 ),
		height: parseIntegerFromText( match[2], 512 )
	};
}

/** Parse integer value from raw string (fallback to default on failure)
 * @param {*} value raw string to parse as integer
 * @param {*} fallbackValue default value to return if parsing fails
 * @returns {number} parsed integer value or fallback if parsing fails
 */
export function parseIntegerFromText( value, fallbackValue ) {
	const parsed = Number.parseInt( String( value || '' ).trim(), 10 );
	return Number.isFinite( parsed ) ? parsed : fallbackValue;
}

/** Ceil value to nearest multiple, ensuring result and multiple are at least 1
 * @param {number} value		value to be ceiled to the nearest multiple (if less than 1 or NaN, treat as 1)
 * @param {number} multiple	multiple to which value should be ceiled (if less than 1 or NaN, treat as 1)
 * @returns {number} smallest multiple of `multiple` greater than or equal to `value`
 */
export function ceilToMultiple( value, multiple ) {
	const normalizedValue			= Math.max( 1, Number( value ) || 1 );
	const normalizedMultiple	= Math.max( 1, Number( multiple ) || 1 );
	return Math.ceil( normalizedValue / normalizedMultiple ) * normalizedMultiple;
}
