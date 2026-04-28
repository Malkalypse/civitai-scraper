/** Normalize sampler name and scheduler for Flux import based on the raw sampler name from parameters, with specific handling for Karras schedulers and Euler Ancestral sampler
 * @param {string} samplerRaw Raw sampler name from parameters text
 * @returns {object} Object containing normalized samplerName and scheduler for Flux import
 */
export function normalizeSamplerForFluxImport( samplerRaw ) {
	let samplerName = String( samplerRaw || '' ).toLowerCase().replace( '++', 'pp' ).replaceAll( ' ', '_' );
	let scheduler = 'normal';

	if( samplerName.includes( 'karras' ) ) {
		samplerName = samplerName.replace( 'karras', '' ).replace( /_+$/, '' );
		scheduler = 'karras';
	}

	if( samplerName === 'euler_a' ) {
		samplerName = 'euler_ancestral';
	}

	if( samplerName === '' ) {
		samplerName = 'euler_ancestral';
	}

	return { samplerName, scheduler };
}


/** Normalize sampler name and scheduler for A1111 import based on the raw sampler name from parameters, with specific handling for Karras schedulers and Euler Ancestral sampler
 * @param {string} samplerRaw Raw sampler name from parameters text
 * @returns {object} Object containing normalized samplerName and scheduler for A1111 import
 */
export function normalizeSamplerForA1111Import( samplerRaw ) {
	let samplerName = String( samplerRaw || '' ).toLowerCase().replace( '++', 'pp' ).replaceAll( ' ', '_' );
	let scheduler = 'normal';

	if( samplerName.includes( 'karras' ) ) {
		samplerName = samplerName.replace( 'karras', '' ).replace( /_+$/, '' );
		scheduler = 'karras';
	}

	if( samplerName === 'euler_a' || samplerName === '' ) {
		samplerName = 'euler';
	}

	return { samplerName, scheduler };
}


/** Normalize schedule type for A1111 import based on raw schedule type from parameters, mapping common aliases to standard schedule types
 * @param {string} scheduleTypeRaw Raw schedule type from parameters text
 * @returns {string} Normalized schedule type
 */
export function normalizeScheduleTypeForA1111Import( scheduleTypeRaw ) {
	const normalized = String( scheduleTypeRaw || '' ).trim().toLowerCase().replaceAll( ' ', '_' );
	if( normalized === '' ) {
		return '';
	}

	const scheduleAliases = {
		karras: 'karras',
		normal: 'normal',
		exponential: 'exponential',
		sgm_uniform: 'sgm_uniform',
		simple: 'simple',
		ddim_uniform: 'ddim_uniform',
		beta: 'beta',
		linear_quadratic: 'linear_quadratic'
	};

	return scheduleAliases[ normalized ] || normalized;
}


/** Extract Lora entries from the given text
 * @param {string} text Text containing Lora entries
 * @returns {object} Object containing cleaned text and extracted Lora entries
 */
export function extractLoraEntries( text ) {
	const loras = [];
	const cleaned = String( text || '' ).replace( /<lora:([^:]+:[^>]+)>/g, ( _m, capture ) => {
		const parts = String( capture || '' ).split( ':' );
		const weight = Number.parseFloat( parts[1] );
		if( parts[0] && Number.isFinite( weight ) ) {
			loras.push( { name: parts[0], weight } );
		}
		return '';
	} );

	return { cleanedText: cleaned.trim(), loras };
}


/** Parse A1111 options from the given parameters text
 * @param {string} parametersText Text containing A1111 parameters
 * @returns {object|null} Object containing parsed options or null if parsing fails
 */
export function parseA1111OptionsFromParameters( parametersText ) {
	const text = normalizeA1111ParametersText( parametersText );
	if( text === '' ) {
		return null;
	}

	const stepsLabelMatch = text.match( /steps\s*:/i );
	if( !stepsLabelMatch || typeof stepsLabelMatch.index !== 'number' ) {
		return null;
	}

	const stepsIndex = stepsLabelMatch.index;
	const optionsBlock = text.substring( stepsIndex ).trim();
	const optionLines = optionsBlock
		.split( '\n' )
		.map( line => line.trim() )
		.filter( line => line.includes( ':' ) );

	const opts = parseA1111OptionMap( optionLines );
	if( Object.keys( opts ).length === 0 ) {
		return null;
	}

	return { ...extractA1111PromptSections( text, stepsIndex ), opts };
}
/** Normalize line breaks and trim whitespace for consistent parsing of A1111 parameters text
 * @param {string} text Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeA1111ParametersText( text ) {
	const raw = String( text || '' ).trim();
	if( raw === '' ) {
		return '';
	}

	return raw
		.replaceAll( '\\r\\n', '\n' )
		.replaceAll( '\\n', '\n' )
		.replaceAll( '\\r', '\n' )
		.replaceAll( '\r\n', '\n' )
		.replaceAll( '\r', '\n' )
		.trim();
}
/** Parse A1111 option map from the given option lines
 * @param {string[]} optionLines Array of option lines
 * @returns {object} Object containing parsed options
 */
export function parseA1111OptionMap( optionLines ) {
	const opts = {};

	if( optionLines.length > 1 ) {
		optionLines.forEach( line => {
			const colonIndex = line.indexOf( ':' );
			if( colonIndex <= 0 ) {
				return;
			}

			const key = line.substring( 0, colonIndex ).trim().toLowerCase();
			const value = line.substring( colonIndex + 1 ).trim();
			if( key !== '' ) {
				opts[ key ] = value;
			}
		} );
		return opts;
	}

	const optionsLine = optionLines[0] || '';
	const matchResult = optionsLine.match(
		new RegExp( '\\s*([^:]+:\\s*([^"\\{].*?|".*?"|\\{.*?\\}))\\s*(,|$)', 'g' )
	);
	if( !Array.isArray( matchResult ) ) {
		return opts;
	}

	matchResult.forEach( item => {
		const parts = item.split( ':' );
		if( parts.length < 2 ) {
			return;
		}

		if( parts[1].endsWith( ',' ) ) {
			parts[1] = parts[1].substr( 0, parts[1].length - 1 );
		}

		opts[ parts[0].trim().toLowerCase() ] = parts.slice( 1 ).join( ':' ).trim();
	} );

	return opts;
}
/** Extract A1111 prompt sections from the given text
 * @param {string} text				Text containing A1111 prompts
 * @param {number} stepsIndex	Index of the steps section in the text
 * @returns {object} Object containing positivePrompt and negativePrompt
 */
export function extractA1111PromptSections( text, stepsIndex ) {
	let negativePromptIndex = -1;
	const beforeStepsText = text.substring( 0, stepsIndex );
	const negativeMatches = [ ...beforeStepsText.matchAll( /(^|\n)\s*negative\s*prompt\s*:/gi ) ];
	if( negativeMatches.length > 0 ) {
		const lastNegative = negativeMatches[ negativeMatches.length - 1 ];
		if( typeof lastNegative.index === 'number' ) {
			negativePromptIndex = lastNegative.index + ( lastNegative[1] ? lastNegative[1].length : 0 );
		}
	}

	const hasNegativePrompt = negativePromptIndex > -1;
	return {
		positivePrompt: hasNegativePrompt
			? text.substring( 0, negativePromptIndex ).trim()
			: text.substring( 0, stepsIndex ).trim(),
		negativePrompt: hasNegativePrompt
			? text.substring( negativePromptIndex, stepsIndex ).replace( /^\s*negative\s*prompt\s*:/i, '' ).trim()
			: ''
	};
}