import { AppState, COPY_ALL_MAX_CONCURRENCY } from './app-context.js';
import { applyWorkflowIdentityToCard, applyImageCardFilters } from './filters.js';

export async function checkCached( remoteUrl, cacheLookupUrl = null ) {
	try {
		const response = await fetch( 'api/cache_image.php', {
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

export async function downloadAndCache( remoteUrl, cacheLookupUrl = null ) {
	try {
		const response = await fetch( 'api/cache_image.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { imageUrl: remoteUrl, lookupUrl: cacheLookupUrl || remoteUrl, download: true, modelId: AppState.model.currentModelId, versionId: AppState.model.currentVersionId } )
		} );
		const result = await response.json();

		if( result.localUrl ) {
			return result.localUrl;
		}
		return remoteUrl;
	} catch( error ) {
		console.error( 'Download failed:', error );
		return remoteUrl;
	}
}

export function extractImageIdFromUrl( url ) {
	if( !url || typeof url !== 'string' ) {
		return null;
	}

	const match = url.match( /\/images\/(\d+)/i );
	if( !match || !match[1] ) {
		return null;
	}

	const imageId = Number( match[1] );
	return Number.isInteger( imageId ) && imageId > 0 ? imageId : null;
}

export function extractFilenameFromUrl( url ) {
	if( !url || typeof url !== 'string' ) {
		return '';
	}

	const cleanUrl = url.split( '?' )[0].split( '#' )[0];
	const parts = cleanUrl.split( '/' );
	if( parts.length === 0 ) {
		return '';
	}

	const filename = parts[parts.length - 1] || '';
	return filename.trim();
}

export async function fetchCopyAllTextForImageId( imageId, options = {} ) {
	const { modelId = null, modelVersionId = null, imageFilename = '' } = options;

	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return { promptText: '', paramsText: '', copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowId: '', workflowRevision: '' };
	}

	if( AppState.runtime.copyAllTextCache.has( imageId ) ) {
		return AppState.runtime.copyAllTextCache.get( imageId ) || { promptText: '', paramsText: '', copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowId: '', workflowRevision: '' };
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
			if( imageFilename && String( imageFilename ).trim() !== '' ) {
				requestBody.imageFilename = String( imageFilename ).trim();
			}

			const response = await fetch( 'api/get_image_generation_data.php', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify( requestBody )
			} );

			const result = await response.json();
			if( !response.ok || !result.success ) {
				throw new Error( result.error || `HTTP ${response.status}` );
			}

			const payload = {
				promptText: typeof result.promptText === 'string' ? result.promptText : '',
				paramsText: typeof result.paramsText === 'string' ? result.paramsText : '',
				copyAllText: typeof result.copyAllText === 'string' ? result.copyAllText : '',
				favorite: result.favorite === true,
				workflowPresent: result.workflowPresent === true,
				workflowNull: result.workflowNull === true,
				workflowId: typeof result.workflowId === 'string' ? result.workflowId : '',
				workflowRevision: typeof result.workflowRevision === 'string' ? result.workflowRevision : ''
			};
			AppState.runtime.copyAllTextCache.set( imageId, payload );
			return payload;
		} catch( error ) {
			console.warn( `Could not fetch generation data for image ${imageId}:`, error );
			const emptyPayload = { promptText: '', paramsText: '', copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowId: '', workflowRevision: '' };
			return emptyPayload;
		} finally {
			AppState.runtime.copyAllTextPending.delete( imageId );
		}
	} )();

	AppState.runtime.copyAllTextPending.set( imageId, requestPromise );
	return requestPromise;
}

export function queueCopyAllPreviewHydration( paramsTextarea, promptTextarea, favoriteCheckbox, imagePageUrl, imageLoadToken, metadata = {} ) {
	if( !paramsTextarea || !promptTextarea ) {
		return;
	}

	const imageId = extractImageIdFromUrl( imagePageUrl );
	if( !imageId ) {
		paramsTextarea.value = 'Parameters unavailable';
		promptTextarea.value = 'Prompt unavailable';
		if( favoriteCheckbox ) {
			favoriteCheckbox.checked = false;
		}
		return;
	}

	paramsTextarea.value = 'Loading parameters...';
	promptTextarea.value = 'Loading prompt...';
	autosizeCopyAllPreview( paramsTextarea );
	autosizeCopyAllPreview( promptTextarea );
	AppState.runtime.copyAllTextQueue.push( { paramsTextarea, promptTextarea, favoriteCheckbox, imageId, imageLoadToken, metadata } );
	processCopyAllPreviewQueue();
}

export function autosizeCopyAllPreview( textarea ) {
	if( !textarea ) {
		return;
	}

	textarea.style.height = 'auto';
	textarea.style.height = textarea.scrollHeight + 'px';
}

export function syncCopyAllPreviewWidth( card ) {
	if( !card ) {
		return;
	}

	const previews = card.querySelectorAll( '.generation-preview' );
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
			previews.forEach( preview => {
				preview.style.width = renderedWidth + 'px';
				autosizeCopyAllPreview( preview );
			} );

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

export function processCopyAllPreviewQueue() {
	while( AppState.runtime.copyAllActiveCount < COPY_ALL_MAX_CONCURRENCY && AppState.runtime.copyAllTextQueue.length > 0 ) {
		const job = AppState.runtime.copyAllTextQueue.shift();
		if( !job || !job.paramsTextarea || !job.promptTextarea ) {
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

				if( !document.body.contains( job.paramsTextarea ) || !document.body.contains( job.promptTextarea ) ) {
					return;
				}

				const paramsText = typeof payload?.paramsText === 'string' ? payload.paramsText.trim() : '';
				const promptText = typeof payload?.promptText === 'string' ? payload.promptText.trim() : '';
				const favorite = payload?.favorite === true;
				const workflowPresent = payload?.workflowPresent === true;
				const workflowNull = payload?.workflowNull === true;
				const workflowId = typeof payload?.workflowId === 'string' ? payload.workflowId : '';
				const workflowRevision = typeof payload?.workflowRevision === 'string' ? payload.workflowRevision : '';

				job.paramsTextarea.value = paramsText !== '' ? paramsText : 'Parameters unavailable';
				job.promptTextarea.value = promptText !== '' ? promptText : 'Prompt unavailable';
				if( job.favoriteCheckbox ) {
					job.favoriteCheckbox.checked = favorite;
					job.favoriteCheckbox.dataset.workflowPresent = workflowPresent ? '1' : '0';
					job.favoriteCheckbox.dataset.workflowNull = workflowNull ? '1' : '0';
					applyWorkflowIdentityToCard( job.favoriteCheckbox, workflowId, workflowRevision );
					updateImageCardState( job.favoriteCheckbox, {
						favoriteLoaded: true,
						favorite,
						workflowLoaded: true,
						workflowPresent,
						workflowNull
					} );
					setFavoriteImageBorder( job.favoriteCheckbox, favorite );
				}

				autosizeCopyAllPreview( job.paramsTextarea );
				autosizeCopyAllPreview( job.promptTextarea );
			} finally {
				AppState.runtime.copyAllActiveCount--;
				processCopyAllPreviewQueue();
			}
		} )();
	}
}

export function applyImageCardBorder( referenceElement, isFavorite = false, workflowPresent = false, workflowNull = false ) {
	if( !referenceElement ) {
		return;
	}

	const card = referenceElement.closest( '.image-card' );
	const image = card ? card.querySelector( 'img' ) : null;
	if( !image ) {
		return;
	}

	if( workflowNull ) {
		image.style.borderColor = '#bf4547';
		return;
	}

	if( workflowPresent ) {
		image.style.borderColor = '#419f3f';
		return;
	}

	image.style.borderColor = '#444';
}

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
	const showNoWorkflow = workflowLoaded && workflowNull;

	actions.style.display = showNoWorkflow ? 'none' : 'flex';
	noWorkflowLabel.style.display = showNoWorkflow ? '' : 'none';
}

export function updateImageCardState( referenceElement, { favoriteLoaded = null, favorite = null, workflowLoaded = null, workflowPresent = null, workflowNull = null } = {} ) {
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

	updateWorkflowActionsVisibility( referenceElement );
	applyImageCardFilters();
}

export function setFavoriteImageBorder( checkbox, isFavorite ) {
	if( !checkbox ) {
		return;
	}

	const workflowPresent = checkbox.dataset.workflowPresent === '1';
	const workflowNull = checkbox.dataset.workflowNull === '1';
	applyImageCardBorder( checkbox, isFavorite, workflowPresent, workflowNull );
}

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
		const response = await fetch( 'api/update_image_favorite.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				imageId,
				favorite,
				modelId: AppState.model.currentModelId,
				modelVersionId: AppState.model.currentVersionId,
				imageFilename: checkbox.dataset.imageFilename || ''
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
