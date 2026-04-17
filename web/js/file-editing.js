import { AppState } from './app-context.js';
import { loadLoras, loadCheckpoints } from './sidebar.js';

function getFilenameExtension( name ) {
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

function stripKnownExtension( name, originalFilename = '' ) {
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

/** Handle keydown events for editable filename element 
 * @param {KeyboardEvent}	event
 * @param {HTMLElement}		element Contenteditable element for filename
 */
export async function handleFilenameKeydown( event, element ) {
	if( event.key === 'Enter' ) {
		event.preventDefault();
		await saveFilename( element );
		element.blur();
	}
}

/** Save new filename with API request
 * @param {HTMLElement} element Contenteditable element for the filename
 * @param {Object}			options Additional options for saving
 */
export async function saveFilename( element, options = {} ) {
	const	allowMissingFile	= options.allowMissingFile === true;
	const originalFilename	= element.getAttribute( 'data-original-filename' ) || '';
	let		newFilename				= stripKnownExtension( element.textContent, originalFilename );
	let		currentFilename		= stripKnownExtension( element.getAttribute( 'data-original' ) || '', originalFilename );

	// If filename hasn't changed, do nothing
	if( newFilename === currentFilename ) {
		return;
	}

	// Validate new filename
	if( !newFilename ) {
		alert( 'Invalid filename. Cannot be empty.' );
		element.textContent = currentFilename;
		return;
	}

	try {
		// Send API request to rename file

		// Build data object for renaming
		const renameData = {
			oldFilename:	currentFilename,
			newFilename:	newFilename,
			originalFilename,
			modelId:			AppState.model.currentModelIdForDb || null,
			versionId:		AppState.model.currentVersionId || null,
			baseModel:		AppState.model.currentBaseModel || null,
			allowMissingFile
		};

		console.log( 'Renaming file with data:', renameData );

		// Send API request to rename file
		const response = await fetch( 'api/models/rename_model.php', {
			method:		'POST',
			headers:	{ 'Content-Type': 'application/json' },
			body:			JSON.stringify( renameData )
		} );

		const responseText = await response.text();
		let result;
		
		try {
			result = JSON.parse( responseText );
		} catch( parseError ) {
			throw new Error( `Invalid JSON response: ${responseText.substring( 0, 300 )}` );
		}

		if ( result.debug ) {
			console.log( '[rename_model debug]', result.debug );
		}		

		console.log( 'Rename result:', result );

		if( result.success ) {
			AppState.model.currentFilename = newFilename;
			element.setAttribute( 'data-original', newFilename );

			if( result.warning ) {
				alert( result.warning );
			}

			await Promise.all( [
				loadLoras( true ),
				loadCheckpoints( true )
			] );

			console.log( 'Filename updated successfully' );

		} else {
			alert( 'Error renaming file: ' + ( result.error || 'Unknown error' ) );
			element.textContent = currentFilename;
		}
	} catch( error ) {
		console.error( 'Error renaming file:', error );
		alert( 'Error renaming file: ' + error.message );
		element.textContent = currentFilename;
	}
}

/** Handle keydown events for original filename element
 * @param {KeyboardEvent}	event
 * @param {HTMLElement}		element Contenteditable element for original filename
 */
export async function handleOriginalFilenameKeydown( event, element ) {
	if( event.key === 'Enter' ) {
		event.preventDefault();
		await saveOriginalFilename( element );
		element.blur();
	}
}

/** Save new original filename with API request
 * @param {HTMLElement} element Contenteditable element for the original filename
 */
export async function saveOriginalFilename( element ) {
	const originalValue	= element.getAttribute( 'data-original' ) || '';
	const newValue			= element.textContent.trim();

	if( newValue === originalValue ) {
		return;
	}

	if( !AppState.model.currentVersionId ) {
		alert( 'Cannot update original filename: version is missing.' );
		element.textContent = originalValue;
		return;
	}

	try {
		// Send API request to update original filename
		const response = await fetch( 'api/update_original_filename.php', {
			method:		'POST',
			headers:	{ 'Content-Type': 'application/json' },
			body:			JSON.stringify( {
				modelId:					AppState.model.currentModelIdForDb,
				versionId:				AppState.model.currentVersionId,
				originalFilename:	newValue
			} )
		} );

		const result = await response.json();

		// If update was not successful, throw error to be caught below
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		const savedValue												= result.originalFilename || '';
		AppState.model.currentOriginalFilename	= savedValue;
		element.textContent											= savedValue;
		element.setAttribute( 'data-original', savedValue );

		console.log( 'Original filename updated:', {
			modelId: AppState.model.currentModelIdForDb,
			versionId: AppState.model.currentVersionId,
			originalFilename: savedValue
		} );
	} catch( error ) {
		console.error( 'Error updating original filename:', error );
		alert( 'Error updating original filename: ' + error.message );
		element.textContent = originalValue;
	}
}

/** Reset filename to original */
export async function resetFilename() {

	// Get filename element and original filename from AppState
	const filenameElement = document.querySelector( '.editable-filename' );
	if( !filenameElement ) {
		alert( 'Filename element not found' );
		return;
	}
	const originalFilename = filenameElement.getAttribute( 'data-original-filename' );
	if( !originalFilename ) {
		alert( 'Original filename not available' );
		return;
	}

	//
	let resetFilenameValue = stripKnownExtension( originalFilename, originalFilename );

	const currentName = stripKnownExtension( filenameElement.textContent, originalFilename );

	if( currentName === resetFilenameValue ) {
		alert( 'Filename is already set to the original' );
		return;
	}

	if( !confirm( `Reset filename from "${currentName}" to "${resetFilenameValue}"?` ) ) {
		return;
	}

	filenameElement.textContent = resetFilenameValue;
	await saveFilename( filenameElement, { allowMissingFile: true } );
}
