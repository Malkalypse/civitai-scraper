import { AppState } from './app-context.js';
import { loadLoras, loadCheckpoints } from './sidebar.js';

export function handleFilenameKeydown( event, element ) {
	if( event.key === 'Enter' ) {
		event.preventDefault();
		element.blur();
	}
}

export function handleOriginalFilenameKeydown( event, element ) {
	if( event.key === 'Enter' ) {
		event.preventDefault();
		element.blur();
	}
}

export async function saveFilename( element, options = {} ) {
	const allowMissingFile = options.allowMissingFile === true;
	let newFilename = element.textContent.trim();
	let originalFilename = element.getAttribute( 'data-original' );
	const originalDownloadFilename = element.getAttribute( 'data-original-file' ) || '';

	if( newFilename.endsWith( '.safetensors' ) ) {
		newFilename = newFilename.substring( 0, newFilename.length - 12 );
	}
	if( originalFilename.endsWith( '.safetensors' ) ) {
		originalFilename = originalFilename.substring( 0, originalFilename.length - 12 );
	}

	if( newFilename === originalFilename ) {
		return;
	}

	if( !newFilename ) {
		alert( 'Invalid filename. Cannot be empty.' );
		element.textContent = originalFilename;
		return;
	}

	try {
		const renameData = {
			oldFilename: originalFilename,
			newFilename: newFilename,
			originalDownloadFilename,
			modelId: AppState.model.currentModelIdForDb || null,
			versionId: AppState.model.currentVersionId || null,
			baseModel: AppState.model.currentBaseModel || null,
			allowMissingFile
		};

		console.log( 'Renaming file with data:', renameData );

		const response = await fetch( 'api/rename_model.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( renameData )
		} );

		const result = await response.json();
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
			element.textContent = originalFilename;
		}
	} catch( error ) {
		console.error( 'Error renaming file:', error );
		alert( 'Error renaming file: ' + error.message );
		element.textContent = originalFilename;
	}
}

export async function saveOriginalFilename( element ) {
	const originalValue = element.getAttribute( 'data-original' ) || '';
	const newValue = element.textContent.trim();

	if( newValue === originalValue ) {
		return;
	}

	if( !AppState.model.currentVersionId ) {
		alert( 'Cannot update original filename: version is missing.' );
		element.textContent = originalValue;
		return;
	}

	try {
		const response = await fetch( 'api/update_original_filename.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				modelId: AppState.model.currentModelIdForDb,
				versionId: AppState.model.currentVersionId,
				originalFilename: newValue
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		const savedValue = result.originalFilename || '';
		AppState.model.currentOriginalFilename = savedValue;
		element.textContent = savedValue;
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

export async function resetFilename() {
	const filenameElement = document.querySelector( '.editable-filename' );
	if( !filenameElement ) {
		alert( 'Filename element not found' );
		return;
	}

	const originalFile = filenameElement.getAttribute( 'data-original-file' );
	if( !originalFile ) {
		alert( 'Original filename not available' );
		return;
	}

	let originalFilename = originalFile;
	if( originalFilename.endsWith( '.safetensors' ) ) {
		originalFilename = originalFilename.substring( 0, originalFilename.length - 12 );
	}

	const currentName = filenameElement.textContent.trim();

	if( currentName === originalFilename ) {
		alert( 'Filename is already set to the original' );
		return;
	}

	if( !confirm( `Reset filename from "${currentName}" to "${originalFilename}"?` ) ) {
		return;
	}

	filenameElement.textContent = originalFilename;
	await saveFilename( filenameElement, { allowMissingFile: true } );
}
