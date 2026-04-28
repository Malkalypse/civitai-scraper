import { AppState, output } from './app-context.js';
import { waitForWorkflowSectionToBeHidden, applyGenerationPreviewVisibility, applyImageCardFilters } from './filters.js';
import { checkCached, downloadAndCache, extractImageIdFromUrl, extractFilenameFromUrl, syncCopyAllPreviewWidth, autosizeCopyAllPreview, queueCopyAllPreviewHydration, toggleImageFavorite } from './image-cache.js';
import { copyImageWorkflow, analyzeImageWorkflow, retrySingleImageWorkflowScan } from './workflow.js';
import { escapeHtml } from './dom-utils.js';

/** Initialize event handlers for the image gallery */
function initializeImageGalleryEventHandlers() {
	if( !output || initializeImageGalleryEventHandlers.initialized ) {
		return;
	}

	output.addEventListener( 'click', ( event ) => {
		const fullscreenVideo = event.target.closest( 'video[data-action="request-fullscreen"]' );
		if( fullscreenVideo && output.contains( fullscreenVideo ) ) {
			fullscreenVideo.requestFullscreen();
			return;
		}

		const workflowCopyBtn = event.target.closest( '.workflow-copy-btn' );
		if( workflowCopyBtn && output.contains( workflowCopyBtn ) ) {
			copyImageWorkflow( workflowCopyBtn );
			return;
		}

		const workflowAnalyzeBtn = event.target.closest( '.workflow-analyze-btn' );
		if( workflowAnalyzeBtn && output.contains( workflowAnalyzeBtn ) ) {
			analyzeImageWorkflow( workflowAnalyzeBtn );
			return;
		}

		const noWorkflowBtn = event.target.closest( '.workflow-no-workflow[data-action="retry-workflow-scan"]' );
		if( noWorkflowBtn && output.contains( noWorkflowBtn ) ) {
			retrySingleImageWorkflowScan( noWorkflowBtn );
		}
	} );

	output.addEventListener( 'change', ( event ) => {
		const favoriteCheckbox = event.target.closest( '.favorite-checkbox' );
		if( favoriteCheckbox && output.contains( favoriteCheckbox ) ) {
			toggleImageFavorite( favoriteCheckbox );
		}
	} );

	initializeImageGalleryEventHandlers.initialized = true;
}

/** Update the maximum width and height of all images and videos in the gallery and carousel to match the specified thumbnail size, and update the layout of generation preview textareas accordingly
 * @param {number} size The new thumbnail size in pixels
 */
export function updateThumbnailSize( size ) {
	AppState.ui.thumbnailSize = size;
	localStorage.setItem( 'thumbnailSize', size );

	const allImages = document.querySelectorAll( '#carouselContainer img, #galleryContainer img' );
	allImages.forEach( img => {
		img.style.maxWidth = size + 'px';
		img.style.maxHeight = size + 'px';
	} );

	const allVideos = document.querySelectorAll( '#carouselContainer video, #galleryContainer video' );
	allVideos.forEach( video => {
		video.style.maxWidth = size + 'px';
		video.style.maxHeight = size + 'px';
	} );

	const allCopyAllTextareas = document.querySelectorAll( '.generation-preview' );
	allCopyAllTextareas.forEach( textarea => {
		const card = textarea.closest( '.image-card' );
		if( card ) {
			syncCopyAllPreviewWidth( card );
		}
		autosizeCopyAllPreview( textarea );
	} );

	applyGenerationPreviewVisibility();
}

/** Load images for a specific model and version, updating the gallery and carousel
 * @param {string} modelId The ID of the model to load images for
 * @param {Object} selectedVersion The selected version object containing version details
 * @param {string} imageLoadToken A token representing the current image load session, used to ensure that outdated requests do not update the UI
 * @returns {Promise<void>} A promise that resolves when the images have been loaded
 */
export async function loadModelImages( modelId, selectedVersion, imageLoadToken = AppState.runtime.currentImageLoadToken ) {
	const isStale = () => imageLoadToken !== AppState.runtime.currentImageLoadToken;
	AppState.runtime.copyAllTextQueue = [];
	AppState.runtime.copyAllTextPending = new Map();
	AppState.runtime.copyAllTextCache = new Map();

	const pauseIfWorkflowAnalysisVisible = async () => {
		while( !isStale() && AppState.workflow.workflowAnalysisSectionVisible ) {
			await waitForWorkflowSectionToBeHidden();
		}
	};

	const setStatus = ( elementId, value, useHtml = false ) => {
		if( isStale() ) {
			return false;
		}

		const element = document.getElementById( elementId );
		if( !element ) {
			return false;
		}

		if( useHtml ) {
			element.innerHTML = value;
		} else {
			element.textContent = value;
		}

		return true;
	};

	if( !selectedVersion || !selectedVersion.id ) {
		setStatus( 'carouselStatus', '(no version data)' );
		setStatus( 'galleryStatus', '(no version data)' );
		return;
	}

	const versionId = selectedVersion.id;

	const fetchImageData = async () => {
		const response = await fetch( 'api/models/get_model_images.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { modelId, versionId } )
		} );
		return response.json();
	};

	const MAX_GALLERY_RETRIES = 3;
	const GALLERY_RETRY_DELAY_MS = 2000;

	try {
		await pauseIfWorkflowAnalysisVisible();
		if( isStale() ) {
			return;
		}

		let result = await fetchImageData();
		if( isStale() ) {
			return;
		}

		if( result.error ) {
			console.error( 'Image fetch error:', result.error );
			setStatus( 'carouselStatus', '(error loading)' );
			setStatus( 'galleryStatus', '(error loading)' );
			return;
		}

		const carouselSucceeded = result.carouselImages && result.carouselImages.length > 0;
		const galleryEmpty = !result.galleryImages || result.galleryImages.length === 0;

		if( carouselSucceeded && galleryEmpty ) {
			for( let attempt = 1; attempt <= MAX_GALLERY_RETRIES; attempt++ ) {
				if( isStale() ) {
					return;
				}
				setStatus( 'galleryStatus', `(retrying ${attempt}/${MAX_GALLERY_RETRIES}...)` );
				await new Promise( resolve => setTimeout( resolve, GALLERY_RETRY_DELAY_MS ) );
				if( isStale() ) {
					return;
				}

				let retryResult;
				try {
					retryResult = await fetchImageData();
				} catch( retryError ) {
					console.warn( `Gallery retry ${attempt} fetch failed:`, retryError );
					continue;
				}

				if( retryResult.galleryImages && retryResult.galleryImages.length > 0 ) {
					result = retryResult;
					break;
				}
			}

			if( isStale() ) {
				return;
			}
		}

		if( result.carouselImages && result.carouselImages.length > 0 ) {
			setStatus( 'carouselStatus', `(<span id="carouselCount">0</span>/${result.carouselImages.length})`, true );

			const loadCarouselImages = async () => {
				if( isStale() ) {
					return;
				}
				await pauseIfWorkflowAnalysisVisible();
				if( isStale() ) {
					return;
				}

				const container = document.getElementById( 'carouselContainer' );
				if( !container ) {
					return;
				}
				if( container.dataset.loading === 'true' ) {
					console.warn( 'Carousel already loading, skipping duplicate call' );
					return;
				}

				container.dataset.loading = 'true';
				container.innerHTML = '';

				const carouselCountEl = document.getElementById( 'carouselCount' );
				if( carouselCountEl ) {
					carouselCountEl.textContent = '0';
				}

				const cacheChecks = result.carouselImages.map( img => {
					const lookupUrl = img.linkUrl || img.originalUrl || img.url;
					const isVideo = img.type === 'video' || ( img.url && ( img.url.includes( '.mp4' ) || img.url.includes( '.webm' ) ) );
					if( isVideo ) {
						return Promise.resolve( { originalUrl: img.originalUrl || img.url, linkUrl: img.linkUrl || img.url, url: img.url, isVideo: true, cached: true } );
					}
					return checkCached( img.url, lookupUrl ).then( check => ( {
						originalUrl: img.originalUrl || img.url,
						linkUrl: img.linkUrl || img.url,
						url: check.url,
						cached: check.cached,
						isVideo: false
					} ) );
				} );

				const imageInfo = await Promise.all( cacheChecks );
				const slotElements = imageInfo.map( () => {
					const slot = document.createElement( 'div' );
					slot.className = 'image-container';
					container.appendChild( slot );
					return slot;
				} );

				const orderedEntries = [
					...imageInfo.map( ( info, index ) => ( { ...info, originalIndex: index, renderPosition: index + 1 } ) ).filter( info => info.cached || info.isVideo ),
					...imageInfo.map( ( info, index ) => ( { ...info, originalIndex: index, renderPosition: index + 1 } ) ).filter( info => !info.cached && !info.isVideo )
				];

				let shouldDelayBeforeRemoteDownload = false;
				let renderedCount = 0;
				for( let index = 0; index < orderedEntries.length; index++ ) {
					if( isStale() ) {
						container.dataset.loading = 'false';
						return;
					}
					await pauseIfWorkflowAnalysisVisible();
					if( isStale() ) {
						container.dataset.loading = 'false';
						return;
					}

					const info = orderedEntries[index];
					let displayUrl = info.url;
					if( !info.cached && !info.isVideo ) {
						if( shouldDelayBeforeRemoteDownload ) {
							await new Promise( resolve => setTimeout( resolve, 1500 ) );
						}
						displayUrl = await downloadAndCache( info.url, info.linkUrl || info.originalUrl );
						shouldDelayBeforeRemoteDownload = true;
					} else {
						shouldDelayBeforeRemoteDownload = false;
					}

					let imageHtml = '';
					if( info.isVideo ) {
						const mp4Url = info.url.replace( /\.webm$/, '.mp4' );
						imageHtml = `
							<div class="image-card" data-favorite-loaded="0" data-favorite="0" data-workflow-loaded="0" data-workflow-present="0" data-workflow-null="0" data-workflow-id="" data-workflow-revision="" style="flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: flex-start;">
								<video style="max-width: ${AppState.ui.thumbnailSize}px; max-height: ${AppState.ui.thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block; cursor: pointer;"
										playsinline loop muted autoplay
										data-action="request-fullscreen">
									<source src="${escapeHtml( mp4Url )}" type="video/mp4">
								</video>
							</div>`;
					} else {
						const imageId = extractImageIdFromUrl( info.linkUrl || info.originalUrl );
						const imageFilename = extractFilenameFromUrl( displayUrl );
						imageHtml = `
							<div class="image-card" data-favorite-loaded="0" data-favorite="0" data-workflow-loaded="0" data-workflow-present="0" data-workflow-null="0" data-workflow-id="" data-workflow-revision="" style="flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: flex-start;">
								<a href="${escapeHtml( info.linkUrl || info.originalUrl )}" target="_blank">
									<img src="${escapeHtml( displayUrl )}"
										 alt="Image ${info.renderPosition}"
										 style="max-width: ${AppState.ui.thumbnailSize}px; max-height: ${AppState.ui.thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block;"
										 loading="lazy">
								</a>
								<label style="margin-top: 6px; font-size: 11px; color: #cfd8dc; display: flex; align-items: center; gap: 6px;">
									<input type="checkbox" class="favorite-checkbox" data-image-id="${imageId || ''}" data-image-filename="${escapeHtml( imageFilename )}">
									Favorite
								</label>
								<div class="workflow-actions" style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
									<button type="button" class="workflow-copy-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Copy Workflow</button>
									<button type="button" class="workflow-analyze-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Analyze Workflow</button>
								</div>
								<button type="button" class="workflow-no-workflow" data-action="retry-workflow-scan" style="margin-top: 6px; font-size: 11px; color: #bf4547; display: none; background: transparent; border: none; padding: 0; cursor: pointer; text-decoration: underline;">No Workflow</button>
								<textarea class="generation-preview generation-prompt-preview" readonly style="margin-top: 6px; width: 100%; min-height: 78px; background: #1f1f1f; color: #cfd8dc; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 11px; line-height: 1.35; white-space: pre-wrap; resize: none; overflow: hidden; box-sizing: border-box;">Loading prompt...</textarea>
							</div>`;
					}

					const slot = slotElements[info.originalIndex];
					if( !slot ) {
						continue;
					}

					slot.innerHTML = imageHtml;
					renderedCount++;
					if( !info.isVideo ) {
						const card = slot.firstElementChild;
						const promptField = card ? card.querySelector( '.generation-prompt-preview' ) : null;
						const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;
						syncCopyAllPreviewWidth( card );
						applyGenerationPreviewVisibility();
						applyImageCardFilters();
						queueCopyAllPreviewHydration( promptField, favoriteCheckbox, info.linkUrl || info.originalUrl, imageLoadToken, {
							modelId: AppState.model.currentModelId,
							modelVersionId: AppState.model.currentVersionId,
							imageFilename: extractFilenameFromUrl( displayUrl )
						} );
					}

					const carouselCountEl2 = document.getElementById( 'carouselCount' );
					if( carouselCountEl2 ) {
						carouselCountEl2.textContent = String( renderedCount );
					}
				}

				container.dataset.loading = 'false';
				setStatus( 'carouselStatus', `(${renderedCount})`, true );
			};

			loadCarouselImages();
		} else {
			setStatus( 'carouselStatus', '(0)' );
		}

		if( result.galleryImages && result.galleryImages.length > 0 ) {
			const totalGalleryLabel = `${result.galleryImages.length}${result.galleryHasMorePages ? '+' : ''}`;
			setStatus( 'galleryStatus', `(<span id="galleryCount">0</span>/${totalGalleryLabel})`, true );
			const loadGalleryImages = async () => {
				if( isStale() ) {
					return;
				}
				await pauseIfWorkflowAnalysisVisible();
				if( isStale() ) {
					return;
				}

				const container = document.getElementById( 'galleryContainer' );
				if( !container ) {
					return;
				}
				if( container.dataset.loading === 'true' ) {
					console.warn( 'Gallery already loading, skipping duplicate call' );
					return;
				}

				container.dataset.loading = 'true';
				container.innerHTML = '';

				const galleryCountEl = document.getElementById( 'galleryCount' );
				if( galleryCountEl ) {
					galleryCountEl.textContent = '0';
				}

				const cacheChecks = result.galleryImages.map( img => {
					const lookupUrl = img.linkUrl || img.originalUrl || img.url;
					const isVideo = img.type === 'video' || ( img.url && ( img.url.includes( '.mp4' ) || img.url.includes( '.webm' ) ) );
					if( isVideo ) {
						return Promise.resolve( { originalUrl: img.originalUrl || img.url, linkUrl: img.linkUrl || img.url, url: img.url, isVideo: true, cached: true } );
					}
					return checkCached( img.url, lookupUrl ).then( check => ( {
						originalUrl: img.originalUrl || img.url,
						linkUrl: img.linkUrl || img.url,
						url: check.url,
						cached: check.cached,
						isVideo: false
					} ) );
				} );

				const imageInfo = await Promise.all( cacheChecks );
				const slotElements = imageInfo.map( () => {
					const slot = document.createElement( 'div' );
					slot.className = 'image-container';
					container.appendChild( slot );
					return slot;
				} );

				const orderedEntries = [
					...imageInfo.map( ( info, index ) => ( { ...info, originalIndex: index, renderPosition: index + 1 } ) ).filter( info => info.cached || info.isVideo ),
					...imageInfo.map( ( info, index ) => ( { ...info, originalIndex: index, renderPosition: index + 1 } ) ).filter( info => !info.cached && !info.isVideo )
				];

				let shouldDelayBeforeRemoteDownload = false;
				let renderedCount = 0;
				for( let index = 0; index < orderedEntries.length; index++ ) {
					if( isStale() ) {
						container.dataset.loading = 'false';
						return;
					}
					await pauseIfWorkflowAnalysisVisible();
					if( isStale() ) {
						container.dataset.loading = 'false';
						return;
					}

					const info = orderedEntries[index];
					let displayUrl = info.url;
					if( !info.cached && !info.isVideo ) {
						if( shouldDelayBeforeRemoteDownload ) {
							await new Promise( resolve => setTimeout( resolve, 1500 ) );
						}
						displayUrl = await downloadAndCache( info.url, info.linkUrl || info.originalUrl );
						shouldDelayBeforeRemoteDownload = true;
					} else {
						shouldDelayBeforeRemoteDownload = false;
					}

					let imageHtml = '';
					if( info.isVideo ) {
						const mp4Url = info.url.replace( /\.webm$/, '.mp4' );
						imageHtml = `
							<div class="image-card" data-favorite-loaded="0" data-favorite="0" data-workflow-loaded="0" data-workflow-present="0" data-workflow-null="0" data-workflow-id="" data-workflow-revision="" style="flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: flex-start;">
								<video style="max-width: ${AppState.ui.thumbnailSize}px; max-height: ${AppState.ui.thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block; cursor: pointer;"
										playsinline loop muted autoplay
										data-action="request-fullscreen">
									<source src="${escapeHtml( mp4Url )}" type="video/mp4">
								</video>
							</div>`;
					} else {
						const imageId = extractImageIdFromUrl( info.linkUrl || info.originalUrl );
						const imageFilename = extractFilenameFromUrl( displayUrl );
						imageHtml = `
							<div class="image-card" data-favorite-loaded="0" data-favorite="0" data-workflow-loaded="0" data-workflow-present="0" data-workflow-null="0" data-workflow-id="" data-workflow-revision="" style="flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: flex-start;">
								<a href="${escapeHtml( info.linkUrl || info.originalUrl )}" target="_blank">
									<img src="${escapeHtml( displayUrl )}"
										 alt="Gallery Image ${info.renderPosition}"
										 style="max-width: ${AppState.ui.thumbnailSize}px; max-height: ${AppState.ui.thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block;"
										 loading="lazy">
								</a>
								<label style="margin-top: 6px; font-size: 11px; color: #cfd8dc; display: flex; align-items: center; gap: 6px;">
									<input type="checkbox" class="favorite-checkbox" data-image-id="${imageId || ''}" data-image-filename="${escapeHtml( imageFilename )}">
									Favorite
								</label>
								<div class="workflow-actions" style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
									<button type="button" class="workflow-copy-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Copy Workflow</button>
									<button type="button" class="workflow-analyze-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Analyze Workflow</button>
								</div>
								<button type="button" class="workflow-no-workflow" data-action="retry-workflow-scan" style="margin-top: 6px; font-size: 11px; color: #bf4547; display: none; background: transparent; border: none; padding: 0; cursor: pointer; text-decoration: underline;">No Workflow</button>
								<textarea class="generation-preview generation-prompt-preview" readonly style="margin-top: 6px; width: 100%; min-height: 78px; background: #1f1f1f; color: #cfd8dc; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 11px; line-height: 1.35; white-space: pre-wrap; resize: none; overflow: hidden; box-sizing: border-box;">Loading prompt...</textarea>
							</div>`;
					}

					const slot = slotElements[info.originalIndex];
					if( !slot ) {
						continue;
					}

					slot.innerHTML = imageHtml;
					renderedCount++;
					if( !info.isVideo ) {
						const card = slot.firstElementChild;
						const promptField = card ? card.querySelector( '.generation-prompt-preview' ) : null;
						const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;
						syncCopyAllPreviewWidth( card );
						applyGenerationPreviewVisibility();
						applyImageCardFilters();
						queueCopyAllPreviewHydration( promptField, favoriteCheckbox, info.linkUrl || info.originalUrl, imageLoadToken, {
							modelId: AppState.model.currentModelId,
							modelVersionId: AppState.model.currentVersionId,
							imageFilename: extractFilenameFromUrl( displayUrl )
						} );
					}

					const galleryCountEl2 = document.getElementById( 'galleryCount' );
					if( galleryCountEl2 ) {
						galleryCountEl2.textContent = String( renderedCount );
					}
				}

				container.dataset.loading = 'false';
				setStatus( 'galleryStatus', `(${renderedCount}/${totalGalleryLabel})`, true );
			};

			loadGalleryImages();
		} else {
			setStatus( 'galleryStatus', '(0)' );
		}
	} catch( error ) {
		console.error( 'Error loading images:', error );
		setStatus( 'carouselStatus', '(error)' );
		setStatus( 'galleryStatus', '(error)' );
	}
}

initializeImageGalleryEventHandlers();
