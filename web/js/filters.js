import { AppState } from './app-context.js';


/** Wait for workflow analysis section to be hidden, returning a promise that resolves when it is hidden
 * Useful for ensuring workflow analysis is not visible before performing actions that should only happen when it's hidden
 * @returns {Promise} Promise that resolves when workflow analysis section is hidden
 */
export function waitForWorkflowSectionToBeHidden() {
	if( !AppState.workflow.workflowAnalysisSectionVisible ) {
		return Promise.resolve();
	}

	return new Promise( resolve => {
		AppState.workflow.workflowVisibilityWaiters.push( resolve );
	} );
}


/** Normalize raw parameter value by unescaping common escape sequences and trimming whitespace
 * @param {string} value raw parameter value to normalize
 * @returns {string} normalized parameter value
 */
export function setupWorkflowAnalysisVisibilityObserver() {
	if( AppState.workflow.workflowVisibilityObserver ) {
		AppState.workflow.workflowVisibilityObserver.disconnect();
		AppState.workflow.workflowVisibilityObserver = null;
	}

	const workflowSection = document.getElementById( 'workflowAnalysisSection' );
	const parametersSection = document.getElementById( 'parametersAnalysisSection' );
	if( !workflowSection && !parametersSection ) {
		setWorkflowAnalysisSectionVisible( false );
		return;
	}

	AppState.workflow.workflowVisibilityObserver = new IntersectionObserver( ( entries ) => {
		const visibleSet = new Set();
		entries.forEach( entry => {
			if( entry && entry.isIntersecting && entry.target instanceof HTMLElement && entry.target.style.display !== 'none' ) {
				visibleSet.add( entry.target.id );
			}
		} );

		const isVisible = visibleSet.has( 'workflowAnalysisSection' ) || visibleSet.has( 'parametersAnalysisSection' );
		setWorkflowAnalysisSectionVisible( isVisible );
	}, {
		root: null,
		threshold: 0.05
	} );

	if( workflowSection ) {
		AppState.workflow.workflowVisibilityObserver.observe( workflowSection );
	}

	if( parametersSection ) {
		AppState.workflow.workflowVisibilityObserver.observe( parametersSection );
	}
}
/** Set the visibility of the workflow analysis section
 * @param {boolean} isVisible whether the workflow analysis section should be visible
 */
export function setWorkflowAnalysisSectionVisible( isVisible ) {
	AppState.workflow.workflowAnalysisSectionVisible = isVisible === true;

	if( !AppState.workflow.workflowAnalysisSectionVisible && AppState.workflow.workflowVisibilityWaiters.length > 0 ) {
		const waiters = AppState.workflow.workflowVisibilityWaiters.slice();
		AppState.workflow.workflowVisibilityWaiters = [];
		waiters.forEach( resolve => resolve() );
	}
}


/** Add a new node of the specified type to the workflow graph, using predefined templates for position, size, and inputs/outputs
 * @param {object} graph workflow graph object to modify
 * @param {string} type type of node to add, used to look up template
 * @param {Array} widgetsValues optional array of widget values to set on the new node
 * @returns {object} the newly added node
 */
export function applyWorkflowIdentityToCard( referenceElement, workflowHash = '' ) {
	if( !referenceElement ) {
		return;
	}

	const card = referenceElement.closest( '.image-card' );
	if( !card ) {
		return;
	}

	const hash = workflowHash === null || workflowHash === undefined ? '' : String( workflowHash ).trim();
	card.dataset.workflowHash = hash;
}


/** Load available workflow filters for a given version from the server 
 * @param {string} versionId ID of the version to load workflow filters for
 * @returns {Promise} Promise that resolves when filters are loaded and UI is updated
 */
export async function loadVersionWorkflowFilters( versionId ) {
	AppState.workflow.workflowFilterOptions = [];
	AppState.workflow.activeWorkflowFilterKey = 'all';

	const section = document.getElementById( 'workflowFilterSection' );
	const status = document.getElementById( 'workflowFilterStatus' );
	if( section ) {
		section.style.display = '';
	}
	if( status ) {
		status.textContent = '(loading...)';
	}

	renderWorkflowFilterButtons();

	const normalizedVersionId = Number( versionId || 0 );
	if( !Number.isInteger( normalizedVersionId ) || normalizedVersionId <= 0 ) {
		if( status ) {
			status.textContent = '(no version)';
		}
		applyImageCardFilters();
		return;
	}

	try {
		const response = await fetch( 'api/settings/get_version_workflows.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { versionId: normalizedVersionId } )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		AppState.workflow.workflowFilterOptions = Array.isArray( result.workflows )
			? result.workflows
				.map( row => {
					const workflowHash = row && row.workflowHash !== undefined && row.workflowHash !== null
						? String( row.workflowHash ).trim()
						: '';
					const key = buildWorkflowFilterKey( workflowHash );
					if( key === '' ) {
						return null;
					}
					const imageCount = Number( row?.imageCount || 0 );
					return { key, workflowHash, imageCount: Number.isFinite( imageCount ) ? imageCount : 0 };
				} )
				.filter( Boolean )
			: [];

		if( status ) {
			status.textContent = `(${AppState.workflow.workflowFilterOptions.length})`;
		}
	} catch( error ) {
		console.warn( 'Could not load version workflow filters:', error );
		if( status ) {
			status.textContent = '(error)';
		}
	} finally {
		renderWorkflowFilterButtons();
		applyImageCardFilters();
	}
}


/** Render workflow filter buttons based on available options */
export function renderWorkflowFilterButtons() {
	const container = document.getElementById( 'workflowFilterButtons' );
	if( !container ) {
		return;
	}

	const options = [ { key: 'all', workflowHash: 'all', imageCount: 0 }, ...AppState.workflow.workflowFilterOptions ];
	container.innerHTML = '';

	options.forEach( option => {
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.dataset.filterKey = option.key;
		btn.style.padding = '4px 8px';
		btn.style.border = '1px solid #444';
		btn.style.borderRadius = '3px';
		btn.style.cursor = 'pointer';
		btn.style.fontSize = '11px';
		btn.style.textAlign = 'left';

		if( option.key === 'all' ) {
			btn.textContent = 'All';
		} else {
			const shortHash = option.workflowHash.length > 12 ? `${option.workflowHash.slice( 0, 12 )}...` : option.workflowHash;
			btn.textContent = option.imageCount > 0 ? `${shortHash} (${option.imageCount})` : shortHash;
			btn.title = option.workflowHash;
		}

		const isActive = option.key === AppState.workflow.activeWorkflowFilterKey;
		btn.style.background = isActive ? '#419f3f' : '#2a2a3e';
		btn.style.color = '#fff';

		btn.addEventListener( 'click', () => {
			AppState.workflow.activeWorkflowFilterKey = option.key;
			renderWorkflowFilterButtons();
			applyImageCardFilters();
		} );

		container.appendChild( btn );
	} );
}


/** Show or hide image cards based on active filter criteria */
export function applyImageCardFilters() {
	document.querySelectorAll( '.image-card' ).forEach( card => {
		const imageContainer = card.closest( '.image-container' );
		const favoriteLoaded = card.dataset.favoriteLoaded === '1';
		const workflowLoaded = card.dataset.workflowLoaded === '1';
		const favorite = card.dataset.favorite === '1';
		const workflowNull = card.dataset.workflowNull === '1';
		const cardWorkflowKey = buildWorkflowFilterKey( card.dataset.workflowHash || '' );

		const hideForWorkflow = AppState.ui.hideNonWorkflowImages && workflowLoaded && workflowNull;
		const hideForFavorite = AppState.ui.hideNonFavoriteImages && favoriteLoaded && !favorite;
		const hideForSelectedWorkflow = AppState.workflow.activeWorkflowFilterKey !== 'all' && cardWorkflowKey !== AppState.workflow.activeWorkflowFilterKey;
		const shouldHide = hideForWorkflow || hideForFavorite || hideForSelectedWorkflow;

		if( imageContainer ) {
			imageContainer.style.display = shouldHide ? 'none' : '';
		}

		card.style.display = '';
	} );

	updateGenerationPreviewToggleButtons();
}


/** Get the nodes from workflow analysis data, ensuring it is in the expected format and returning an empty array if not
 * @param {Object} workflowAnalysisData structured workflow analysis data with nodes and links
 * @returns {Array} array of nodes from the workflow analysis data, or empty array if data is not in expected format
 */
export function toggleGenerationPreview( type ) {
	if( type === 'prompts' ) {
		AppState.ui.generationPromptsHidden = !AppState.ui.generationPromptsHidden;
		localStorage.setItem( 'generationPromptsHidden', AppState.ui.generationPromptsHidden ? 'true' : 'false' );
	} else if( type === 'non-workflow' ) {
		AppState.ui.hideNonWorkflowImages = !AppState.ui.hideNonWorkflowImages;
		localStorage.setItem( 'hideNonWorkflowImages', AppState.ui.hideNonWorkflowImages ? 'true' : 'false' );
		applyImageCardFilters();
		return;
	} else if( type === 'non-favorites' ) {
		AppState.ui.hideNonFavoriteImages = !AppState.ui.hideNonFavoriteImages;
		localStorage.setItem( 'hideNonFavoriteImages', AppState.ui.hideNonFavoriteImages ? 'true' : 'false' );
		applyImageCardFilters();
		return;
	} else {
		return;
	}

	applyGenerationPreviewVisibility();
}
/** Get the nodes from workflow analysis data, ensuring it is in the expected format and returning an empty array if not
 * @param {Object} workflowAnalysisData structured workflow analysis data with nodes and links
 * @returns {Array} array of nodes from the workflow analysis data, or empty array if data is not in expected format
 */
export function applyGenerationPreviewVisibility() {
	document.querySelectorAll( '.generation-prompt-preview' ).forEach( textarea => {
		textarea.style.display = AppState.ui.generationPromptsHidden ? 'none' : '';
	} );

	updateGenerationPreviewToggleButtons();
	applyImageCardFilters();
}


/** Build a filter key for workflow filtering based on the workflow hash, normalizing it to ensure consistent matching
 * @param {string} workflowHash raw workflow hash to build filter key from
 * @returns {string} normalized filter key for workflow filtering
 */
export function buildWorkflowFilterKey( workflowHash ) {
	const hash = workflowHash === null || workflowHash === undefined ? '' : String( workflowHash ).trim();
	return hash;
}


/** Get the nodes from workflow analysis data, ensuring it is in the expected format and returning an empty array if not
 * @param {Object} workflowAnalysisData structured workflow analysis data with nodes and links
 * @returns {Array} array of nodes from the workflow analysis data, or empty array if data is not in expected format
 */
export function updateGenerationPreviewToggleButtons() {
	const promptsBtn = document.getElementById( 'generationTogglePromptsBtn' );
	const nonWorkflowBtn = document.getElementById( 'generationToggleNonWorkflowBtn' );
	const nonFavoritesBtn = document.getElementById( 'generationToggleNonFavoritesBtn' );

	if( promptsBtn ) {
		promptsBtn.textContent = AppState.ui.generationPromptsHidden ? 'Show Prompts' : 'Hide Prompts';
	}

	if( nonWorkflowBtn ) {
		nonWorkflowBtn.textContent = AppState.ui.hideNonWorkflowImages ? 'Show Non-Workflow' : 'Hide Non-Workflow';
	}

	if( nonFavoritesBtn ) {
		nonFavoritesBtn.textContent = AppState.ui.hideNonFavoriteImages ? 'Show Non-Favorites' : 'Hide Non-Favorites';
	}
}