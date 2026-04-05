import { AppState } from './app-context.js';

export function setWorkflowAnalysisSectionVisible( isVisible ) {
	AppState.workflow.workflowAnalysisSectionVisible = isVisible === true;

	if( !AppState.workflow.workflowAnalysisSectionVisible && AppState.workflow.workflowVisibilityWaiters.length > 0 ) {
		const waiters = AppState.workflow.workflowVisibilityWaiters.slice();
		AppState.workflow.workflowVisibilityWaiters = [];
		waiters.forEach( resolve => resolve() );
	}
}

export function waitForWorkflowSectionToBeHidden() {
	if( !AppState.workflow.workflowAnalysisSectionVisible ) {
		return Promise.resolve();
	}

	return new Promise( resolve => {
		AppState.workflow.workflowVisibilityWaiters.push( resolve );
	} );
}

export function setupWorkflowAnalysisVisibilityObserver() {
	if( AppState.workflow.workflowVisibilityObserver ) {
		AppState.workflow.workflowVisibilityObserver.disconnect();
		AppState.workflow.workflowVisibilityObserver = null;
	}

	const section = document.getElementById( 'workflowAnalysisSection' );
	if( !section ) {
		setWorkflowAnalysisSectionVisible( false );
		return;
	}

	AppState.workflow.workflowVisibilityObserver = new IntersectionObserver( ( entries ) => {
		const entry = entries[0];
		if( !entry ) {
			setWorkflowAnalysisSectionVisible( false );
			return;
		}

		const isVisible = entry.isIntersecting && section.style.display !== 'none';
		setWorkflowAnalysisSectionVisible( isVisible );
	}, {
		root: null,
		threshold: 0.05
	} );

	AppState.workflow.workflowVisibilityObserver.observe( section );
}

export function updateGenerationPreviewToggleButtons() {
	const paramsBtn = document.getElementById( 'generationToggleParamsBtn' );
	const promptsBtn = document.getElementById( 'generationTogglePromptsBtn' );
	const nonWorkflowBtn = document.getElementById( 'generationToggleNonWorkflowBtn' );
	const nonFavoritesBtn = document.getElementById( 'generationToggleNonFavoritesBtn' );

	if( paramsBtn ) {
		paramsBtn.textContent = AppState.ui.generationParamsHidden ? 'Show Params' : 'Hide Params';
	}

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

export function buildWorkflowFilterKey( workflowId, workflowRevision ) {
	const id = workflowId === null || workflowId === undefined ? '' : String( workflowId ).trim();
	const revision = workflowRevision === null || workflowRevision === undefined ? '' : String( workflowRevision ).trim();
	if( id === '' || revision === '' ) {
		return '';
	}

	return `${id}::${revision}`;
}

export function applyWorkflowIdentityToCard( referenceElement, workflowId = '', workflowRevision = '' ) {
	if( !referenceElement ) {
		return;
	}

	const card = referenceElement.closest( '.image-card' );
	if( !card ) {
		return;
	}

	const id = workflowId === null || workflowId === undefined ? '' : String( workflowId ).trim();
	const revision = workflowRevision === null || workflowRevision === undefined ? '' : String( workflowRevision ).trim();
	card.dataset.workflowId = id;
	card.dataset.workflowRevision = revision;
}

export function renderWorkflowFilterButtons() {
	const container = document.getElementById( 'workflowFilterButtons' );
	if( !container ) {
		return;
	}

	const options = [ { key: 'all', workflowId: 'all', workflowRevision: '' }, ...AppState.workflow.workflowFilterOptions ];
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
			btn.textContent = `${option.workflowId} (v${option.workflowRevision})`;
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
		const response = await fetch( 'api/get_version_workflows.php', {
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
					const workflowId = row && row.workflowId !== undefined && row.workflowId !== null
						? String( row.workflowId ).trim()
						: '';
					const workflowRevision = row && row.workflowRevision !== undefined && row.workflowRevision !== null
						? String( row.workflowRevision ).trim()
						: '';
					const key = buildWorkflowFilterKey( workflowId, workflowRevision );
					if( key === '' ) {
						return null;
					}
					return { key, workflowId, workflowRevision };
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

export function applyImageCardFilters() {
	document.querySelectorAll( '.image-card' ).forEach( card => {
		const favoriteLoaded = card.dataset.favoriteLoaded === '1';
		const workflowLoaded = card.dataset.workflowLoaded === '1';
		const favorite = card.dataset.favorite === '1';
		const workflowNull = card.dataset.workflowNull === '1';
		const cardWorkflowKey = buildWorkflowFilterKey( card.dataset.workflowId || '', card.dataset.workflowRevision || '' );

		const hideForWorkflow = AppState.ui.hideNonWorkflowImages && workflowLoaded && workflowNull;
		const hideForFavorite = AppState.ui.hideNonFavoriteImages && favoriteLoaded && !favorite;
		const hideForSelectedWorkflow = AppState.workflow.activeWorkflowFilterKey !== 'all' && cardWorkflowKey !== AppState.workflow.activeWorkflowFilterKey;

		card.style.display = hideForWorkflow || hideForFavorite || hideForSelectedWorkflow ? 'none' : 'inline-flex';
	} );

	updateGenerationPreviewToggleButtons();
}

export function applyGenerationPreviewVisibility() {
	document.querySelectorAll( '.generation-params-preview' ).forEach( textarea => {
		textarea.style.display = AppState.ui.generationParamsHidden ? 'none' : '';
	} );

	document.querySelectorAll( '.generation-prompt-preview' ).forEach( textarea => {
		textarea.style.display = AppState.ui.generationPromptsHidden ? 'none' : '';
	} );

	updateGenerationPreviewToggleButtons();
	applyImageCardFilters();
}

export function toggleGenerationPreview( type ) {
	if( type === 'params' ) {
		AppState.ui.generationParamsHidden = !AppState.ui.generationParamsHidden;
		localStorage.setItem( 'generationParamsHidden', AppState.ui.generationParamsHidden ? 'true' : 'false' );
	} else if( type === 'prompts' ) {
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
