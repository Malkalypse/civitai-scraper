import { AppState, modelIdInput, output } from './app-context.js';
import { escapeHtml } from './dom-utils.js';
import { addSettingsSet } from './settings-ui.js';
import { setupWorkflowAnalysisVisibilityObserver, applyGenerationPreviewVisibility, loadVersionWorkflowFilters, toggleGenerationPreview } from './filters.js';
import { updateThumbnailSize, loadModelImages } from './image-gallery.js';
import { toggleTag } from './sidebar.js';
import { fetchOriginalFilename, checkModelInDatabase } from './db-sync.js';
import { handleFilenameKeydown, handleOriginalFilenameKeydown, saveFilename, saveOriginalFilename, resetFilename } from './file-editing.js';
import { buildModelTagsHtml, buildVersionLinksHtml, buildFetchDataHtml } from './renderers/model-actions-html.js';
import { loadModelVersion } from './model-loading.js';


// Initialize event handlers for model actions
function initializeModelActionsHandlers() {

  // Use a property on the function to track initialization state
	if( initializeModelActionsHandlers.initialized ) {
		return;
	}

	const modelTagsContainer = document.getElementById( 'modelTagsContainer' );
	if( modelTagsContainer ) {
		modelTagsContainer.addEventListener( 'click', ( event ) => {
			const tagElement = event.target.closest( '.model-tag' );
			if( tagElement && modelTagsContainer.contains( tagElement ) ) {
				toggleTag( tagElement );
			}
		} );
	}

	const versionLinksContainer = document.getElementById( 'versionLinksContainer' );
	if( versionLinksContainer ) {
		versionLinksContainer.addEventListener( 'click', ( event ) => {
			const versionLink = event.target.closest( '.version-link' );
			if( versionLink && versionLinksContainer.contains( versionLink ) ) {
				const modelVersionString = versionLink.dataset.modelVersion || '';
				if( modelVersionString ) {
					loadModelVersion( modelVersionString );
				}
			}
		} );
	}

	if( output ) {
		output.addEventListener( 'click', ( event ) => {
			const resetFilenameBtn = event.target.closest( '[data-action="reset-filename"]' );
			if( resetFilenameBtn && output.contains( resetFilenameBtn ) ) {
				resetFilename();
				return;
			}

			const addSettingsSetBtn = event.target.closest( '[data-action="add-settings-set"]' );
			if( addSettingsSetBtn && output.contains( addSettingsSetBtn ) ) {
				addSettingsSet();
				return;
			}

			const clearCacheBtn = event.target.closest( '[data-action="clear-cache"]' );
			if( clearCacheBtn && output.contains( clearCacheBtn ) ) {
				const modelId = clearCacheBtn.dataset.modelId || null;
				clearCache( modelId );
				return;
			}

			const togglePreviewBtn = event.target.closest( '[data-toggle-type]' );
			if( togglePreviewBtn && output.contains( togglePreviewBtn ) ) {
				toggleGenerationPreview( togglePreviewBtn.dataset.toggleType );
			}
		} );

		output.addEventListener( 'change', ( event ) => {
			const thumbnailSizeSelect = event.target.closest( '#thumbnailSize' );
			if( thumbnailSizeSelect && output.contains( thumbnailSizeSelect ) ) {
				updateThumbnailSize( thumbnailSizeSelect.value );
			}
		} );

		output.addEventListener( 'keydown', ( event ) => {
			const editableFilename = event.target.closest( '.editable-filename' );
			if( editableFilename && output.contains( editableFilename ) ) {
				handleFilenameKeydown( event, editableFilename );
				return;
			}

			const editableOriginalFilename = event.target.closest( '.editable-original-filename' );
			if( editableOriginalFilename && output.contains( editableOriginalFilename ) ) {
				handleOriginalFilenameKeydown( event, editableOriginalFilename );
			}
		} );

		output.addEventListener( 'focusout', ( event ) => {
			const editableFilename = event.target.closest( '.editable-filename' );
			if( editableFilename && output.contains( editableFilename ) ) {
				saveFilename( editableFilename );
				return;
			}

			const editableOriginalFilename = event.target.closest( '.editable-original-filename' );
			if( editableOriginalFilename && output.contains( editableOriginalFilename ) ) {
				saveOriginalFilename( editableOriginalFilename );
			}
		} );
	}

	initializeModelActionsHandlers.initialized = true; // mark as initialized
}

/**
 * Clear the cache for a specific model or all models
 * @param {*} modelId 
 * @returns 
 */
export async function clearCache( modelId = null ) {
	const action = modelId ? 'clearModel' : 'clearAll';
	const confirmMsg = modelId ?
		'Clear cache for this model?' :
		'Clear entire image cache?';

	if( !confirm( confirmMsg ) ) return;

	try {
		const response = await fetch( 'api/cache_manager.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { action: action, modelId: modelId } )
		} );
		const result = await response.json();

		if( result.success ) {
			const deletedImageCount = Number( result.deletedImageCount || 0 );
			const deletedMetadataCount = Number( result.deletedMetadataCount || 0 );
			const deletedImageSizeMB = Number( result.deletedImageSizeMB || 0 );
			const deletedMetadataSizeMB = Number( result.deletedMetadataSizeMB || 0 );
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


/** Fetch model data based on current modelIdInput value and update UI accordingly
 * @param {*} options Optional settings for the fetch operation
 * - If options.preserveFilename is true, it will not reset the current filename in AppState before fetching. * 
 */
export async function fetchData( options = {} ) {

  // Reset current filename before fetching new data (unless preserveFilename is true)
  const { preserveFilename = false } = options;
	if( !preserveFilename ) {
		AppState.model.currentFilename = null; 
	}

  // Get model ID from input field
	const modelId = modelIdInput.value.trim(); // 

  // Show error if model ID is empty
	if( !modelId ) {
		output.innerHTML = '<div class="error">Please enter a model ID</div>'; 
		return;
	}

  // Increment image load token
	const imageLoadToken = ++AppState.runtime.currentImageLoadToken; 

  // Reset UI elements and show loading state
	document.getElementById( 'modelTags' ).classList.remove( 'visible' );
	document.getElementById( 'versionLinks' ).classList.remove( 'visible' );
	document.getElementById( 'addToDbSection' ).style.display = 'none';

  // Reset model-related AppState properties
	const existingCarousel = document.getElementById( 'carouselContainer' );
	if( existingCarousel ) existingCarousel.dataset.loading = 'false';
	const existingGallery = document.getElementById( 'galleryContainer' );
	if( existingGallery ) existingGallery.dataset.loading = 'false';

  // Show loading message while fetching data
	output.innerHTML = '<div class="loading">Fetching model data...</div>';

  // Fetch model data from server using provided model ID
	try {

    // Make POST request to fetch model data (including cache buster)
		const cacheBuster = new Date().getTime();
		const response = await fetch( `api/fetch_data.php?_=${cacheBuster}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache'
			},
			body: JSON.stringify( { modelId } )
		} );
		const result = await response.json();

    // Handle response errors
		if( result.error ) {
			output.innerHTML = `<div class="error">${escapeHtml( result.error )}</div>`;

    // If data is returned successfully, update AppState and UI accordingly
    } else if( result.data ) {

      // Extract selected version and model data from response
			const selectedVersion               = result.selectedVersion || null;
			AppState.model.currentModelJsonData = result.data;
			AppState.model.currentModelId       = result.modelId || modelId.split( '?' )[0];

      // Update AppState with selected version information if available
			if( selectedVersion && selectedVersion.id ) {
				AppState.model.currentVersionId     = selectedVersion.id;
				AppState.model.currentModelIdForDb  = AppState.model.currentModelId;
			}

      // Reset other model-related AppState properties
			AppState.model.currentOriginalFilename    = null;
			AppState.model.currentModelExistsInDb     = false;
			AppState.settings.currentSettingsSets     = [];
			AppState.settings.currentSamplerOptions   = [];
			AppState.settings.currentSchedulerOptions = [];
			AppState.settings.currentSettingsShowAll  = {};

      // Check if the currently selected model/version exists in the database and update AppState accordingly
			await checkModelInDatabase( AppState.model.currentModelId, selectedVersion );

      // Update UI with fetched data using renderer functions
			if( result.modelTags && Array.isArray( result.modelTags ) && result.modelTags.length > 0 ) {
				const modelTagsContainer      = document.getElementById( 'modelTagsContainer' );
				modelTagsContainer.innerHTML  = buildModelTagsHtml( result.modelTags );
				document.getElementById( 'modelTags' ).classList.add( 'visible' );
			}

      // Build and display version links, model tags, and other fetched data in the UI
			const modelVersions   = result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;
			const modelType       = result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.type;
			const trpcQueries     = result.data?.props?.pageProps?.trpcState?.json?.queries;
			const trpcDescription = Array.isArray( trpcQueries )
				? ( trpcQueries.find( query => typeof query?.state?.data?.description === 'string' )?.state?.data?.description || '' )
				: '';

      // Load model images based on the currently selected version and the new image load token
			if( modelVersions && Array.isArray( modelVersions ) && modelVersions.length > 0 ) {
				const versionLinksContainer     = document.getElementById( 'versionLinksContainer' );
				const selectedVersionId         = selectedVersion?.id || null;
				versionLinksContainer.innerHTML = buildVersionLinksHtml( modelVersions, selectedVersionId );
				document.getElementById( 'versionLinks' ).classList.add( 'visible' );
			}

      // Prepare variables for original filename and trained words to be displayed in the UI
			let safetensorsFile = '';
			let trainedWords    = '';

      // Determine original filename for currently selected model version (from database or by fetching it)
			if( selectedVersion ) {

        // Store the selected version base model
				if( selectedVersion.baseModel ) {
					AppState.model.currentBaseModel = selectedVersion.baseModel;
				}

        // If the model/version exists in the database, use the original filename from the database
				if( AppState.model.currentModelExistsInDb ) {
					safetensorsFile = ( typeof AppState.model.currentOriginalFilename === 'string' && AppState.model.currentOriginalFilename.trim() !== '' )
						? AppState.model.currentOriginalFilename.trim()
						: '';

        // Otherwise, fetch the original filename from the API
				} else {
					safetensorsFile = await fetchOriginalFilename( selectedVersion.id );
				}

        // Set the current filename in AppState if not already stored (e.g. from database check) and a safetensors file is available
				if( safetensorsFile && ( !AppState.model.currentModelExistsInDb || !AppState.model.currentFilename ) ) {
					if( safetensorsFile.endsWith( '.safetensors' ) ) {
						AppState.model.currentFilename = safetensorsFile.substring( 0, safetensorsFile.length - 12 );
					} else {
						AppState.model.currentFilename = safetensorsFile;
					}
				}

        // If the selected version has trained words, format them for display in the UI
				if( selectedVersion.trainedWords && Array.isArray( selectedVersion.trainedWords ) ) {
					trainedWords = selectedVersion.trainedWords.map( w => `<code class="trigger-word">${escapeHtml( w )}</code>` ).join( '<br>' );
				}
			}

      // Build the main content HTML with fetched data and render to output container
			output.innerHTML = buildFetchDataHtml( {
				result,
				selectedVersion,
				modelType,
				trpcDescription,
				safetensorsFile,
				trainedWords
			} );

      // Set up event handlers for the newly rendered content
			setupWorkflowAnalysisVisibilityObserver();
			applyGenerationPreviewVisibility();
			loadVersionWorkflowFilters( selectedVersion?.id || AppState.model.currentVersionId );

      // Get the cache size for the current model and update the UI
			getCacheSize( AppState.model.currentModelId ).then( cacheInfo => {
				if( cacheInfo ) {
					const cacheInfoDiv = document.getElementById( 'cacheInfo' );
					cacheInfoDiv.innerHTML = `
						<div>
							<strong>Model cache:</strong> ${cacheInfo.modelSizeMB} MB
							<button data-action="clear-cache" data-model-id="${escapeHtml( AppState.model.currentModelId )}" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear</button>
						</div>
						<div>
							<strong>Total cache:</strong> ${cacheInfo.totalSizeMB} MB (${cacheInfo.fileCount} files)
							<button data-action="clear-cache" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear All</button>
						</div>
					`;
				}
			} );

			// Set thumbnail size select element to current AppState value
			const thumbnailSizeSelect = document.getElementById( 'thumbnailSize' );
			if( thumbnailSizeSelect ) {
				thumbnailSizeSelect.value = AppState.ui.thumbnailSize;
			}

      // Load model images for the currently selected version
			loadModelImages( AppState.model.currentModelId, selectedVersion, imageLoadToken );

    // If no data found, show error message
		} else {
			output.innerHTML = '<div class="error">No data found in response</div>';
		}

  // Handle fetch errors
	} catch( error ) {
		output.innerHTML = `<div class="error">Error: ${escapeHtml( error.message )}</div>`;
	}

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
		const response = await fetch( 'api/cache_manager.php', {
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