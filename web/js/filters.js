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


/** Count the number of unique image IDs in the DOM that have a given workflow hash key
 * @param {string} filterKey workflow hash key to match against card.dataset.workflowHash
 * @returns {number} count of unique image IDs matching the key
 */
function countUniqueImageIdsForHash( filterKey ) {
	const seen = new Set();
	document.querySelectorAll( '.image-card' ).forEach( card => {
		const cardKey = buildWorkflowFilterKey( card.dataset.workflowHash || '' );
		if( cardKey === filterKey ) {
			const imageId = card.querySelector( '[data-image-id]' )?.dataset.imageId;
			if( imageId ) {
				seen.add( imageId );
			}
		}
	} );
	return seen.size;
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
			const domCount = countUniqueImageIdsForHash( option.key );
			const displayCount = domCount > 0 ? domCount : option.imageCount;
			btn.textContent = displayCount > 0 ? `${shortHash} (${displayCount})` : shortHash;
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
	const countsByKey = new Map(); // visible image IDs per workflow hash (ignoring hash filter)

	document.querySelectorAll( '.image-card' ).forEach( card => {
		const imageContainer = card.closest( '.image-container' );
		const dismissed         = card.dataset.dismissed         === '1';
		const favoriteLoaded    = card.dataset.favoriteLoaded    === '1';
		const workflowLoaded    = card.dataset.workflowLoaded    === '1';
		const favorite          = card.dataset.favorite          === '1';
		const workflowNull      = card.dataset.workflowNull      === '1';
		const workflowPresent   = card.dataset.workflowPresent   === '1';
		const parametersPresent = card.dataset.parametersPresent === '1';
		const cardWorkflowKey   = buildWorkflowFilterKey( card.dataset.workflowHash || '' );

		const { showWorkflow, showParameters, showNoData } = AppState.ui.workflowTypeFilter;
		const hideForWorkflow = workflowLoaded && (
			( parametersPresent                             && !showParameters ) ||
			( !parametersPresent && workflowPresent         && !showWorkflow   ) ||
			( !parametersPresent && !workflowPresent && workflowNull && !showNoData )
		);
		const hideForFavorite = AppState.ui.favoriteFilter === 'favorites' && favoriteLoaded && !favorite;
		const hideDismissed = AppState.ui.favoriteFilter !== 'show-hidden' && dismissed;
		const hideForSelectedWorkflow = AppState.workflow.activeWorkflowFilterKey !== 'all' && cardWorkflowKey !== AppState.workflow.activeWorkflowFilterKey;
		const shouldHide = hideDismissed || hideForWorkflow || hideForFavorite || hideForSelectedWorkflow;

		if( imageContainer ) {
			imageContainer.style.display = shouldHide ? 'none' : '';
		}

		card.style.display = '';

		// Accumulate count for this hash bucket (type + favorite filters only, not hash filter)
		if( !hideDismissed && !hideForWorkflow && !hideForFavorite ) {
			const imageId = card.querySelector( '[data-image-id]' )?.dataset.imageId;
			if( imageId ) {
				if( !countsByKey.has( cardWorkflowKey ) ) countsByKey.set( cardWorkflowKey, new Set() );
				countsByKey.get( cardWorkflowKey ).add( imageId );
			}
		}
	} );

	updateWorkflowFilterButtonCounts( countsByKey );
	updateImageSectionCounts();
	updateGenerationPreviewToggleButtons();
}

/** Update carousel/gallery status labels to show visible/total counts after filters are applied */
function updateImageSectionCounts() {
	for( const [containerId, statusId] of [['carouselContainer', 'carouselStatus'], ['galleryContainer', 'galleryStatus']] ) {
		const container = document.getElementById( containerId );
		const statusEl  = document.getElementById( statusId );
		if( !container || !statusEl || container.dataset.loading !== 'false' ) continue;
		const totalLabel = container.dataset.total;
		if( !totalLabel ) continue;
		let visible = 0;
		container.querySelectorAll( '.image-container' ).forEach( el => {
			if( el.style.display !== 'none' ) visible++;
		} );
		statusEl.textContent = `(${visible}/${totalLabel})`;
	}
}

/** Update workflow filter button labels and visibility to reflect currently visible image counts
 * @param {Map<string, Set<string>>} countsByKey map of workflow hash key to set of visible image IDs
 */
function updateWorkflowFilterButtonCounts( countsByKey ) {
	const container = document.getElementById( 'workflowFilterButtons' );
	if( !container ) return;

	container.querySelectorAll( 'button[data-filter-key]' ).forEach( btn => {
		const key = btn.dataset.filterKey;
		if( key === 'all' ) return;

		const option = AppState.workflow.workflowFilterOptions.find( o => o.key === key );
		if( !option ) return;

		const visibleCount = countsByKey.has( key ) ? countsByKey.get( key ).size : 0;
		const shortHash = option.workflowHash.length > 12 ? `${option.workflowHash.slice( 0, 12 )}...` : option.workflowHash;
		btn.textContent = visibleCount > 0 ? `${shortHash} (${visibleCount})` : shortHash;
		btn.style.display = visibleCount > 0 ? '' : 'none';
	} );
}




export function setWorkflowTypeFilter( key, checked ) {
	if( !( key in AppState.ui.workflowTypeFilter ) ) return;
	AppState.ui.workflowTypeFilter[ key ] = checked;
	localStorage.setItem( key, checked ? 'true' : 'false' );
	applyImageCardFilters();
}

export function setFavoriteFilter( value ) {
	const valid = ['normal', 'favorites', 'show-hidden'];
	AppState.ui.favoriteFilter = valid.includes( value ) ? value : 'normal';
	localStorage.setItem( 'favoriteFilter', AppState.ui.favoriteFilter );
	applyImageCardFilters();
}
/** Get the nodes from workflow analysis data, ensuring it is in the expected format and returning an empty array if not
 * @param {Object} workflowAnalysisData structured workflow analysis data with nodes and links
 * @returns {Array} array of nodes from the workflow analysis data, or empty array if data is not in expected format
 */
export function buildWorkflowFilterKey( workflowHash ) {
	const hash = workflowHash === null || workflowHash === undefined ? '' : String( workflowHash ).trim();
	return hash;
}


export function updateGenerationPreviewToggleButtons() {
	const { showWorkflow, showParameters, showNoData } = AppState.ui.workflowTypeFilter;

	const workflowCheckbox    = document.getElementById( 'showWorkflowFilter' );
	const parametersCheckbox  = document.getElementById( 'showParametersFilter' );
	const noDataCheckbox      = document.getElementById( 'showNoDataFilter' );
	if( workflowCheckbox   && workflowCheckbox.checked   !== showWorkflow   ) workflowCheckbox.checked   = showWorkflow;
	if( parametersCheckbox && parametersCheckbox.checked !== showParameters ) parametersCheckbox.checked = showParameters;
	if( noDataCheckbox     && noDataCheckbox.checked     !== showNoData     ) noDataCheckbox.checked     = showNoData;

	const favoriteFilterSelect = document.getElementById( 'generationFavoriteFilter' );
	if( favoriteFilterSelect && favoriteFilterSelect.value !== AppState.ui.favoriteFilter ) {
		favoriteFilterSelect.value = AppState.ui.favoriteFilter;
	}
}