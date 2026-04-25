import { toggleTag } from './sidebar.js';
import { loadModelVersion } from './model-loading.js';
import { resetFilename, handleFilenameKeydown, handleOriginalFilenameKeydown } from './file-editing.js';

import { AppState, modelInput, output } from './app-context.js';
import { escapeHtml } from './dom-utils.js';
import { scanMissingImageWorkflows } from './workflow.js';

import { setupWorkflowAnalysisVisibilityObserver, applyGenerationPreviewVisibility, loadVersionWorkflowFilters, toggleGenerationPreview } from './filters.js';
import { updateThumbnailSize, loadModelImages } from './image-gallery.js';

import { fetchOriginalFilename, checkModelInDatabase } from './db-sync.js';
import { buildModelTagsHtml, buildVersionLinksHtml, buildFetchDataHtml } from './renderers/model-actions-html.js';


/** Initialize event handlers for model actions */
function initializeModelActionsHandlers() {

  // Use a property on the function to track initialization state
	if( initializeModelActionsHandlers.initialized ) {
		return;
	}

	// Set up click handler to toggle tags
	const modelTagsContainer = document.getElementById( 'modelTagsContainer' );
	if( modelTagsContainer ) {
		modelTagsContainer.addEventListener( 'click', ( event ) => {
			const tagElement = event.target.closest( '.model-tag' );
			if( tagElement && modelTagsContainer.contains( tagElement ) ) {
				toggleTag( tagElement ); // sidebar.js
			}
		} );
	}

	// Set up click handler for model version links
	const versionsContainer = document.getElementById( 'versionsContainer' );
	if( versionsContainer ) {
		versionsContainer.addEventListener( 'click', ( event ) => {
			const versionLink = event.target.closest( '.version-link' );
			if( versionLink && versionsContainer.contains( versionLink ) ) {
				const versionString = versionLink.dataset.modelVersion || '';
				if( versionString ) {
					loadModelVersion( versionString ); // model-loading.js
				}
			}
		} );
	}

	if( output ) {

		// Set up click handlers
		output.addEventListener( 'click', ( event ) => {

			// Reset filename
			const resetFilenameBtn = event.target.closest( '[data-action="reset-filename"]' );
			if( resetFilenameBtn && output.contains( resetFilenameBtn ) ) {
				resetFilename(); // file-editing.js
				return;
			}

			// Clear cache for model or all models
			const clearCacheBtn = event.target.closest( '[data-action="clear-cache"]' );
			if( clearCacheBtn && output.contains( clearCacheBtn ) ) {
				const modelId = clearCacheBtn.dataset.modelId || null;
				clearCache( modelId );
				return;
			}

			const scanWorkflowsBtn = event.target.closest( '[data-action="scan-workflows"]' );
			if( scanWorkflowsBtn && output.contains( scanWorkflowsBtn ) ) {
				const rescanCheckbox = document.getElementById( 'scanWorkflowsRescan' );
				const rescanAll = rescanCheckbox ? rescanCheckbox.checked === true : false;
				scanMissingImageWorkflows( scanWorkflowsBtn, { rescanAll } );
				return;
			}

			// [Show/Hide Prompts|Non-Workflow|Non-Favorites] buttons
			const togglePreviewBtn = event.target.closest( '[data-toggle-type]' );
			if( togglePreviewBtn && output.contains( togglePreviewBtn ) ) {
				toggleGenerationPreview( togglePreviewBtn.dataset.toggleType ); // filters.js
			}
		} );

		// Set up change handler for thumbnail size select
		output.addEventListener( 'change', ( event ) => {
			const thumbnailSizeSelect = event.target.closest( '#thumbnailSize' );
			if( thumbnailSizeSelect && output.contains( thumbnailSizeSelect ) ) {
				updateThumbnailSize( thumbnailSizeSelect.value ); // image-gallery.js
			}
		} );

		// Set up keydown handlers 
		output.addEventListener( 'keydown', ( event ) => {

			// Set up keydown handler for filename editing		
			const editableFilename = event.target.closest( '.editable-filename' );
			if( editableFilename && output.contains( editableFilename ) ) {
				handleFilenameKeydown( event, editableFilename ); // file-editing.js
				return;
			}

			// Set up keydown handler for original filename editing
			const editableOriginalFilename = event.target.closest( '.editable-original-filename' );
			if( editableOriginalFilename && output.contains( editableOriginalFilename ) ) {
				handleOriginalFilenameKeydown( event, editableOriginalFilename ); // file-editing.js
			}
		} );
	}

	initializeModelActionsHandlers.initialized = true; // mark as initialized
}

/** Clear cache for specific model or all models
 * @param {*} modelId model ID to clear cache for (null to clear entire cache)
 */
export async function clearCache( modelId = null ) {
	const action			= modelId ? 'clearModel' : 'clearAll';
	const confirmMsg	= modelId ? 'Clear cache for this model?' : 'Clear entire image cache?';

	if( !confirm( confirmMsg ) ) return;

	try {
		const response = await fetch( 'api/images/cache_manager.php', {
			method:		'POST',
			headers:	{ 'Content-Type': 'application/json' },
			body:			JSON.stringify( { action: action, modelId: modelId } )
		} );
		const result = await response.json();

		if( result.success ) {
			const deletedImageCount			= Number( result.deletedImageCount || 0 );
			const deletedMetadataCount	= Number( result.deletedMetadataCount || 0 );
			const deletedImageSizeMB		= Number( result.deletedImageSizeMB || 0 );
			const deletedMetadataSizeMB	= Number( result.deletedMetadataSizeMB || 0 );

			alert(
				`Cleared ${result.deletedCount} files (${result.deletedSizeMB} MB)\n` +
				`Images: ${deletedImageCount} (${deletedImageSizeMB} MB)\n` +
				`Generation JSON: ${deletedMetadataCount} (${deletedMetadataSizeMB} MB)`
			);
			
			fetchData();
		}
	} catch( error ) {
		console.error( 'Cache clear failed:', error );
		alert( 'Failed to clear cache' );
	}
}

initializeModelActionsHandlers();


/** Fetch model data based on current modelInput value and update UI accordingly
 * @param {*} options Optional settings for the fetch operation
 * - If options.preserveFilename is true, it will not reset the current filename in AppState before fetching. * 
 */
export async function fetchData( options = {} ) {

	// Prepare state and UI for fetching model data
	const requestState = prepareFetchDataRequest( options );
	if( !requestState ) {
		return;
	}

	// Destructure modelInput and imageLoadToken from prepared request state
	const { modelInput, imageLoadToken } = requestState;

	try {
		// Fetch model data
		const result = await fetchModelInput( modelInput );

		// If result contains an error message, display it
		if( result.error ) {
			output.innerHTML = `<div class="error">${escapeHtml( result.error )}</div>`;

		// If result contains data, process and render it
		} else if( result.data ) {

			// Extract model context information and apply result
			const selectedVersion = result.selectedVersion || null;
			await applyResult( result, modelInput, selectedVersion );

			// Render model tags based on fetched result
			renderTags( result );

			// Render version links based on extracted model versions and selected version
			const { modelVersions, modelType, trpcDescription } = modelContext( result );
			renderVersionLinks( modelVersions, selectedVersion );

			// Resolve additional display data for selected version
			const { safetensorsFile, trainedWords } = await resolveDisplayData( selectedVersion );

			// Build and render main model information section
			output.innerHTML = buildFetchDataHtml( { // model-actions-html.js
				result,
				selectedVersion,
				modelType,
				trpcDescription,
				safetensorsFile,
				trainedWords
			} );

			// Initialize model view and load model images
			initializeModelView( selectedVersion );
			updateCacheDisplay( AppState.model.currentModelId );
			loadModelImages( AppState.model.currentModelId, selectedVersion, imageLoadToken ); // image-gallery.js

		// If result does not contain data, display generic error message
		} else {
			output.innerHTML = '<div class="error">No data found in response</div>';
		}

	// Catch and display any errors that occur during the fetch or processing
	} catch( error ) {
		output.innerHTML = `<div class="error">Error: ${escapeHtml( error.message )}</div>`;
	}

}

/** Prepare state and UI for fetching model data
 * 
 * `fetchData() > prepareFetchDataRequest()`
 * @param {*} options Optional settings for the fetch operation
 * @returns Object containing modelInput and imageLoadToken (or null)
 */
function prepareFetchDataRequest( options = {} ) {

	// Determine whether to preserve the current filename (default is false)
  const { preserveFilename = false } = options;
	if( !preserveFilename ) {
		AppState.model.currentFilename = null;
	}

	// Get and validate the model ID from the input field
	const userModelInput = modelInput.value.trim();
	if( !userModelInput ) {
		output.innerHTML = '<div class="error">Please enter a model ID</div>';
		return null;
	}

	// Increment the global image load token to track the current fetch operation
	const imageLoadToken = ++AppState.runtime.currentImageLoadToken;

	// Hide model tags, version links, and add to database section
	document.getElementById( 'modelTags' ).classList.remove( 'visible' );
	document.getElementById( 'versionLinks' ).classList.remove( 'visible' );
	document.getElementById( 'addToDbSection' ).style.display = 'none';

	// Hide the carousel container if it exists
	const existingCarousel = document.getElementById( 'carouselContainer' );
	if( existingCarousel ) {
		existingCarousel.dataset.loading = 'false';
	}

	// Hide the gallery container if it exists
	const existingGallery = document.getElementById( 'galleryContainer' );
	if( existingGallery ) {
		existingGallery.dataset.loading = 'false';
	}

	output.innerHTML = '<div class="loading">Fetching model data...</div>';

	return { modelInput: userModelInput, imageLoadToken };
}

/** Fetch model data from server
 * 
 * `fetchData() > fetchModelInput()`
 * @param {*} modelInput Input to fetch model data for
 * @returns Promise that resolves to fetched model data
 * 
 * Returned data should contain the following:
 * - data										(Object):		Main model data object
 * - dataInfo								(Object):		Additional info about data
 * - modelId								(string):		ID of model
 * - modelTags							(array):		Array of model tags
 * - selectedVersion				(Object):		Currently selected version object
 * - success								(boolean):	Indicates whether fetch was successful
 * - urlInfo								(Object):		Information about model URL
 * - versionSelectionMethod	(string):		Method used to select version
 */
async function fetchModelInput( modelInput ) {

	// Make POST request to fetch model data
	const cacheBuster	= new Date().getTime();
	const response		= await fetch( `api/models/fetch_data.php?_=${cacheBuster}`, {
		method: 'POST',
		headers: {
			'Content-Type':		'application/json',
			'Cache-Control':	'no-cache'
		},
		body: JSON.stringify( { modelInput: modelInput } )
	} );
	const result = await response.json();
	if ( result.debug ) {
		console.log( '[fetch_data debug]', result.debug );
	}
	console.log( 'fetchModelInput() result:', result );
	return result;
}

/** Apply fetched model data and check if model exists in database
 * - Updates properties in AppState.model based on fetched result and selected version
 * - After updating, calls checkModelInDatabase() to verify model existence in database
 * @param {*} result					The fetched model data
 * @param {*} modelInput			The full model input string
 * @param {*} selectedVersion	The selected version of the model
 */
async function applyResult( result, modelInput, selectedVersion ) {
	AppState.model.currentModelJsonData	= result.data;
	AppState.model.currentModelId				= result.modelId || modelInput.split( '?' )[0];

	if( selectedVersion && selectedVersion.id ) {
		AppState.model.currentVersionId			= selectedVersion.id;
		AppState.model.currentModelIdForDb	= AppState.model.currentModelId;
	}

	AppState.model.currentOriginalFilename		= null;
	AppState.model.currentModelExistsInDb			= false;

	await checkModelInDatabase( AppState.model.currentModelId, selectedVersion );
}

/** Extract model context information
 * 
 * `fetchData() > modelContext()`
 * @param {*} result The fetched model data result object
 * @returns An object containing modelVersions, modelType, and trpcDescription
 */
function modelContext( result ) {
	const modelVersions		= result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;
	const modelType				= result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.type;
	const trpcQueries			= result.data?.props?.pageProps?.trpcState?.json?.queries;
	const trpcDescription	= Array.isArray( trpcQueries )
		? ( trpcQueries.find( query => typeof query?.state?.data?.description === 'string' )?.state?.data?.description || '' )
		: '';

	return {
		modelVersions,
		modelType,
		trpcDescription
	};
}

/** Render model tags section
 * `fetchData() > renderTags()`
 * 
 * @param {*} result Fetched model data result object containing model tags information
 *
 * `result` is fetched in `fetchModelInput()`
 */
function renderTags( result ) {
	if( result.modelTags && Array.isArray( result.modelTags ) && result.modelTags.length > 0 ) {
		const modelTagsContainer			= document.getElementById( 'modelTagsContainer' );
		modelTagsContainer.innerHTML	= buildModelTagsHtml( result.modelTags );
		document.getElementById( 'modelTags' ).classList.add( 'visible' );
	}
}

/** Render version links section
 * 
 * `fetchData() > renderVersionLinks()`
 * @param {*} modelVersions		Fetched model versions array
 * @param {*} selectedVersion	Selected version object
 * 
 * `modelVersions` is fetched in `fetchModelInput()` and extracted in `modelContext()`
 * 
 * Each version should contain the following:
 * - id					(number):						version ID
 * - name				(string):						version name
 * - baseModel	(string, optional):	base model name for this version
 */
function renderVersionLinks( modelVersions, selectedVersion ) {
	if( modelVersions && Array.isArray( modelVersions ) && modelVersions.length > 0 ) {
		const versionsContainer			= document.getElementById( 'versionsContainer' );
		const selectedVersionId			= selectedVersion?.id || null;
		versionsContainer.innerHTML	= buildVersionLinksHtml( modelVersions, selectedVersionId );
		document.getElementById( 'versionLinks' ).classList.add( 'visible' );
	}
}

/** Resolve display data for selected version
 * @param {*} selectedVersion Selected version object
 * @returns {Promise<{ safetensorsFile: string, trainedWords: string }>} An object containing safetensorsFile and trainedWords
 */
async function resolveDisplayData( selectedVersion ) {
	let safetensorsFile = '';
	let trainedWords = '';

	if( selectedVersion ) {
		if( selectedVersion.baseModel ) {
			AppState.model.currentBaseModel = selectedVersion.baseModel;
		}

		if( AppState.model.currentModelExistsInDb ) {
			safetensorsFile = ( typeof AppState.model.currentOriginalFilename === 'string' && AppState.model.currentOriginalFilename.trim() !== '' )
				? AppState.model.currentOriginalFilename.trim()
				: '';
		} else {
			safetensorsFile = await fetchOriginalFilename( selectedVersion.id );
		}

		if( safetensorsFile && ( !AppState.model.currentModelExistsInDb || !AppState.model.currentFilename ) ) {
			if( safetensorsFile.endsWith( '.safetensors' ) ) {
				AppState.model.currentFilename = safetensorsFile.substring( 0, safetensorsFile.length - 12 );
			} else {
				AppState.model.currentFilename = safetensorsFile;
			}
		}

		if( selectedVersion.trainedWords && Array.isArray( selectedVersion.trainedWords ) ) {
			trainedWords = selectedVersion.trainedWords.map( w => `<code class="trigger-word">${escapeHtml( w )}</code>` ).join( '<br>' );
		}
	}

	return { safetensorsFile, trainedWords };
}

/** Initialize rendered model view (e.g. setup observers, load workflow filters, etc.)
 * @param {*} selectedVersion Selected version object
 */
function initializeModelView( selectedVersion ) {
	setupWorkflowAnalysisVisibilityObserver();
	applyGenerationPreviewVisibility();
	loadVersionWorkflowFilters( selectedVersion?.id || AppState.model.currentVersionId );

	const thumbnailSizeSelect = document.getElementById( 'thumbnailSize' );
	if( thumbnailSizeSelect ) {
		thumbnailSizeSelect.value = AppState.ui.thumbnailSize;
	}
}

/** Update cache info display and load model images
 * @param {string} modelId ID of model
 */
function updateCacheDisplay( modelId ) {
	getCacheSize( modelId ).then( cacheInfo => {
		if( cacheInfo ) {
			const cacheInfoDiv = document.getElementById( 'cacheInfo' );
			cacheInfoDiv.innerHTML = `
				<div>
					<strong>Model cache:</strong> ${cacheInfo.modelSizeMB} MB
					<button data-action="clear-cache" data-model-id="${escapeHtml( modelId )}" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear</button>
				</div>
				<div>
					<strong>Total cache:</strong> ${cacheInfo.totalSizeMB} MB (${cacheInfo.fileCount} files)
					<button data-action="clear-cache" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear All</button>
				</div>
			`;
		}
	} );
}


/** Get the cache size for a specific model or overall cache
 * @param {string|null} modelId the model ID to check cache size for, or null to get overall cache size
 * @return {Promise<{ modelSizeMB: number, totalSizeMB: number, fileCount: number }|null>} cache size information or null if failed
 * 
 * The response object contains:
 * - modelSizeMB: the size of the cache for the specified model in megabytes
 * - totalSizeMB: the total size of the entire cache in megabytes
 * - fileCount: the total number of files in the cache
 */
export async function getCacheSize( modelId ) {
	try {
		const response = await fetch( 'api/images/cache_manager.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { action: 'getSize', modelId: modelId } )
		} );
		return await response.json();
	} catch( error ) {
		console.error( 'Cache size check failed:', error );
		return null;
	}
}