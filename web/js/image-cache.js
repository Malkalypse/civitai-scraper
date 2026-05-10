import { AppState, COPY_ALL_MAX_CONCURRENCY } from './app-context.js';
import { applyWorkflowIdentityToCard, applyImageCardFilters } from './filters.js';
import { imageIdFromUrl, extractFilenameFromUrl } from './url-utils.js';

export { imageIdFromUrl, extractFilenameFromUrl } from './url-utils.js';

/** Check if an image URL is already cached locally, returning the local URL if so
 * @param {string} remoteUrl URL of the image to check in cache
 * @param {string|null} cacheLookupUrl optional URL to use for cache lookup instead of remoteUrl
 * @returns {Promise<{url: string, cached: boolean}>} Object containing the URL to use (local if cached, original if not) and whether it was cached
 */
export async function checkCached( remoteUrl, cacheLookupUrl = null ) {
	try {
		const response = await fetch( 'api/images/cache_image.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { imageUrl: remoteUrl, lookupUrl: cacheLookupUrl || remoteUrl, download: false, modelId: AppState.model.currentModelId, versionId: AppState.model.currentVersionId } )
		} );
		const result = await response.json();

		if( result.cached && result.localUrl ) {
			return { url: result.localUrl, cached: true };
		}
		return { url: remoteUrl, cached: false };
	} catch( error ) {
		console.error( 'Cache check failed:', error );
		return { url: remoteUrl, cached: false };
	}
}


/** Download an image from a remote URL and cache it locally, returning the local URL if successful
 * @param {string} remoteUrl URL of the image to download and cache
 * @param {string|null} cacheLookupUrl optional URL to use for cache lookup instead of remoteUrl
 * @returns {Promise<string>} Local URL of the cached image if successful, otherwise the original remote URL
 */
export async function downloadAndCache( remoteUrl, cacheLookupUrl = null ) {
	try {
		const response = await fetch( 'api/images/cache_image.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { imageUrl: remoteUrl, lookupUrl: cacheLookupUrl || remoteUrl, download: true, modelId: AppState.model.currentModelId, versionId: AppState.model.currentVersionId } )
		} );
		const result = await response.json();

		if( result.localUrl ) {
			return { url: result.localUrl, wasDownloaded: result.downloaded === true };
		}
		return { url: remoteUrl, wasDownloaded: false };
	} catch( error ) {
		console.error( 'Download failed:', error );
		return { url: remoteUrl, wasDownloaded: false };
	}
}


/** Set the width of all generation preview textareas in an image card to match the rendered width of the image, and autosize them
 * @param {HTMLElement} card the image card element containing the image and generation preview textareas
 */
export function syncCopyAllPreviewWidth( card ) {
	if( !card ) {
		return;
	}

	const workflowActions = card.querySelector( '.workflow-actions' );
	const copyBtn = card.querySelector( '.workflow-copy-btn' );
	const analyzeBtn = card.querySelector( '.workflow-analyze-btn' );
	const image = card.querySelector( 'img' );

	if( !image ) {
		return;
	}

	const applyWidth = () => {
		const renderedWidth = image.clientWidth;
		if( renderedWidth > 0 ) {
			if( workflowActions ) {
				const stackedButtons = String( AppState.ui.thumbnailSize ) === '150';
				workflowActions.style.width = renderedWidth + 'px';
				workflowActions.style.flexWrap = 'nowrap';
				workflowActions.style.justifyContent = stackedButtons ? 'flex-start' : 'space-between';
				workflowActions.style.flexDirection = stackedButtons ? 'column' : 'row';
				workflowActions.style.alignItems = stackedButtons ? 'stretch' : 'center';

				if( copyBtn ) {
					copyBtn.style.width = stackedButtons ? '100%' : '';
				}

				if( analyzeBtn ) {
					analyzeBtn.style.width = stackedButtons ? '100%' : '';
				}
			}
		}
	};

	if( image.complete ) {
		applyWidth();
	} else {
		image.addEventListener( 'load', applyWidth, { once: true } );
	}
}


/** Queue hydration of favorite/workflow state for a given image card, ensuring that only a limited number of concurrent requests are active
 * @param {HTMLInputElement|null} favoriteCheckbox optional checkbox element associated with the image card, used to update favorite state and workflow/parameters presence indicators
 * @param {string} imagePageUrl URL of the image page to extract the image ID from for fetching generation data
 * @param {string} imageLoadToken a token representing the current image load session, used to ensure that outdated requests do not update the UI
 * @param {Object} metadata optional additional metadata to include when fetching generation data, such as model ID, version ID, or image filename
 */
export function queueCopyAllPreviewHydration( favoriteCheckbox, imagePageUrl, imageLoadToken, metadata = {} ) {
	const imageId = imageIdFromUrl( imagePageUrl );
	if( !imageId ) {
		if( favoriteCheckbox ) {
			favoriteCheckbox.checked = false;
		}
		return;
	}

	AppState.runtime.copyAllTextQueue.push( { favoriteCheckbox, imageId, imageLoadToken, metadata } );
	processCopyAllPreviewQueue();
}
/** Process the queue of pending generation preview hydration jobs, ensuring that only a limited number of concurrent requests are active and that the correct preview is updated when the data is returned */
export function processCopyAllPreviewQueue() {
	while( AppState.runtime.copyAllActiveCount < COPY_ALL_MAX_CONCURRENCY && AppState.runtime.copyAllTextQueue.length > 0 ) {
		const job = AppState.runtime.copyAllTextQueue.shift();
		if( !job ) {
			continue;
		}

		AppState.runtime.copyAllActiveCount++;

		( async () => {
			try {
				if( job.imageLoadToken !== AppState.runtime.currentImageLoadToken ) {
					return;
				}

				const payload = await fetchCopyAllTextForImageId( job.imageId, job.metadata || {} );

				if( job.imageLoadToken !== AppState.runtime.currentImageLoadToken ) {
					return;
				}

				// Re-read cache to pick up any values written by a concurrent scan that completed
				// while the HTTP response for this hydration job was in-flight or queued.
				const fresh = AppState.runtime.copyAllTextCache.get( job.imageId ) || payload;

				const favorite = fresh?.favorite === true;
				const workflowPresent = fresh?.workflowPresent === true;
				const workflowNull = fresh?.workflowNull === true;
				const workflowHash = typeof fresh?.workflowHash === 'string' ? fresh.workflowHash : '';
				const parametersPresent = fresh?.parametersPresent === true;

			if( job.favoriteCheckbox ) {
				job.favoriteCheckbox.checked = favorite;
				job.favoriteCheckbox.dataset.workflowPresent = workflowPresent ? '1' : '0';
				job.favoriteCheckbox.dataset.workflowNull = workflowNull ? '1' : '0';
				job.favoriteCheckbox.dataset.parametersPresent = parametersPresent ? '1' : '0';

				// Only update the card's workflow hash if the incoming value is non-empty,
				// or the card has not been loaded by a concurrent scan (workflowLoaded = 0).
				const card = job.favoriteCheckbox.closest( '.image-card' );
				const cardWorkflowLoaded = card ? card.dataset.workflowLoaded === '1' : false;
				if( workflowHash !== '' || !cardWorkflowLoaded ) {
					applyWorkflowIdentityToCard( job.favoriteCheckbox, workflowHash );
				}

				updateImageCardState( job.favoriteCheckbox, {
					favoriteLoaded: true,
					favorite,
					workflowLoaded: true,
					workflowPresent,
					workflowNull,
					parametersPresent
				} );
				setFavoriteImageBorder( job.favoriteCheckbox, favorite );
			}
			} finally {
				AppState.runtime.copyAllActiveCount--;
				processCopyAllPreviewQueue();
			}
		} )();
	}
}
/** Fetch generation metadata for a given image ID, using caching to avoid redundant requests
 * @param {number} imageId ID of the image to fetch generation data for
 * @param {Object} options optional parameters such as modelId and modelVersionId to include in the request for more accurate caching
 * @returns {Promise<{copyAllText: string, favorite: boolean, workflowPresent: boolean, workflowNull: boolean, workflowHash: string, parametersPresent: boolean}>} Object containing generation metadata
 */
export async function fetchCopyAllTextForImageId( imageId, options = {} ) {
	const { modelId = null, modelVersionId = null } = options;

	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return { copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowHash: '', parametersPresent: false };
	}

	if( AppState.runtime.copyAllTextCache.has( imageId ) ) {
		return AppState.runtime.copyAllTextCache.get( imageId ) || { copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowHash: '', parametersPresent: false };
	}

	if( AppState.runtime.copyAllTextPending.has( imageId ) ) {
		return AppState.runtime.copyAllTextPending.get( imageId );
	}

	const requestPromise = ( async () => {
		try {
			const requestBody = { imageId };
			if( modelId !== null && modelId !== undefined && String( modelId ).trim() !== '' ) {
				requestBody.modelId = String( modelId );
			}
			if( modelVersionId !== null && modelVersionId !== undefined && String( modelVersionId ).trim() !== '' ) {
				requestBody.modelVersionId = String( modelVersionId );
			}

			const response = await fetch( 'api/images/get_image_generation_data.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( requestBody )
			} );

			const result = await response.json();
			if( !response.ok || !result.success ) {
				throw new Error( result.error || `HTTP ${response.status}` );
			}

			const fetchedPayload = {
				copyAllText: typeof result.copyAllText === 'string' ? result.copyAllText : '',
				favorite: result.favorite === true,
				workflowPresent: result.workflowPresent === true,
				workflowNull: result.workflowNull === true,
				workflowHash: typeof result.workflowHash === 'string' ? result.workflowHash : '',
				parametersPresent: result.parametersPresent === true
			};
			// Only cache if a concurrent scan hasn't already written a fresher value
			if( !AppState.runtime.copyAllTextCache.has( imageId ) ) {
				AppState.runtime.copyAllTextCache.set( imageId, fetchedPayload );
			}
			return AppState.runtime.copyAllTextCache.get( imageId ) || fetchedPayload;
		} catch( error ) {
			console.warn( `Could not fetch generation data for image ${imageId}:`, error );
			const emptyPayload = { copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowHash: '', parametersPresent: false };
			return emptyPayload;
		} finally {
			AppState.runtime.copyAllTextPending.delete( imageId );
		}
	} )();

	AppState.runtime.copyAllTextPending.set( imageId, requestPromise );
	return requestPromise;
}


/** Toggle the favorite state of an image when the associated checkbox is changed, sending an API request to update the state on the server and updating the UI accordingly
 * @param {HTMLInputElement} checkbox the checkbox element that was toggled, which should have data attributes for image ID and filename
 */
export async function toggleImageFavorite( checkbox ) {
	if( !checkbox ) {
		return;
	}

	const imageId = Number( checkbox.dataset.imageId || 0 );
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return;
	}

	const favorite = checkbox.checked === true;
	const previous = !favorite;
	setFavoriteImageBorder( checkbox, favorite );
	updateImageCardState( checkbox, { favoriteLoaded: true, favorite } );

	try {
		const response = await fetch( 'api/images/update_image_favorite.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				imageId,
				favorite,
				modelId: AppState.model.currentModelId,
				modelVersionId: AppState.model.currentVersionId
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		if( AppState.runtime.copyAllTextCache.has( imageId ) ) {
			const cached = AppState.runtime.copyAllTextCache.get( imageId ) || {};
			AppState.runtime.copyAllTextCache.set( imageId, {
				...cached,
				favorite: result.favorite === true
			} );
		}

		updateImageCardState( checkbox, { favoriteLoaded: true, favorite: result.favorite === true } );
		setFavoriteImageBorder( checkbox, result.favorite === true );
	} catch( error ) {
		console.warn( `Could not update favorite state for image ${imageId}:`, error );
		checkbox.checked = previous;
		updateImageCardState( checkbox, { favoriteLoaded: true, favorite: previous } );
		setFavoriteImageBorder( checkbox, previous );
	}
}


/** Set the border color of an image in an image card based on its favorite state and workflow/parameters presence indicators
 * @param {HTMLInputElement} checkbox the checkbox element associated with the image card, which should have data attributes for workflow and parameters presence
 * @param {boolean} isFavorite whether the image is marked as favorite or not, used to determine border color
 */
export function setFavoriteImageBorder( checkbox, isFavorite ) {
	if( !checkbox ) {
		return;
	}

	const workflowPresent = checkbox.dataset.workflowPresent === '1';
	const workflowNull = checkbox.dataset.workflowNull === '1';
	const parametersPresent = checkbox.dataset.parametersPresent === '1';
	applyImageCardBorder( checkbox, isFavorite, workflowPresent, workflowNull, parametersPresent );
}

/** Apply a border color to an image in an image card based on workflow and parameters presence indicators, with different colors for different states
 * @param {HTMLElement} referenceElement an element within the image card to use as a reference for finding the image element, such as the favorite checkbox
 * @param {boolean} isFavorite whether the image is marked as favorite or not, used to determine border color
 * @param {boolean} workflowPresent whether a workflow is present for the image, used to determine border color
 * @param {boolean} workflowNull whether the workflow is null for the image, used to determine border color
 * @param {boolean} parametersPresent whether parameters are present for the image, used to determine border color
 */
export function applyImageCardBorder( referenceElement, isFavorite = false, workflowPresent = false, workflowNull = false, parametersPresent = false ) {
	if( !referenceElement ) {
		return;
	}

	const card = referenceElement.closest( '.image-card' );
	const image = card ? card.querySelector( 'img' ) : null;
	if( !image ) {
		return;
	}

	if( parametersPresent ) {
		image.style.borderColor = 'rgb(12, 133, 153)';
		return;
	}

	if( workflowPresent ) {
		image.style.borderColor = '#419f3f';
		return;
	}

	if( workflowNull ) {
		image.style.borderColor = '#bf4547';
		return;
	}

	image.style.borderColor = '#444';
}


/** Update the state of an image card based on workflow and parameters presence indicators, and update the visibility of workflow action buttons accordingly
 * @param {HTMLElement} referenceElement an element within the image card to use as a reference for finding the card and updating its state, such as the favorite checkbox
 * @param {Object} options optional parameters for updating the card state, such as favoriteLoaded, favorite, workflowLoaded, workflowPresent, workflowNull, and parametersPresent
 */
export function updateImageCardState( referenceElement, { favoriteLoaded = null, favorite = null, workflowLoaded = null, workflowPresent = null, workflowNull = null, parametersPresent = null } = {} ) {
	if( !referenceElement ) {
		return;
	}

	const card = referenceElement.closest( '.image-card' );
	if( !card ) {
		return;
	}

	if( favoriteLoaded !== null ) {
		card.dataset.favoriteLoaded = favoriteLoaded ? '1' : '0';
	}

	if( favorite !== null ) {
		card.dataset.favorite = favorite ? '1' : '0';
	}

	if( workflowLoaded !== null ) {
		card.dataset.workflowLoaded = workflowLoaded ? '1' : '0';
	}

	if( workflowPresent !== null ) {
		card.dataset.workflowPresent = workflowPresent ? '1' : '0';
	}

	if( workflowNull !== null ) {
		card.dataset.workflowNull = workflowNull ? '1' : '0';
	}

	if( parametersPresent !== null ) {
		card.dataset.parametersPresent = parametersPresent ? '1' : '0';
	}

	updateWorkflowActionsVisibility( referenceElement );
	applyImageCardFilters();
}
/** Update the visibility of workflow action buttons based on workflow and parameters presence indicators
 * @param {*} referenceElement an element within the image card to use as a reference for finding the card and updating its state, such as the favorite checkbox
 */
export function updateWorkflowActionsVisibility( referenceElement ) {
	if( !referenceElement ) {
		return;
	}

	const card = referenceElement.closest( '.image-card' );
	if( !card ) {
		return;
	}

	const actions = card.querySelector( '.workflow-actions' );
	const noWorkflowLabel = card.querySelector( '.workflow-no-workflow' );
	if( !actions || !noWorkflowLabel ) {
		return;
	}

	const workflowLoaded = card.dataset.workflowLoaded === '1';
	const workflowNull = card.dataset.workflowNull === '1';
	const parametersPresent = card.dataset.parametersPresent === '1';
	const showNoWorkflow = workflowLoaded && workflowNull && !parametersPresent;

	const copyBtn = card.querySelector( '.workflow-copy-btn' );
	if( copyBtn ) {
		copyBtn.textContent = parametersPresent ? 'Copy Parameters' : 'Copy Workflow';
	}

	const analyzeBtn = card.querySelector( '.workflow-analyze-btn' );
	if( analyzeBtn ) {
		analyzeBtn.textContent = parametersPresent ? 'Analyze Parameters' : 'Analyze Workflow';
	}

	actions.style.display = showNoWorkflow ? 'none' : 'flex';
	noWorkflowLabel.style.display = showNoWorkflow ? '' : 'none';
}