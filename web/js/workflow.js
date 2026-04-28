import { AppState } from './app-context.js';
import { applyWorkflowIdentityToCard,	applyImageCardFilters, loadVersionWorkflowFilters } from './filters.js';
import { extractFilenameFromUrl, updateImageCardState, setFavoriteImageBorder, applyImageCardBorder } from './image-cache.js';

import { buildWorkflowAnalysisFromParametersText, buildInferredWorkflowJsonText, fetchParametersFallbackFromGenerationData, renderParametersAnalysis } from './workflow/parameters.js';
import { buildWorkflowAnalysisData, computeWorkflowShapeHashFromAnalysisData, fetchNodePortDefinitions } from './workflow/analysis.js';
import { copyTextWithFallback, renderWorkflowAnalysis } from './workflow/rendering.js';

export {
	buildWorkflowAnalysisData,
	buildWorkflowShapeTextFromAnalysisData,
	computeWorkflowShapeHashFromAnalysisData,
	fetchNodePortDefinitions
} from './workflow/analysis.js';
export {
	copyTextWithFallback,
	renderWorkflowAnalysis
} from './workflow/rendering.js';


/** Extract workflow/parameters for image card and copy text to clipboard
 * @param {HTMLElement|null} button trigger element with image dataset metadata
 */
export async function copyImageWorkflow( button ) {
	if( !button ) {
		return;
	}

	const originalText = button.textContent;
	let copiedSuccessfully = false;

	button.disabled = true;
	button.textContent = 'Extracting...';

	try {
		const processed = await extractAndPersistWorkflowForElement( button, { renderAnalysis: false } );
		const copied = await copyTextWithFallback( processed.workflowText );
		if( copied ) {
			copiedSuccessfully = true;
		} else {
			window.prompt( 'Clipboard was blocked. Press Ctrl+C (Cmd+C on Mac), then Enter:', processed.workflowText );
		}
	} catch( error ) {
		console.warn( 'Workflow extraction/copy failed:', error );
	} finally {
		button.disabled = false;
		button.textContent = copiedSuccessfully ? 'Copied' : originalText;
	}
}


/** Extract workflow/parameters for an image card and render analysis UI
 * @param {HTMLElement|null} button trigger element with image dataset metadata
 */
export async function analyzeImageWorkflow( button ) {
	if( !button ) {
		return;
	}

	const originalText = button.textContent;

	button.disabled = true;
	button.textContent = 'Analyzing...';

	try {
		await extractAndPersistWorkflowForElement( button, { renderAnalysis: true } );
	} catch( error ) {
		console.warn( 'Workflow analysis failed:', error );
	} finally {
		button.disabled = false;
		button.textContent = originalText;
	}
}


/** Re-scan workflow metadata for single image card
 * @param {HTMLElement|null} noWorkflowButton retry button 
 */
export async function retrySingleImageWorkflowScan( noWorkflowButton ) {
	if( !noWorkflowButton ) {
		return;
	}

	const card = noWorkflowButton.closest( '.image-card' );
	if( !card ) {
		return;
	}

	const workflowButton = card.querySelector( '.workflow-copy-btn' ) || card.querySelector( '.workflow-analyze-btn' );
	if( !workflowButton ) {
		return;
	}

	const imagePageUrl = workflowButton.dataset.imagePageUrl || '';
	const fullImageUrl = workflowButton.dataset.fullImageUrl || '';
	const imageFilename = extractFilenameFromUrl( fullImageUrl || imagePageUrl );
	const originalText = noWorkflowButton.textContent;

	noWorkflowButton.disabled = true;
	noWorkflowButton.textContent = 'Rescanning...';

	try {
		await extractAndPersistWorkflowForElement( workflowButton, { renderAnalysis: false } );
	} catch( error ) {
		console.warn( 'Single-image workflow rescan failed:', error );
		await markWorkflowMissingForElement( workflowButton, imageFilename, error );
	} finally {
		noWorkflowButton.disabled = false;
		noWorkflowButton.textContent = originalText;
	}
}


/** Scan gallery cards and persist missing workflow/parameter state entries
 * @param {HTMLButtonElement|null}	button				trigger button for scan action
 * @param {{rescanAll?: boolean}}		[options={}]	scan options
 */
export async function scanMissingImageWorkflows( button, options = {} ) {
	if( !button ) {
		return;
	}

	const rescanAll = options?.rescanAll === true;

	const originalText = button.textContent;
	button.disabled = true;
	button.textContent = rescanAll ? 'Rescanning...' : 'Scanning...';

	const targets = collectUniqueWorkflowButtons();
	let scanned = 0;
	let processed = 0;
	let skipped = 0;
	let failures = 0;

	for( const target of targets ) {
		scanned += 1;
		const imageId = Number( target?.dataset?.imageId || 0 );
		const imagePageUrl = target?.dataset?.imagePageUrl || '';
		const fullImageUrl = target?.dataset?.fullImageUrl || '';
		const imageFilename = extractFilenameFromUrl( fullImageUrl || imagePageUrl );

		button.textContent = `Scanning ${scanned}/${targets.length}`;

		try {
			if( !rescanAll ) {
				const state = await fetchCachedWorkflowEntryState( imageId );
				if( state.hasWorkflowEntry && !state.workflowNull ) {
					skipped += 1;
					continue;
				}
			}

			await extractAndPersistWorkflowForElement( target, { renderAnalysis: false } );
			processed += 1;
		} catch( error ) {
			if( typeof error === 'object' && error !== null && error.errorCode === 'PARAMETERS_FOUND' ) {
				try {
					await markImageParametersAsPresent( imageId, imageFilename, '1' );
					applyWorkflowUiToAllCardsForImageId( imageId, 'parameters', '1' );
					processed += 1;
					continue;
				} catch( parameterPersistError ) {
					failures += 1;
					console.warn( `Parameter classification failed for image ${imageId}:`, parameterPersistError );
					continue;
				}
			}

			if( shouldMarkWorkflowAsMissing( error ) ) {
				await markWorkflowMissingForElement( target, imageFilename, error );
				processed += 1;
			} else {
				failures += 1;
				console.warn( `Workflow scan failed for image ${imageId}:`, error );
			}
		}
	}

	button.disabled = false;
	button.textContent = originalText;
	const modeLabel = rescanAll ? 'Workflow rescan complete.' : 'Workflow scan complete.';
	alert( `${modeLabel} Scanned: ${scanned}, Updated: ${processed}, Skipped: ${skipped}, Errors: ${failures}` );
}

/** Collect one workflow action button per unique image id from current DOM
 * @returns {HTMLElement[]} Workflow action elements
 */
function collectUniqueWorkflowButtons() {
	const buttons = Array.from( document.querySelectorAll( '.workflow-analyze-btn, .workflow-copy-btn' ) );
	const uniqueByImageId = new Map();

	buttons.forEach( button => {
		const imageId = Number( button?.dataset?.imageId || 0 );
		if( !Number.isInteger( imageId ) || imageId <= 0 ) {
			return;
		}

		if( !uniqueByImageId.has( imageId ) ) {
			uniqueByImageId.set( imageId, button );
		}
	} );

	return Array.from( uniqueByImageId.values() );
}

/** Fetch cached workflow state metadata for image id from backend
 * @param {number} imageId Image id to query
 * @returns {Promise<{hasWorkflowEntry: boolean, workflowNull: boolean, workflowHash: string, parametersPresent: boolean, parametersHash: string}>}
 */
async function fetchCachedWorkflowEntryState( imageId ) {
	const response = await fetch( 'api/images/get_image_workflow_state.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( { imageId } )
	} );

	const result = await response.json();
	if( !response.ok || !result.success ) {
		throw new Error( result.error || `HTTP ${response.status}` );
	}

	return {
		hasWorkflowEntry: result.hasWorkflowEntry === true,
		workflowNull: result.workflowNull === true,
		workflowHash: typeof result.workflowHash === 'string' ? result.workflowHash : '',
		parametersPresent: result.parametersPresent === true,
		parametersHash: typeof result.parametersHash === 'string' ? result.parametersHash : ''
	};
}
/** Persist missing-workflow state and update all matching card UIs when applicable
 * @param {HTMLElement|null}	referenceElement	element carrying image dataset metadata
 * @param {string}						imageFilename			best-effort source filename for persistence
 * @param {unknown}						error							upstream extraction error
 */
async function markWorkflowMissingForElement( referenceElement, imageFilename, error ) {
	const imageId = Number( referenceElement?.dataset?.imageId || 0 );

	if( Number.isInteger( imageId ) && imageId > 0 && shouldMarkWorkflowAsMissing( error ) ) {
		try {
			await markImageWorkflowAsNull( imageId, imageFilename );
		} catch( markError ) {
			console.warn( `Could not mark workflow state for image ${imageId}:`, markError );
		}

		applyWorkflowUiToAllCardsForImageId( imageId, 'missing' );
	}
}
/** Persist confirmed missing-workflow state for an image and refresh local caches.
 *
 * @param {number} imageId						image id to mark
 * @param {string} [imageFilename='']	optional source filename for storage
 * @returns {Promise<boolean>} True when backend confirms a null/missing workflow state
 */
export async function markImageWorkflowAsNull( imageId, imageFilename = '' ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return false;
	}

	const response = await fetch( 'api/images/update_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {
			imageId,
			workflowState: 'missing',
			workflow: null,
			modelId: AppState.model.currentModelId,
			modelVersionId: AppState.model.currentVersionId,
			imageFilename
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
			workflowPresent: false,
			workflowNull: result.workflowNull === true,
			workflowHash: '',
			parametersPresent: false,
			parametersHash: ''
		} );
	}

	try {
		await refreshWorkflowFilterOptionsForCurrentVersion();
	} catch( error ) {
		console.warn( 'Could not refresh workflow filter options after workflow removal:', error );
	}

	return result.workflowNull === true;
}


/** Extract workflow or parameters from image element, persist state, and optionally render analysis
 * @param {HTMLElement|null}						referenceElement	source element containing image dataset metadata
 * @param {{renderAnalysis?: boolean}}	[options={}]			extraction options
 * @returns {Promise<{imageId: number, imageFilename: string, workflowText: string, workflowHash: string}>}
 */
async function extractAndPersistWorkflowForElement( referenceElement, { renderAnalysis = false } = {} ) {
	const imageId = Number( referenceElement?.dataset?.imageId || 0 );
	const imagePageUrl = referenceElement?.dataset?.imagePageUrl || '';
	const fullImageUrl = referenceElement?.dataset?.fullImageUrl || '';
	const imageFilename = extractFilenameFromUrl( fullImageUrl || imagePageUrl ); // image-cache.js
	const card = referenceElement?.closest( '.image-card' ) || null;
	const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;

	const result = await fetchImageWorkflowData( imageId, imagePageUrl, fullImageUrl );
	if( result.mode === 'parameters' ) {
		if( Number.isInteger( imageId ) && imageId > 0 ) {
			await markImageParametersAsPresent( imageId, imageFilename, '1' );
			applyWorkflowUiToAllCardsForImageId( imageId, 'parameters', '1' );
		}

		if( renderAnalysis ) {
			const modelFilename = buildModelFilenameForWorkflow( AppState.model.currentFilename, AppState.model.currentBaseModel );
			const inferredWorkflow = buildWorkflowAnalysisFromParametersText( result.parametersText, imageId, modelFilename ); // workflow/parameters.js
			renderParametersAnalysis( imageId, result.parametersText ); // workflow/parameters.js

			if( inferredWorkflow ) {
				const inferredWorkflowJsonText = buildInferredWorkflowJsonText( inferredWorkflow ); // workflow/parameters.js

				renderWorkflowAnalysis( // workflow/rendering.js
					imageId,
					inferredWorkflow.analysisData,
					inferredWorkflow.nodePortDefinitions,
					{
						keepParametersVisible: true,
						scrollToSection: false,
						exportableWorkflowJsonText: inferredWorkflowJsonText
					}
				);
			} else {
				const workflowSection = document.getElementById( 'workflowAnalysisSection' );
				if( workflowSection ) {
					workflowSection.style.display = 'none';
				}
			}

			const parametersSection = document.getElementById( 'parametersAnalysisSection' );
			if( parametersSection ) {
				parametersSection.scrollIntoView( { behavior: 'smooth', block: 'start' } );
			}
		}

		return {
			imageId,
			imageFilename,
			workflowText: result.parametersText,
			workflowHash: ''
		};
	}

	const analysisData = buildWorkflowAnalysisData( result.workflowJson ); // workflow/analysis.js
	const workflowHash = await computeWorkflowShapeHashFromAnalysisData( analysisData ); // workflow/analysis.js

	if( Number.isInteger( imageId ) && imageId > 0 ) {
		applyWorkflowIdentityToCard( referenceElement, workflowHash ); // filters.js
		await markImageWorkflowAsPresent( imageId, imageFilename, workflowHash );
		applyWorkflowUiToAllCardsForImageId( imageId, 'workflow' );
	}

	if( renderAnalysis ) {
		const nodePortDefinitions = await fetchNodePortDefinitions( analysisData.nodes ); // workflow/analysis.js
		renderWorkflowAnalysis( imageId, analysisData, nodePortDefinitions, { exportableWorkflowJsonText: '' } ); // workflow/rendering.js

		const workflowNodeList = document.getElementById( 'workflowAnalysisNodeList' );
		if( workflowNodeList ) {
			workflowNodeList.scrollIntoView( { behavior: 'smooth', block: 'start' } );
		}
	}

	return {
		imageId,
		imageFilename,
		workflowText: result.workflowText,
		workflowHash
	};
}

/** Build  model filename with subfolder and extension for use in inferred workflows
 * @param {string|null} filename  bare filename from AppState (may or may not have extension)
 * @param {string|null} subfolder base model subfolder from AppState (e.g. "Flux.1 D")
 * @returns {string}
 */
function buildModelFilenameForWorkflow( filename, subfolder ) {
	if( !filename ) return '';
	const withExt = /\.[a-z0-9]+$/i.test( filename ) ? filename : `${filename}.safetensors`;
	return subfolder ? `${subfolder}\\${withExt}` : withExt;
}
/** Retrieve workflow extraction payload for image, with fallback to A1111 parameters
 * @param {number} imageId			image id for backend lookup and fallback calls
 * @param {string} imagePageUrl	image page URL candidate
 * @param {string} fullImageUrl	full image URL candidate
 * @returns {Promise<object>} extraction result object containing either workflow or parameters mode
 */
export async function fetchImageWorkflowData( imageId, imagePageUrl, fullImageUrl ) {
	const requestBody = {
		imageId,
		imagePageUrl,
		fullImageUrl
	};
	
	console.debug( 'Workflow extraction request:', requestBody );
	
	const response = await fetch( 'api/images/extract_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( requestBody )
	} );

	const responseText = await response.text();
	let result = null;

	try {
		result = responseText.trim() === '' ? null : JSON.parse( responseText );
	} catch( parseError ) {
		const snippet = responseText.trim().slice( 0, 240 );
		const detail = snippet !== '' ? ` Response: ${snippet}` : ' Empty response body.';
		const parseErrorMsg = `Workflow extraction returned invalid JSON.${detail}`;
		
		console.error( 'Workflow extraction parse error:', {
			imageId,
			pageUrl: imagePageUrl,
			statusCode: response.status,
			error: parseError?.message,
			detail
		} );
		
		const fallbackParametersText = await fetchParametersFallbackFromGenerationData( imageId ); // workflow/parameters.js
		if( fallbackParametersText !== '' ) {
			return {
				success: true,
				mode: 'parameters',
				parametersText: fallbackParametersText,
				errorCode: 'PARAMETERS_FALLBACK'
			};
		}

		throw new Error( parseErrorMsg );
	}

	if( !result || typeof result !== 'object' ) {
		const snippet = responseText.trim().slice( 0, 240 );
		
		console.error( 'Workflow extraction empty/invalid result:', {
			imageId,
			pageUrl: imagePageUrl,
			statusCode: response.status,
			isNull: result === null,
			isObject: result !== null && typeof result === 'object',
			snippet: snippet || '(empty)',
			fullResponseLength: responseText.length,
			fullResponse: responseText.length > 0 ? responseText : '(empty)'
		} );
		
		const fallbackParametersText = await fetchParametersFallbackFromGenerationData( imageId ); // workflow/parameters.js
		if( fallbackParametersText !== '' ) {
			return {
				success: true,
				mode: 'parameters',
				parametersText: fallbackParametersText,
				errorCode: 'PARAMETERS_FALLBACK'
			};
		}

		throw new Error( `Workflow extraction returned an empty response.${snippet ? ` Got: ${snippet}` : ''}` );
	}

	if(
		result &&
		typeof result.errorCode === 'string' &&
		result.errorCode === 'PARAMETERS_FOUND' &&
		typeof result.parametersText === 'string' &&
		result.parametersText.trim() !== ''
	) {
		return {
			...result,
			success: true,
			mode: 'parameters',
			parametersText: result.parametersText
		};
	}

	// If result has error details (from PHP error handling), log unexpected ones.
	const isExpectedNoWorkflowResult =
		result &&
		typeof result.errorCode === 'string' &&
		( result.errorCode === 'WORKFLOW_NOT_FOUND' || result.errorCode === 'PARAMETERS_FOUND' );
	if( result && typeof result.error === 'string' && !isExpectedNoWorkflowResult ) {
		console.error( 'Workflow API error:', result );
	}

	if( !response.ok || !result.success || typeof result.workflowText !== 'string' || result.workflowText.trim() === '' ) {
		const fallbackParametersText = await fetchParametersFallbackFromGenerationData( imageId ); // workflow/parameters.js
		if( fallbackParametersText !== '' ) {
			return {
				success: true,
				mode: 'parameters',
				parametersText: fallbackParametersText,
				errorCode: 'PARAMETERS_FALLBACK'
			};
		}

		const error = new Error( result.error || `HTTP ${response.status}` );
		if( result && typeof result.errorCode === 'string' ) {
			error.errorCode = result.errorCode;
		}
		throw error;
	}

	try {
		result.workflowJson = JSON.parse( result.workflowText );
	} catch( parseError ) {
		throw new Error( 'Invalid workflow JSON' );
	}

	return result;
}
/** Persist workflow-present state for an image and update local cached flags
 * @param {number} imageId						image id to update
 * @param {string} [imageFilename='']	optional source filename for storage
 * @param {string} [workflowHash='']	deterministic workflow-shape hash
 * @returns {Promise<boolean>} true on success
 */
export async function markImageWorkflowAsPresent( imageId, imageFilename = '', workflowHash = '' ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return false;
	}

	const workflowHashString = workflowHash === null || workflowHash === undefined
		? ''
		: String( workflowHash ).trim();

	if( workflowHashString === '' ) {
		throw new Error( 'Missing workflow hash' );
	}

	const response = await fetch( 'api/images/update_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {
			imageId,
			workflowState: 'present',
			workflow: workflowHashString,
			modelId: AppState.model.currentModelId,
			modelVersionId: AppState.model.currentVersionId,
			imageFilename
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
			workflowPresent: true,
			workflowNull: false,
			workflowHash: workflowHashString,
			parametersPresent: false,
			parametersHash: ''
		} );
	}

	try {
		await refreshWorkflowFilterOptionsForCurrentVersion();
	} catch( error ) {
		console.warn( 'Could not refresh workflow filter options after workflow update:', error );
	}

	return true;
}

/** Persist parameters-only state for an image when no native Comfy workflow is available
 * @param {number} imageId							image id to update
 * @param {string} [imageFilename='']		optional source filename for storage
 * @param {string} [parametersHash='1'] lightweight parameters marker/hash
 * @returns {Promise<boolean>} true on success
 */
export async function markImageParametersAsPresent( imageId, imageFilename = '', parametersHash = '1' ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return false;
	}

	const normalizedHash = String( parametersHash || '' ).trim() || '1';

	const response = await fetch( 'api/images/update_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {
			imageId,
			workflowState: 'parameters_only',
			workflow: normalizedHash,
			modelId: AppState.model.currentModelId,
			modelVersionId: AppState.model.currentVersionId,
			imageFilename
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
			workflowPresent: false,
			workflowNull: true,
			workflowHash: '',
			parametersPresent: true,
			parametersHash: normalizedHash
		} );
	}

	try {
		await refreshWorkflowFilterOptionsForCurrentVersion();
	} catch( error ) {
		console.warn( 'Could not refresh workflow filter options after parameters update:', error );
	}

	return true;
}

/** Decide whether an extraction error should be persisted as missing workflow state
 * @param {unknown} error error-like value from workflow extraction
 * @returns {boolean} true when the error should mark workflow as missing
 */
export function shouldMarkWorkflowAsMissing( error ) {
	if( !error ) {
		return false;
	}

	if( typeof error === 'object' && error !== null && error.errorCode === 'WORKFLOW_NOT_FOUND' ) {
		return true;
	}

	if( typeof error === 'object' && error !== null && error.errorCode === 'PARAMETERS_FOUND' ) {
		return false;
	}

	return isMissingWorkflowError( error?.message );
}
/** Check whether backend error message indicates absent workflow metadata
 * @param {unknown} message error message candidate
 * @returns {boolean}
 */
export function isMissingWorkflowError( message ) {
	const text = String( message || '' ).toLowerCase();
	return text === 'no data';
}


/** Apply workflow/parameters UI state updates to every card instance for one image id
 * @param {number}														imageId							image id to target
 * @param {'workflow'|'parameters'|'missing'}	workflowState				new workflow state
 * @param {string}														[parametersHash='']	optional parameters hash used by parameters state
 * @returns {void}
 */
function applyWorkflowUiToAllCardsForImageId( imageId, workflowState, parametersHash = '' ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return;
	}

	const allButtons = document.querySelectorAll(
		`.workflow-copy-btn[data-image-id="${imageId}"], .workflow-analyze-btn[data-image-id="${imageId}"]`
	);
	const seenCards = new Set();

	allButtons.forEach( btn => {
		const card = btn.closest( '.image-card' );
		if( !card || seenCards.has( card ) ) {
			return;
		}
		seenCards.add( card );
		const favoriteCheckbox = card.querySelector( '.favorite-checkbox' );
		if( workflowState === 'workflow' ) {
			applyPresentWorkflowUi( btn, favoriteCheckbox );
		} else if( workflowState === 'parameters' ) {
			applyParametersWorkflowUi( btn, favoriteCheckbox, parametersHash );
		} else {
			applyMissingWorkflowUi( btn, favoriteCheckbox );
		}
	} );
}

/** Apply "workflow present" visuals/state to a single card
 * @param {HTMLElement|null}			referenceElement	element inside the card
 * @param {HTMLInputElement|null}	favoriteCheckbox	card favorite checkbox, if present
 * @returns {void}
 */
function applyPresentWorkflowUi( referenceElement, favoriteCheckbox ) {
	if( favoriteCheckbox ) {
		favoriteCheckbox.dataset.workflowPresent = '1';
		favoriteCheckbox.dataset.workflowNull = '0';
		favoriteCheckbox.dataset.parametersPresent = '0';
		updateImageCardState( favoriteCheckbox, {
			workflowLoaded: true,
			workflowPresent: true,
			workflowNull: false,
			parametersPresent: false,
			parametersHash: ''
		} );
		setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
	} else {
		applyImageCardBorder( referenceElement, false, true, false );
		updateImageCardState( referenceElement, {
			workflowLoaded: true,
			workflowPresent: true,
			workflowNull: false,
			parametersPresent: false,
			parametersHash: ''
		} );
	}

	applyImageCardFilters();
}

/** Apply "parameters only" visuals/state to a single card
 * @param {HTMLElement|null}			referenceElement			element inside the card
 * @param {HTMLInputElement|null}	favoriteCheckbox			card favorite checkbox, if present
 * @param {string}								[parametersHash='1']	parameters hash/marker to persist in dataset
 * @returns {void}
 */
function applyParametersWorkflowUi( referenceElement, favoriteCheckbox, parametersHash = '1' ) {
	const normalizedHash = String( parametersHash || '' ).trim() || '1';
	applyWorkflowIdentityToCard( referenceElement, '' );

	if( favoriteCheckbox ) {
		favoriteCheckbox.dataset.workflowPresent = '0';
		favoriteCheckbox.dataset.workflowNull = '1';
		favoriteCheckbox.dataset.parametersPresent = '1';
		updateImageCardState( favoriteCheckbox, {
			workflowLoaded: true,
			workflowPresent: false,
			workflowNull: true,
			parametersPresent: true,
			parametersHash: normalizedHash
		} );
		setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
	} else {
		updateImageCardState( referenceElement, {
			workflowLoaded: true,
			workflowPresent: false,
			workflowNull: true,
			parametersPresent: true,
			parametersHash: normalizedHash
		} );
	}

	applyImageCardFilters();
}

/** Apply "missing workflow" visuals/state to a single card
 * @param {HTMLElement|null}			referenceElement	element inside the card
 * @param {HTMLInputElement|null} favoriteCheckbox	card favorite checkbox, if present	
 * @returns {void}
 */
function applyMissingWorkflowUi( referenceElement, favoriteCheckbox ) {
	applyWorkflowIdentityToCard( referenceElement, '' );

	if( favoriteCheckbox ) {
		favoriteCheckbox.dataset.workflowPresent = '0';
		favoriteCheckbox.dataset.workflowNull = '1';
		updateImageCardState( favoriteCheckbox, {
			workflowLoaded: true,
			workflowPresent: false,
			workflowNull: true,
			parametersPresent: false,
			parametersHash: ''
		} );
		setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
	} else {
		applyImageCardBorder( referenceElement, false, false, true );
		updateImageCardState( referenceElement, {
			workflowLoaded: true,
			workflowPresent: false,
			workflowNull: true,
			parametersPresent: false,
			parametersHash: ''
		} );
	}
}


/** Refresh workflow filter options after workflow state changes */
async function refreshWorkflowFilterOptionsForCurrentVersion() { 
	const versionId = Number( AppState.model.currentVersionId || 0 );
	if( !Number.isInteger( versionId ) || versionId <= 0 ) {
		return;
	}

	await loadVersionWorkflowFilters( versionId );
}
