/*
  Sidebar management: loading folder/file libraries, building lists, handling clicks
*/


// Imports
import { AppState } from './app-context.js'; // current model/version info
import { escapeHtml } from './dom-utils.js'; // safely escape folder and file names when building HTML


// Global variables
let modelClickHandler = null;


/** Set the click handler for files in the sidebar
 * @param {function} handler
 */
export function setmodelClickHandler( handler ) {
	modelClickHandler = typeof handler === 'function' ? handler : null;
}


// Specific functions to load checkpoints and loras into the sidebar
export async function loadCheckpoints( preserveState = false ) {
	await loadSidebarLibrary( {
		url: 'api/get_models.php?type=checkpoint',
		containerId: 'checkpointsList',
		preserveState,
		errorLabel: 'checkpoints'
	} );
}
export async function loadLoras( preserveState = false ) {
	await loadSidebarLibrary( {
		url: 'api/get_models.php?type=lora',
		containerId: 'lorasList',
		preserveState,
		errorLabel: 'loras'
	} );
}

/** Load file libraries into the sidebar, preserving open folders
 * @param {object} options
 * @param {string} options.url API endpoint to fetch the folder/file data from
 * @param {string} options.containerId ID of the container element to render the list into
 * @param {boolean} [options.preserveState=false] whether to preserve open/closed state of folders when reloading
 * @param {string} [options.errorLabel='items'] label to use in error messages (e.g. "checkpoints" or "loras")
 */
export async function loadSidebarLibrary( {
  url,
  containerId,
  preserveState = false,
  errorLabel = 'items'
} ) {
	const container = document.getElementById( containerId );

	if( !container ) return;

	try {
		const openFolders = preserveState ? getOpenFolders( containerId ) : new Set();
		const response = await fetch( url );
		const result = await response.json();

		if( result.error ) {
			container.innerHTML = `<div class="error" style="font-size: 12px;">${escapeHtml( result.error )}</div>`;
			return;
		}

		if( result.data ) {
			const html = buildFoldersHTML( result.data, openFolders );
			container.innerHTML = html;
			attachSidebarEventHandlers( container );
		}
	} catch( error ) {
		container.innerHTML = `<div class="error" style="font-size: 12px;">Error loading ${errorLabel}</div>`;
	}
}

/** Track the open folders for a given container
 * @param {*} containerId ID of the container element to check for open folders
 * @returns Set of names of open folders
 */
export function getOpenFolders( containerId ) {
	const openFolders = new Set();
	const container = document.getElementById( containerId );

	if( !container ) {
		return openFolders;
	}

	container.querySelectorAll( '.folder-item' ).forEach( ( folderItem ) => {
		const fileList = folderItem.querySelector( '.file-list' );

		if( fileList && fileList.style.display === 'block' ) {
			const folderName = folderItem.querySelector( '.folder-name' );

			if( folderName ) {
				openFolders.add( folderName.textContent.trim().substring( 2 ) );
			}
		}
	} );

	return openFolders;
}

/** Build the HTML for the sidebar folders and files
 * @param {*} foldersData array of { folder: string, files: array of { name: string, modelId?: string, versionId?: string, exists?: boolean } }
 * @param {*} openFolders Set of folder names that should be rendered as open
 * @returns HTML string for the sidebar list
 */
export function buildFoldersHTML( foldersData, openFolders = new Set() ) {
	let html = '';

	foldersData.forEach( folder => {
		const isOpen = openFolders.has( folder.folder );
		const displayStyle = isOpen ? 'block' : 'none';
		const triangleRotation = isOpen ? ' style="transform: rotate(90deg);"' : '';

		html += `
			<div class="folder-item">
				<div class="folder-name"><span class="folder-triangle"${triangleRotation}>▶</span> ${escapeHtml( folder.folder )}</div>
				<ul class="file-list" style="display: ${displayStyle};">`;

		folder.files.forEach( file => {
			const modelAttr = file.modelId ? ` data-model="${escapeHtml( file.modelId )}"` : '';
			const versionAttr = file.versionId ? ` data-version="${escapeHtml( file.versionId )}"` : '';
			const folderAttr = ` data-folder="${escapeHtml( folder.folder )}"`;
			const missingClass = file.exists === false ? ' missing-file' : '';
			html += `<li class="file-item${missingClass}"${modelAttr}${versionAttr}${folderAttr}>${escapeHtml( file.name )}</li>`;
		} );

		html += `</ul></div>`;
	} );

	return html;
}

/** Attach click handlers for folder toggling and file selection
 * @param {*} container the container element that holds the folder/file list
 */
export function attachSidebarEventHandlers( container ) {
  
  // Prevent attaching multiple event listeners if they are already attached
	if( !container || container.dataset.eventsBound === '1' ) {
		return;
	}

	container.addEventListener( 'click', ( event ) => {
		const folderName = event.target.closest( '.folder-name' );
		if( folderName && container.contains( folderName ) ) {
			toggleFolder( folderName );
			return;
		}

		const fileItem = event.target.closest( '.file-item' );
		if( fileItem && container.contains( fileItem ) ) {
			if( modelClickHandler ) {
				modelClickHandler( fileItem );
			}
		}
	} );

	container.dataset.eventsBound = '1';
}

/** Toggle visibility of a folder's file list in the sidebar
 * @param {HTMLElement} element clicked folder name element that contains the triangle and text
 */
export function toggleFolder( element ) {
	const fileList = element.nextElementSibling;
	const triangle = element.querySelector( '.folder-triangle' );

	if( fileList.style.display === 'none' ) {
		fileList.style.display = 'block';
		triangle.style.transform = 'rotate(90deg)';
	} else {
		fileList.style.display = 'none';
		triangle.style.transform = 'rotate(0deg)';
	}
}

/** Toggle the active state of a tag in the sidebar
 * @param {HTMLElement} element the clicked tag element
 */
export function toggleTag( element ) {
	const tag = element.getAttribute( 'data-tag' );

	if( AppState.settings.activeTags.has( tag ) ) {
		AppState.settings.activeTags.delete( tag );
		element.classList.remove( 'active' );
	} else {
		AppState.settings.activeTags.add( tag );
		element.classList.add( 'active' );
	}

	console.log( 'Active tags:', Array.from( AppState.settings.activeTags ) );
	updateSidebarHighlighting();
}

/** Update sidebar file highlighting based on currently active tags */
export async function updateSidebarHighlighting() {
	if( AppState.settings.activeTags.size === 0 ) {
		document.querySelectorAll( '#lorasList .file-item' ).forEach( item => {
			item.classList.remove( 'hidden' );
		} );
		return;
	}

	try {
		const response = await fetch( 'api/get_model_tags.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { tags: Array.from( AppState.settings.activeTags ) } )
		} );

		const result = await response.json();

		if( result.success && result.matchingModels ) {
			const fileItems = document.querySelectorAll( '#lorasList .file-item' );

			fileItems.forEach( item => {
				const modelId = item.getAttribute( 'data-model' );
				const versionId = item.getAttribute( 'data-version' );

				const matches = result.matchingModels.some( m =>
					m.model_id == modelId && m.version_id == versionId
				);

				if( matches ) {
					item.classList.remove( 'hidden' );
				} else {
					item.classList.add( 'hidden' );
				}
			} );

			console.log( `Showing ${result.matchingModels.length} matching loras (${fileItems.length - result.matchingModels.length} hidden)` );
		}
	} catch( error ) {
		console.error( 'Error updating sidebar highlighting:', error );
	}
}
