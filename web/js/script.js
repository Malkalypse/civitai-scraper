// Define global state variables
let currentFilename         = null;       // current filename for model sync
let currentVersionId        = null;       // current version ID for model sync
let currentSelectedVersion  = null;       // full selected version data for Add to Database
let currentModelIdForDb     = null;       // model ID for Add to Database
let currentBaseModel        = null;       // base model (folder) for rename operations
let currentOriginalFilename = null;       // original download filename from DB (authoritative)
let currentModelExistsInDb  = false;      // whether selected model/version exists in DB
let activeTags              = new Set();  // currently selected tags
let currentSettingsSets     = [];         // all settings rows for current version (by set_id)
let currentSamplerOptions   = [];         // all available sampler options [{id,name}]
let currentSchedulerOptions = [];         // all available scheduler options [{id,name}]
let currentSettingsShowAll  = {};         // per-set show-all state (default false)
let currentImageLoadToken   = 0;          // monotonic token to cancel stale async image loads
let currentModelJsonData    = null;       // latest loaded raw JSON data for current model
let copyAllTextCache        = new Map();  // imageId -> { promptText, paramsText, copyAllText }
let copyAllTextPending      = new Map();  // imageId -> in-flight promise
let copyAllTextQueue        = [];         // queued textarea hydration jobs
let copyAllActiveCount      = 0;          // active generation-data requests
let generationParamsHidden  = localStorage.getItem( 'generationParamsHidden' ) === 'true';   // hide/show generation params preview textareas
let generationPromptsHidden = localStorage.getItem( 'generationPromptsHidden' ) === 'true';  // hide/show generation prompt preview textareas
let hideNonWorkflowImages   = localStorage.getItem( 'hideNonWorkflowImages' ) === 'true';    // hide cards explicitly marked as workflow missing
let hideNonFavoriteImages   = localStorage.getItem( 'hideNonFavoriteImages' ) === 'true';    // hide cards explicitly marked as not favorite
let workflowFilterOptions   = [];         // version workflow filters [{ key, workflowId, workflowRevision }]
let activeWorkflowFilterKey = 'all';      // selected workflow filter key ('all' or workflowId::workflowRevision)
let workflowLinksHidden     = false;      // hide/show workflow input/output sections
let workflowTextHidden      = false;      // hide/show masked workflow text/string values
let workflowAnalysisSectionVisible = false; // whether workflow analysis section is currently visible in viewport
let workflowVisibilityObserver = null;      // observer for workflow analysis section visibility
let workflowVisibilityWaiters = [];         // pending resolvers waiting for section to become hidden
const COPY_ALL_MAX_CONCURRENCY = 4;


function setWorkflowAnalysisSectionVisible( isVisible ) {
	workflowAnalysisSectionVisible = isVisible === true;

	if( !workflowAnalysisSectionVisible && workflowVisibilityWaiters.length > 0 ) {
		const waiters = workflowVisibilityWaiters.slice();
		workflowVisibilityWaiters = [];
		waiters.forEach( resolve => resolve() );
	}
}


function waitForWorkflowSectionToBeHidden() {
	if( !workflowAnalysisSectionVisible ) {
		return Promise.resolve();
	}

	return new Promise( resolve => {
		workflowVisibilityWaiters.push( resolve );
	} );
}


function setupWorkflowAnalysisVisibilityObserver() {
	if( workflowVisibilityObserver ) {
		workflowVisibilityObserver.disconnect();
		workflowVisibilityObserver = null;
	}

	const section = document.getElementById( 'workflowAnalysisSection' );
	if( !section ) {
		setWorkflowAnalysisSectionVisible( false );
		return;
	}

	workflowVisibilityObserver = new IntersectionObserver( ( entries ) => {
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

	workflowVisibilityObserver.observe( section );
}


function updateGenerationPreviewToggleButtons() {
	const paramsBtn = document.getElementById( 'generationToggleParamsBtn' );
	const promptsBtn = document.getElementById( 'generationTogglePromptsBtn' );
	const nonWorkflowBtn = document.getElementById( 'generationToggleNonWorkflowBtn' );
	const nonFavoritesBtn = document.getElementById( 'generationToggleNonFavoritesBtn' );

	if( paramsBtn ) {
		paramsBtn.textContent = generationParamsHidden ? 'Show Params' : 'Hide Params';
	}

	if( promptsBtn ) {
		promptsBtn.textContent = generationPromptsHidden ? 'Show Prompts' : 'Hide Prompts';
	}

	if( nonWorkflowBtn ) {
		nonWorkflowBtn.textContent = hideNonWorkflowImages ? 'Show Non-Workflow' : 'Hide Non-Workflow';
	}

	if( nonFavoritesBtn ) {
		nonFavoritesBtn.textContent = hideNonFavoriteImages ? 'Show Non-Favorites' : 'Hide Non-Favorites';
	}
}


function buildWorkflowFilterKey( workflowId, workflowRevision ) {
	const id = workflowId === null || workflowId === undefined ? '' : String( workflowId ).trim();
	const revision = workflowRevision === null || workflowRevision === undefined ? '' : String( workflowRevision ).trim();
	if( id === '' || revision === '' ) {
		return '';
	}

	return `${id}::${revision}`;
}


function applyWorkflowIdentityToCard( referenceElement, workflowId = '', workflowRevision = '' ) {
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


function renderWorkflowFilterButtons() {
	const container = document.getElementById( 'workflowFilterButtons' );
	if( !container ) {
		return;
	}

	const options = [ { key: 'all', workflowId: 'all', workflowRevision: '' }, ...workflowFilterOptions ];
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

		const isActive = option.key === activeWorkflowFilterKey;
		btn.style.background = isActive ? '#419f3f' : '#2a2a3e';
		btn.style.color = '#fff';

		btn.addEventListener( 'click', () => {
			activeWorkflowFilterKey = option.key;
			renderWorkflowFilterButtons();
			applyImageCardFilters();
		} );

		container.appendChild( btn );
	} );
}


async function loadVersionWorkflowFilters( versionId ) {
	workflowFilterOptions = [];
	activeWorkflowFilterKey = 'all';

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

		workflowFilterOptions = Array.isArray( result.workflows )
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
			status.textContent = `(${workflowFilterOptions.length})`;
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


function applyImageCardFilters() {
	document.querySelectorAll( '.image-card' ).forEach( card => {
		const favoriteLoaded = card.dataset.favoriteLoaded === '1';
		const workflowLoaded = card.dataset.workflowLoaded === '1';
		const favorite = card.dataset.favorite === '1';
		const workflowNull = card.dataset.workflowNull === '1';
		const cardWorkflowKey = buildWorkflowFilterKey( card.dataset.workflowId || '', card.dataset.workflowRevision || '' );
		const slot = card.parentElement;

		const hideForWorkflow = hideNonWorkflowImages && workflowLoaded && workflowNull;
		const hideForFavorite = hideNonFavoriteImages && favoriteLoaded && !favorite;
		const hideForSelectedWorkflow = activeWorkflowFilterKey !== 'all' && cardWorkflowKey !== activeWorkflowFilterKey;
		const shouldHide = hideForWorkflow || hideForFavorite || hideForSelectedWorkflow;

		card.style.display = shouldHide ? 'none' : 'inline-flex';
		if( slot ) {
			slot.style.display = shouldHide ? 'none' : '';
		}
	} );

	updateGenerationPreviewToggleButtons();
}


function applyGenerationPreviewVisibility() {
	document.querySelectorAll( '.generation-params-preview' ).forEach( textarea => {
		textarea.style.display = generationParamsHidden ? 'none' : '';
	} );

	document.querySelectorAll( '.generation-prompt-preview' ).forEach( textarea => {
		textarea.style.display = generationPromptsHidden ? 'none' : '';
	} );

	updateGenerationPreviewToggleButtons();
	applyImageCardFilters();
}


function toggleGenerationPreview( type ) {
	if( type === 'params' ) {
		generationParamsHidden = !generationParamsHidden;
		localStorage.setItem( 'generationParamsHidden', generationParamsHidden ? 'true' : 'false' );
	} else if( type === 'prompts' ) {
		generationPromptsHidden = !generationPromptsHidden;
		localStorage.setItem( 'generationPromptsHidden', generationPromptsHidden ? 'true' : 'false' );
	} else if( type === 'non-workflow' ) {
		hideNonWorkflowImages = !hideNonWorkflowImages;
		localStorage.setItem( 'hideNonWorkflowImages', hideNonWorkflowImages ? 'true' : 'false' );
		applyImageCardFilters();
		return;
	} else if( type === 'non-favorites' ) {
		hideNonFavoriteImages = !hideNonFavoriteImages;
		localStorage.setItem( 'hideNonFavoriteImages', hideNonFavoriteImages ? 'true' : 'false' );
		applyImageCardFilters();
		return;
	} else {
		return;
	}

	applyGenerationPreviewVisibility();
}


/** Get all currently open folders
 * @param {string} containerId - Sidebar container ID
 * @returns {Set<string>} Set of open folder names
 */
function getOpenFolders( containerId ) {
	const openFolders = new Set();
	const container = document.getElementById( containerId );

	if( !container ) {
		return openFolders;
	}

	container.querySelectorAll( '.folder-item' ).forEach( ( folderItem ) => {
		const fileList = folderItem.querySelector( '.file-list' ); // get file list element

		if( fileList && fileList.style.display === 'block' ) { // check if folder is open
			const folderName = folderItem.querySelector( '.folder-name' ); // get folder name element

			// Store folder name without triangle character
			if( folderName ) {
				openFolders.add( folderName.textContent.trim().substring( 2 ) );
			}
		}
	} );

	return openFolders;
}


/** Build HTML for folders and files
 * @param {Array}		foldersData				- Array of folder objects with 'folder' and 'files' properties
 * @param {Set}			openFolders				- Set of folder names that should be open
 * @param {?string}	itemClickHandler	- Optional global click handler name for file items
 * @returns	{string} HTML string representing the folder structure
 */
function buildFoldersHTML( foldersData, openFolders = new Set(), itemClickHandler = 'loadModelFromFile' ) {
	let html = '';

	foldersData.forEach( folder => {

		// Set display style and triangle rotation
		const isOpen            = openFolders.has( folder.folder );
		const displayStyle      = isOpen ? 'block' : 'none';
		const triangleRotation  = isOpen ? ' style="transform: rotate(90deg);"' : '';

		// Create folder HTML
		html += `
			<div class="folder-item">
				<div class="folder-name" onclick="toggleFolder(this)"><span class="folder-triangle"${triangleRotation}>▶</span> ${escapeHtml( folder.folder )}</div>
				<ul class="file-list" style="display: ${displayStyle};">`;

		// Create file items
		folder.files.forEach( file => {
			const modelAttr   = file.modelId ? ` data-model="${escapeHtml( file.modelId )}"` : '';
			const versionAttr = file.versionId ? ` data-version="${escapeHtml( file.versionId )}"` : '';
			const folderAttr  = ` data-folder="${escapeHtml( folder.folder )}"`;
			const clickAttr   = itemClickHandler ? ` onclick="${itemClickHandler}(this)"` : '';
			const missingClass = file.exists === false ? ' missing-file' : '';
			html += `<li class="file-item${missingClass}"${modelAttr}${versionAttr}${folderAttr}${clickAttr}>${escapeHtml( file.name )}</li>`;
		} );

		html += `</ul></div>`;
	} );

	return html;
}


/** Load sidebar data and render folder/file structure
 * @param {object}	options										- Load options
 * @param {string}	options.url								- API URL to fetch data from
 * @param {string}	options.containerId				- Sidebar container ID
 * @param {boolean}	options.preserveState			- Whether to preserve open/closed folder states
 * @param {string}	options.errorLabel				- Label used in error messages
 * @param {?string}	options.itemClickHandler	- Optional global click handler name for file items
 * @return {Promise<void>}
 */
async function loadSidebarLibrary( { url, containerId, preserveState = false, errorLabel = 'items', itemClickHandler = 'loadModelFromFile' } ) {
	const container = document.getElementById( containerId ); // get container element

	if( !container ) return; // container not found, cannot load library

	try {
		const openFolders = preserveState ? getOpenFolders( containerId ) : new Set();
		const response  = await fetch( url );
		const result    = await response.json();

		if( result.error ) {
			container.innerHTML = `<div class="error" style="font-size: 12px;">${escapeHtml( result.error )}</div>`;
			return;
		}

		if( result.data ) {
			const html = buildFoldersHTML( result.data, openFolders, itemClickHandler );
			container.innerHTML = html;
		}
	} catch( error ) {
		container.innerHTML = `<div class="error" style="font-size: 12px;">Error loading ${errorLabel}</div>`;
	}
}


/** Load checkpoints and render sidebar
 * @param {boolean} preserveState - Whether to preserve open/closed folder states
 * @return {Promise<void>}
 */
async function loadCheckpoints( preserveState = false ) {
	await loadSidebarLibrary( {
		url: 'api/get_models.php?type=checkpoint',
		containerId: 'checkpointsList',
		preserveState,
		errorLabel: 'checkpoints',
		itemClickHandler: 'loadModelFromFile'
	} );
}


/** Load LoRAs and render sidebar
 * @param {boolean} preserveState - Whether to preserve open/closed folder states
 * @return {Promise<void>}
 */
async function loadLoras( preserveState = false ) {
	await loadSidebarLibrary( {
		url: 'api/get_models.php?type=lora',
		containerId: 'lorasList',
		preserveState,
		errorLabel: 'loras',
		itemClickHandler: 'loadModelFromFile'
	} );
}


/** Toggle folder open/close
 * @param {HTMLElement} element - The folder name element that was clicked
 */
function toggleFolder( element ) {
	const fileList = element.nextElementSibling;
	const triangle = element.querySelector( '.folder-triangle' );

	if( fileList.style.display === 'none' ) {
		fileList.style.display    = 'block';
		triangle.style.transform  = 'rotate(90deg)';
	} else {
		fileList.style.display    = 'none';
		triangle.style.transform  = 'rotate(0deg)';
	}
}


/** Format min/max range for display
 * @param		{number|string|null} minVal - Minimum value
 * @param		{number|string|null} maxVal - Maximum value
 * @return	{string} Formatted range string
 */
function formatMinMaxRange( minVal, maxVal ) {

	// If either value is null, undefined, or empty string, return empty string 
	if( minVal == null || maxVal == null || minVal === '' || maxVal === '' ) {
		return '';
	}

	// Convert to numbers
	const min = Number( minVal );
	const max = Number( maxVal );

	// If either value is not a valid number, return empty string
	if( Number.isNaN( min ) || Number.isNaN( max ) ) {
		return '';
	}

	// If min and max are the same, just return one value
	if( min === max ) {
		return String( min );
	}

	return `${min} to ${max}`;
}


/** Parse numeric range input from a string
 * @param {string}			value									- The input string to parse
 * @param {Object}			options								- Parsing options
 * @param {boolean}			options.allowDecimal	- Whether to allow decimal numbers
 * @param {number|null}	options.minValue			- Minimum allowed value
 * @param {number|null}	options.maxValue			- Maximum allowed value
 * @return {Object|null} Parsed range or null if invalid
 */
function parseRange( value, { allowDecimal = true, minValue = null, maxValue = null } = {} ) {
	const text = String( value || '' ).trim();
	if( text === '' ) {
		return { min: null, max: null, display: '' };
	}

	const matches = text.match( /[-+]?\d*\.?\d+/g );
	if( !matches || matches.length === 0 ) {
		return null;
	}

	const numbers = matches
		.map( token => parseFloat( token ) )
		.filter( number => !Number.isNaN( number ) );

	if( numbers.length === 0 ) {
		return null;
	}

	if( !allowDecimal ) {
		const hasDecimal = numbers.some( number => !Number.isInteger( number ) );
		if( hasDecimal ) {
			return { notInteger: true };
		}
	}

	const min = Math.min( ...numbers );
	const max = Math.max( ...numbers );

	if( ( minValue !== null && min < minValue ) || ( maxValue !== null && max > maxValue ) ) {
		return { outOfRange: true };
	}

	return {
		min,
		max,
		display: formatMinMaxRange( min, max )
	};
}


/** Parse cfg range input
 * @param {string} value - The input string to parse
 * @return {Object|null} Parsed cfg range or null if invalid
 */
function parseCfg( value ) {
	const parsed = parseRange( value, {
		allowDecimal:	true,
		minValue:			0,
		maxValue:			100
	} );

	if( !parsed || parsed.outOfRange || parsed.notInteger ) {
		return parsed;
	}

	return {
		cfgMin:		parsed.min,
		cfgMax:		parsed.max,
		display:	parsed.display
	};
}


/** Parse steps range input
 * @param {string} value - The input string to parse
 * @return {Object|null} Parsed steps range or null if invalid
 */
function parseSteps( value ) {
	const parsed = parseRange( value, {
		allowDecimal:	false,
		minValue:			1,
		maxValue:			10000
	} );

	if( !parsed || parsed.outOfRange || parsed.notInteger ) {
		return parsed;
	}

	return {
		stepsMin:	parsed.min,
		stepsMax:	parsed.max,
		display:	parsed.display
	};
}


/** Normalize settings rows from API into a consistent frontend shape
 * @param {Array} settingsSets - Raw settings rows from API
 * @param {boolean} ensureDefault - If true and no rows are present, provide set_id 1 placeholder
 * @return {Array} Normalized settings rows sorted by setId
 */
function normalizeSettingsSets( settingsSets, ensureDefault = false ) {
	const normalized = Array.isArray( settingsSets )
		? settingsSets.map( ( setRow ) => {
			const rawSetId = Number( setRow?.setId ?? setRow?.set_id ?? 1 );
			const setId = Number.isInteger( rawSetId ) && rawSetId > 0 ? rawSetId : 1;

			return {
				setId,
				name: typeof ( setRow?.name ) === 'string' ? setRow.name : '',
				cfgMin: setRow?.cfgMin ?? setRow?.guidance_min ?? null,
				cfgMax: setRow?.cfgMax ?? setRow?.guidance_max ?? null,
				stepsMin: setRow?.stepsMin ?? setRow?.steps_min ?? null,
				stepsMax: setRow?.stepsMax ?? setRow?.steps_max ?? null,
				clipSkip: setRow?.clipSkip ?? setRow?.clip_skip ?? null,
				samplerIds: Array.isArray( setRow?.samplerIds ) ? setRow.samplerIds.map( value => Number( value ) ).filter( value => Number.isInteger( value ) && value > 0 ) : [],
				samplerNames: Array.isArray( setRow?.samplerNames ) ? setRow.samplerNames.filter( value => typeof value === 'string' ) : [],
				schedulerIds: Array.isArray( setRow?.schedulerIds ) ? setRow.schedulerIds.map( value => Number( value ) ).filter( value => Number.isInteger( value ) && value > 0 ) : [],
				schedulerNames: Array.isArray( setRow?.schedulerNames ) ? setRow.schedulerNames.filter( value => typeof value === 'string' ) : [],
				positive: typeof ( setRow?.positive ) === 'string' ? setRow.positive : '',
				negative: typeof ( setRow?.negative ) === 'string' ? setRow.negative : ''
			};
		} )
		: [];

	normalized.sort( ( a, b ) => a.setId - b.setId );

	if( normalized.length === 0 && ensureDefault ) {
		return [ {
			setId: 1,
			name: '',
			cfgMin: null,
			cfgMax: null,
			stepsMin: null,
			stepsMax: null,
			clipSkip: null,
			samplerIds: [],
			samplerNames: [],
			schedulerIds: [],
			schedulerNames: [],
			positive: '',
			negative: ''
		} ];
	}

	return normalized;
}


/** Build HTML for all settings tables (one table per set_id)
 * @param {Array} settingsSets - Settings rows for a version
 * @param {boolean} ensureDefault - Ensure at least one default set exists
 * @return {string} HTML for all settings tables
 */
function buildSettingsTablesHtml( settingsSets, ensureDefault = true ) {
	const normalizedSets = normalizeSettingsSets( settingsSets, ensureDefault );
	const hasMultipleSets = normalizedSets.length > 1;

	return normalizedSets.map( ( settingsSet ) => {
		const setId = settingsSet.setId;
		const nameDisplay = typeof settingsSet.name === 'string' ? settingsSet.name.trim() : '';
		const headerText = nameDisplay !== '' ? nameDisplay : String( setId );
		const cfgDisplay = formatMinMaxRange( settingsSet.cfgMin, settingsSet.cfgMax );
		const stepsDisplay = formatMinMaxRange( settingsSet.stepsMin, settingsSet.stepsMax );
		const clipSkipDisplay = settingsSet.clipSkip === null ? '' : String( settingsSet.clipSkip );
		const samplerDisplay = ( Array.isArray( settingsSet.samplerNames ) ? settingsSet.samplerNames : [] ).filter( value => typeof value === 'string' && value.trim() !== '' ).join( ', ' );
		const schedulerDisplay = ( Array.isArray( settingsSet.schedulerNames ) ? settingsSet.schedulerNames : [] ).filter( value => typeof value === 'string' && value.trim() !== '' ).join( ', ' );
		const rowValues = [ samplerDisplay, schedulerDisplay, cfgDisplay, stepsDisplay, clipSkipDisplay, settingsSet.positive || '', settingsSet.negative || '' ];
		const hasAnyData = rowValues.some( value => String( value || '' ).trim() !== '' );
		const showAll = hasAnyData ? currentSettingsShowAll[setId] === true : true;

		const rowVisibilityStyle = ( value ) => {
			if( showAll ) {
				return '';
			}

			return String( value || '' ).trim() === '' ? ' style="display: none;"' : '';
		};

		return `
			<div class="settings-table-wrap" data-set-id="${setId}">
				${hasAnyData ? `<div style="display: flex; justify-content: flex-end; margin: 6px 0 2px 0; font-size: 11px; color: #adb5bd;">
					<label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
						<input type="checkbox" ${showAll ? 'checked' : ''} onchange="toggleSettingsShowAll(${setId}, this.checked)" style="width: 10px; height: 10px; margin: 0; vertical-align: middle;">
						<span>show all</span>
					</label>
				</div>` : ''}
			<table class="settings-table" data-set-id="${setId}">
				${hasMultipleSets ? `
				<thead>
					<tr>
						<th colspan="2" contenteditable="true" onblur="saveSettingsHeaderName(this, ${setId})" data-set-id="${setId}" data-original-name="${escapeHtml( nameDisplay )}" style="text-align: center; padding: 6px; border: 1px solid #373a40; background-color: #25262b; color: rgb(193, 194, 197); outline: none; cursor: text;">${escapeHtml( headerText )}</th>
					</tr>
				</thead>
				` : ''}
				<tbody>
				<tr${rowVisibilityStyle( samplerDisplay )}>
					<td>sampler(s)</td>
					<td class="editable-settings-value" onclick="openSettingsToolsSelect(this, 'sampler', ${setId})" data-set-id="${setId}" data-tool-type="sampler" style="outline: none; border-bottom: 1px dashed #666; cursor: pointer;">${escapeHtml( samplerDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( schedulerDisplay )}>
					<td>scheduler(s)</td>
					<td class="editable-settings-value" onclick="openSettingsToolsSelect(this, 'scheduler', ${setId})" data-set-id="${setId}" data-tool-type="scheduler" style="outline: none; border-bottom: 1px dashed #666; cursor: pointer;">${escapeHtml( schedulerDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( cfgDisplay )}>
					<td>cfg</td>
					<td class="editable-settings-value" contenteditable="true" onblur="saveSettingsField(this, 'cfg', ${setId})" data-set-id="${setId}" data-original="${escapeHtml( cfgDisplay )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( cfgDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( stepsDisplay )}>
					<td>steps</td>
					<td class="editable-settings-value" contenteditable="true" onblur="saveSettingsField(this, 'steps', ${setId})" data-set-id="${setId}" data-original="${escapeHtml( stepsDisplay )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( stepsDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( clipSkipDisplay )}>
					<td>clip_skip</td>
					<td class="editable-settings-value" contenteditable="true" onblur="saveSettingsField(this, 'clip_skip', ${setId})" data-set-id="${setId}" data-original="${escapeHtml( clipSkipDisplay )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( clipSkipDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( settingsSet.positive )}>
					<td>positive prompts</td>
					<td class="editable-settings-value" contenteditable="true" onblur="saveSettingsField(this, 'positive', ${setId})" data-set-id="${setId}" data-original="${escapeHtml( settingsSet.positive || '' )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text; white-space: pre-wrap;">${escapeHtml( settingsSet.positive || '' )}</td>
				</tr>
				<tr${rowVisibilityStyle( settingsSet.negative )}>
					<td>negative prompts</td>
					<td class="editable-settings-value" contenteditable="true" onblur="saveSettingsField(this, 'negative', ${setId})" data-set-id="${setId}" data-original="${escapeHtml( settingsSet.negative || '' )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text; white-space: pre-wrap;">${escapeHtml( settingsSet.negative || '' )}</td>
				</tr>
				</tbody>
			</table>
			</div>
		`;
	} ).join( '' );
}


/** Toggle show-all state for one settings table and re-render
 * @param {number} setId - Settings set id
 * @param {boolean} enabled - Whether to show all rows
 */
function toggleSettingsShowAll( setId, enabled ) {
	const numericSetId = Number( setId );
	if( !Number.isInteger( numericSetId ) || numericSetId <= 0 ) {
		return;
	}

	currentSettingsShowAll[numericSetId] = enabled === true;
	renderSettingsTables();
}


/** Upsert one settings set into currentSettingsSets, preserving existing fields when absent in partial updates
 * @param {Object} incomingSet - Partial or full settings set object
 */
function upsertCurrentSettingsSet( incomingSet ) {
	const normalizedIncoming = normalizeSettingsSets( [ incomingSet ], false )[0];
	if( !normalizedIncoming ) {
		return;
	}

	const existingIndex = currentSettingsSets.findIndex( setRow => setRow.setId === normalizedIncoming.setId );
	if( existingIndex >= 0 ) {
		currentSettingsSets[existingIndex] = {
			...currentSettingsSets[existingIndex],
			...normalizedIncoming
		};
	} else {
		currentSettingsSets.push( normalizedIncoming );
		currentSettingsSets.sort( ( a, b ) => a.setId - b.setId );
	}
}


/** Get settings set by setId
 * @param {number} setId - Settings set id
 * @return {?Object} Matching settings set or null
 */
function getSettingsSetById( setId ) {
	const numericSetId = Number( setId );
	if( !Number.isInteger( numericSetId ) || numericSetId <= 0 ) {
		return null;
	}

	return currentSettingsSets.find( setRow => setRow.setId === numericSetId ) || null;
}


/** Open sampler/scheduler multi-select dropdown in a settings table cell
 * @param {HTMLElement} cell - Cell element to replace with multi-select
 * @param {'sampler'|'scheduler'} type - Tool type
 * @param {number} setId - Settings set id
 */
function openSettingsToolsSelect( cell, type, setId ) {
	if( !cell || cell.dataset.editing === 'true' ) {
		return;
	}

	if( type !== 'sampler' && type !== 'scheduler' ) {
		return;
	}

	const numericSetId = Number( setId );
	if( !Number.isInteger( numericSetId ) || numericSetId <= 0 ) {
		return;
	}

	const options = type === 'sampler' ? currentSamplerOptions : currentSchedulerOptions;
	if( !Array.isArray( options ) || options.length === 0 ) {
		alert( `No ${type} options available.` );
		return;
	}

	const settingsSet = getSettingsSetById( numericSetId );
	const selectedIds = new Set(
		( type === 'sampler' ? settingsSet?.samplerIds : settingsSet?.schedulerIds )
			?.map( value => Number( value ) )
			.filter( value => Number.isInteger( value ) && value > 0 ) || []
	);

	const originalDisplay = cell.textContent || '';
	cell.dataset.editing = 'true';
	cell.dataset.originalDisplay = originalDisplay;
	cell.innerHTML = '';

	const select = document.createElement( 'select' );
	select.multiple = true;
	select.size = Math.min( Math.max( options.length, 4 ), 10 );
	select.style.width = '100%';
	select.style.minHeight = '90px';
	select.style.backgroundColor = '#2a2a2a';
	select.style.color = '#e0e0e0';
	select.style.border = '1px solid #4fc3f7';
	select.style.borderRadius = '4px';
	select.style.padding = '4px';

	options.forEach( option => {
		const optionId = Number( option?.id );
		if( !Number.isInteger( optionId ) || optionId <= 0 ) {
			return;
		}

		const optionEl = document.createElement( 'option' );
		optionEl.value = String( optionId );
		optionEl.textContent = option?.name ? String( option.name ) : String( optionId );
		if( selectedIds.has( optionId ) ) {
			optionEl.selected = true;
		}
		select.appendChild( optionEl );
	} );

	cell.appendChild( select );
	select.focus();

	let isHandled = false;
	const finalize = async ( shouldSave ) => {
		if( isHandled ) {
			return;
		}
		isHandled = true;

		if( !shouldSave ) {
			cell.textContent = originalDisplay;
			cell.dataset.editing = 'false';
			return;
		}

		const selectedValues = Array.from( select.selectedOptions )
			.map( optionEl => Number( optionEl.value ) )
			.filter( value => Number.isInteger( value ) && value > 0 );

		await saveSettingsToolsSelection( cell, type, numericSetId, selectedValues, originalDisplay );
	};

	select.addEventListener( 'blur', () => {
		setTimeout( () => {
			finalize( true );
		}, 0 );
	} );

	select.addEventListener( 'keydown', ( event ) => {
		if( event.key === 'Escape' ) {
			event.preventDefault();
			finalize( false );
		} else if( event.key === 'Enter' ) {
			event.preventDefault();
			finalize( true );
		}
	} );
}


/** Save selected sampler/scheduler IDs for a settings set and restore display text
 * @param {HTMLElement} cell - Target cell
 * @param {'sampler'|'scheduler'} type - Tool type
 * @param {number} setId - Settings set id
 * @param {number[]} selectedIds - Selected option IDs
 * @param {string} originalDisplay - Text to restore on error
 * @return {Promise<void>}
 */
async function saveSettingsToolsSelection( cell, type, setId, selectedIds, originalDisplay ) {
	if( !currentVersionId ) {
		alert( `Cannot update ${type}s: version is missing.` );
		cell.textContent = originalDisplay;
		cell.dataset.editing = 'false';
		return;
	}

	try {
		const response = await fetch( 'api/update_version_tools.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				versionId: currentVersionId,
				setId,
				type,
				ids: selectedIds
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		if( result.settingsSet ) {
			upsertCurrentSettingsSet( result.settingsSet );
		}

		const displayNames = Array.isArray( result.names )
			? result.names.filter( value => typeof value === 'string' && value.trim() !== '' )
			: [];
		cell.textContent = displayNames.join( ', ' );
		cell.dataset.editing = 'false';
	} catch( error ) {
		console.error( `Error updating ${type}s:`, error );
		alert( `Error updating ${type}s: ` + error.message );
		cell.textContent = originalDisplay;
		cell.dataset.editing = 'false';
	}
}


/** Save editable settings-table header as settings.name
 * Rule: if header text equals set_id, persist name as empty (NULL in DB)
 * @param {HTMLElement} element - Editable header element
 * @param {number} setId - Settings set id
 * @return {Promise<void>}
 */
async function saveSettingsHeaderName( element, setId ) {
	const parsedSetId = Number.isInteger( Number( setId ) ) && Number( setId ) > 0
		? Number( setId )
		: ( Number.isInteger( Number( element.getAttribute( 'data-set-id' ) ) ) && Number( element.getAttribute( 'data-set-id' ) ) > 0
			? Number( element.getAttribute( 'data-set-id' ) )
			: 1 );

	const fallbackLabel = String( parsedSetId );
	const originalName = element.getAttribute( 'data-original-name' ) || '';
	const originalDisplay = originalName !== '' ? originalName : fallbackLabel;
	const trimmedText = ( element.textContent || '' ).trim();
	const valueToStore = trimmedText === fallbackLabel ? '' : trimmedText;

	if( valueToStore === originalName ) {
		element.textContent = valueToStore !== '' ? valueToStore : fallbackLabel;
		return;
	}

	if( !currentVersionId ) {
		alert( 'Cannot update settings name: version is missing.' );
		element.textContent = originalDisplay;
		return;
	}

	if( valueToStore.length > 64 ) {
		alert( 'name must be 64 characters or fewer.' );
		element.textContent = originalDisplay;
		return;
	}

	try {
		const response = await fetch( 'api/update_settings.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				versionId: currentVersionId,
				setId: parsedSetId,
				field: 'name',
				value: valueToStore
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		const updatedSet = result.settingsSet
			? result.settingsSet
			: null;

		if( updatedSet ) {
			upsertCurrentSettingsSet( updatedSet );
		}

		const savedName = typeof ( result.name ) === 'string' ? result.name.trim() : '';
		element.setAttribute( 'data-original-name', savedName );
		element.textContent = savedName !== '' ? savedName : fallbackLabel;
	} catch( error ) {
		console.error( 'Error updating settings name:', error );
		alert( 'Error updating settings name: ' + error.message );
		element.textContent = originalDisplay;
	}
}


/** Re-render the settings tables container using current settings state
 */
function renderSettingsTables() {
	const container = document.getElementById( 'settingsTablesContainer' );
	if( !container ) {
		return;
	}

	container.innerHTML = buildSettingsTablesHtml( currentSettingsSets, true );
}


/** Create a new settings set for the current version and render it
 * @return {Promise<void>}
 */
async function addSettingsSet() {
	if( !currentVersionId ) {
		alert( 'Cannot add settings set: version is missing.' );
		return;
	}

	const addBtn = document.getElementById( 'addSettingsSetBtn' );
	if( addBtn ) {
		addBtn.disabled = true;
		addBtn.textContent = 'Adding...';
	}

	try {
		const response = await fetch( 'api/create_settings_set.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				versionId: currentVersionId
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		const createdSet = result.settingsSet
			? result.settingsSet
			: null;

		if( createdSet ) {
			upsertCurrentSettingsSet( createdSet );
		}

		renderSettingsTables();
	} catch( error ) {
		console.error( 'Error creating settings set:', error );
		alert( 'Error creating settings set: ' + error.message );
	} finally {
		if( addBtn ) {
			addBtn.disabled = false;
			addBtn.textContent = 'Add set';
		}
	}
}

/*
	// Simple heuristic to check if a filename is likely a valid download file (contains a dot and isn't a common non-filename term)
	function isLikelyDownloadFilename( value ) {
		console.log( `Checking if "${value}" is a likely download filename...` );

		if( typeof value !== 'string' ) {
			return false;
		}

		const filename = value.trim();
		if( !filename ) {
			return false;
		}

		const lower = filename.toLowerCase();
		if( lower === 'login' || lower === 'signin' || lower === 'authorize' ) {
			return false;
		}

		return filename.includes( '.' );
	}
	// Choose the most appropriate download filename from an array of files based on heuristics
	function chooseDownloadFilenameFromFiles( files ) {
		console.log( 'Choosing download filename from files:', files );

		if( !Array.isArray( files ) || files.length === 0 ) {
			return '';
		}

		const primaryFile = files.find( file => file?.primary && file?.name );
		if( primaryFile ) {
			return primaryFile.name;
		}

		const modelFile = files.find( file => file?.type === 'Model' && file?.name );
		if( modelFile ) {
			return modelFile.name;
		}

		const safetensorsFile = files.find( file => file?.name && file.name.endsWith( '.safetensors' ) );
		if( safetensorsFile ) {
			return safetensorsFile.name;
		}

		const firstNamedFile = files.find( file => file?.name && isLikelyDownloadFilename( file.name ) );
		return firstNamedFile ? firstNamedFile.name : '';
	}
*/

/** Fetch the canonical download filename for a given version ID, with optional fallback to files array if API call fails or returns invalid data
 * @param {number} versionId - The model version ID to fetch the filename for
 * @return {Promise<string>} The resolved filename or empty string if it cannot be determined
 */
async function fetchOriginalFilename( versionId /*, fallbackFiles = []*/ ) {
	console.log( `Fetching canonical download filename for version ${versionId}` /*with fallback files:`, fallbackFiles*/ );

	/*
		const fallbackFilename = chooseDownloadFilenameFromFiles( fallbackFiles );
		if( !versionId ) return fallbackFilename;
	*/

	try {
		const response = await fetch( 'api/get_version_filename.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { versionId } )
		} );

		const result = await response.json();
		if( result?.success && result?.filename /*&& isLikelyDownloadFilename( result.filename )*/ ) {
			console.log( `Received filename "${result.filename}" from API for version ${versionId}` );
			return result.filename;
		}
	} catch( error ) {
		console.warn( `Could not resolve canonical filename for version ${versionId}:`, error );
	}

	//return fallbackFilename;
	return ''; // return empty string to avoid stale previous value
}


/** Load LoRA from sidebar file click
 * @param {HTMLElement} element - The file item element that was clicked
 */
function loadModelFromFile( element ) {
	const modelId   = element.getAttribute( 'data-model' );
	const versionId = element.getAttribute( 'data-version' );
	const baseModel = element.getAttribute( 'data-folder' );
	let filename    = element.textContent.trim();

	// Strip .safetensors extension if present (sidebar already strips it, but being safe)
	if( filename.endsWith( '.safetensors' ) ) {
		filename = filename.substring( 0, filename.length - 12 );
	}

	currentFilename     = filename;                                 // current filename for model sync
	currentVersionId    = versionId ? parseInt( versionId ) : null; // current version ID for model sync
	currentModelIdForDb = modelId ? parseInt( modelId ) : null;     // model ID for Add to Database
	currentBaseModel    = baseModel;                                // base model (folder) for rename operations

	if( modelId ) {
		// Set the model ID in the input field
		if( versionId ) {
			modelIdInput.value = modelId + '?modelVersionId=' + versionId;
		} else {
			modelIdInput.value = modelId;
		}
		// Trigger the fetch (preserve filename from sidebar click)
		fetchData( { preserveFilename: true } );
	} else {
		console.error( 'No model ID found for this file' );
	}
}


loadCheckpoints(); // load checkpoints when page loads
loadLoras(); // load loras when page loads


// Set up persistent event listener for Add to Database button (immediately, not on DOMContentLoaded)

const addToDbBtn = document.getElementById( 'addToDbBtn' );

if( addToDbBtn ) {
	addToDbBtn.addEventListener( 'click', () => {
		//console.log( 'Button clicked, using:', { modelId: currentModelIdForDb, versionId: currentSelectedVersion?.id } );
		if( currentModelIdForDb && currentSelectedVersion ) {
			addModelToDatabase( currentModelIdForDb, currentSelectedVersion );
		} else {
			console.error( 'No model data stored for Add to Database' );
		}
	} );
	//console.log( 'Add to Database button listener initialized' );
} else {
	console.error( 'Add to Database button not found during initialization' );
}


const modelIdInput  = document.getElementById( 'modelId' );
const goBtn         = document.getElementById( 'goBtn' );
const output        = document.getElementById( 'output' );


// Handle Enter key in input field
modelIdInput.addEventListener( 'keypress', ( e ) => {
	if( e.key === 'Enter' ) {
		fetchData();
	}
} );

// Handle button click - open Civitai page
goBtn.addEventListener( 'click', () => {
	const modelId = modelIdInput.value.trim(); // e.g., "434302?modelVersionId=567890"

	if( modelId ) {

		// Extract model ID and version ID if present
		const cleanModelId = modelId.split( '?' )[0].split( '@' )[0];
		const versionMatch = modelId.match( /modelVersionId=(\d+)/ );
		
		let url = `https://civitai.com/models/${cleanModelId}`;

		if( versionMatch && versionMatch[1] ) {
			url += `?modelVersionId=${versionMatch[1]}`;
		}
		
		window.open( url, '_blank' );
	}
} );

// Load model version from version link click
function loadModelVersion( modelVersionString ) {
	// Reset filename so it gets loaded fresh from database or API
	currentFilename = null;
	modelIdInput.value = modelVersionString;
	fetchData();
}

let currentModelId = null;
let thumbnailSize = localStorage.getItem( 'thumbnailSize' ) || '450';

// Update thumbnail size for all images
function updateThumbnailSize( size ) {
	thumbnailSize = size;
	localStorage.setItem( 'thumbnailSize', size );

	// Update all images
	const allImages = document.querySelectorAll( '#carouselContainer img, #galleryContainer img' );
	allImages.forEach( img => {
		img.style.maxWidth = size + 'px';
		img.style.maxHeight = size + 'px';
	} );

	// Update all videos
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


// Check if image is cached (doesn't download)
async function checkCached( remoteUrl, cacheLookupUrl = null ) {
	try {
		const response = await fetch( 'api/cache_image.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { imageUrl: remoteUrl, lookupUrl: cacheLookupUrl || remoteUrl, download: false, modelId: currentModelId, versionId: currentVersionId } )
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


// Download and cache image
async function downloadAndCache( remoteUrl, cacheLookupUrl = null ) {
	try {
		const response = await fetch( 'api/cache_image.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { imageUrl: remoteUrl, lookupUrl: cacheLookupUrl || remoteUrl, download: true, modelId: currentModelId, versionId: currentVersionId } )
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


function extractImageIdFromUrl( url ) {
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


function extractFilenameFromUrl( url ) {
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


async function fetchCopyAllTextForImageId( imageId, options = {} ) {
	const { modelId = null, modelVersionId = null, imageFilename = '' } = options;

	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return { promptText: '', paramsText: '', copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowId: '', workflowRevision: '' };
	}

	if( copyAllTextCache.has( imageId ) ) {
		return copyAllTextCache.get( imageId ) || { promptText: '', paramsText: '', copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowId: '', workflowRevision: '' };
	}

	if( copyAllTextPending.has( imageId ) ) {
		return copyAllTextPending.get( imageId );
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
			copyAllTextCache.set( imageId, payload );
			return payload;
		} catch( error ) {
			console.warn( `Could not fetch generation data for image ${imageId}:`, error );
			const emptyPayload = { promptText: '', paramsText: '', copyAllText: '', favorite: false, workflowPresent: false, workflowNull: false, workflowId: '', workflowRevision: '' };
			return emptyPayload;
		} finally {
			copyAllTextPending.delete( imageId );
		}
	} )();

	copyAllTextPending.set( imageId, requestPromise );
	return requestPromise;
}


function queueCopyAllPreviewHydration( paramsTextarea, promptTextarea, favoriteCheckbox, imagePageUrl, imageLoadToken, metadata = {} ) {
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
	copyAllTextQueue.push( { paramsTextarea, promptTextarea, favoriteCheckbox, imageId, imageLoadToken, metadata } );
	processCopyAllPreviewQueue();
}


function autosizeCopyAllPreview( textarea ) {
	if( !textarea ) {
		return;
	}

	textarea.style.height = 'auto';
	textarea.style.height = textarea.scrollHeight + 'px';
}


function syncCopyAllPreviewWidth( card ) {
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
				const stackedButtons = String( thumbnailSize ) === '150';
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


function processCopyAllPreviewQueue() {
	while( copyAllActiveCount < COPY_ALL_MAX_CONCURRENCY && copyAllTextQueue.length > 0 ) {
		const job = copyAllTextQueue.shift();
		if( !job || !job.paramsTextarea || !job.promptTextarea ) {
			continue;
		}

		copyAllActiveCount++;

		( async () => {
			try {
				if( job.imageLoadToken !== currentImageLoadToken ) {
					return;
				}

				const payload = await fetchCopyAllTextForImageId( job.imageId, job.metadata || {} );

				if( job.imageLoadToken !== currentImageLoadToken ) {
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
				copyAllActiveCount--;
				processCopyAllPreviewQueue();
			}
		} )();
	}
}


function applyImageCardBorder( referenceElement, isFavorite = false, workflowPresent = false, workflowNull = false ) {
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


function updateWorkflowActionsVisibility( referenceElement ) {
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


function updateImageCardState( referenceElement, { favoriteLoaded = null, favorite = null, workflowLoaded = null, workflowPresent = null, workflowNull = null } = {} ) {
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


function setFavoriteImageBorder( checkbox, isFavorite ) {
	if( !checkbox ) {
		return;
	}

	const workflowPresent = checkbox.dataset.workflowPresent === '1';
	const workflowNull = checkbox.dataset.workflowNull === '1';
	applyImageCardBorder( checkbox, isFavorite, workflowPresent, workflowNull );
}


async function markImageWorkflowAsNull( imageId, imageFilename = '' ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return false;
	}

	const response = await fetch( 'api/update_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {
			imageId,
			workflow: null,
			modelId: currentModelId,
			modelVersionId: currentVersionId,
			imageFilename
		} )
	} );

	const result = await response.json();
	if( !response.ok || !result.success ) {
		throw new Error( result.error || `HTTP ${response.status}` );
	}

	if( copyAllTextCache.has( imageId ) ) {
		const cached = copyAllTextCache.get( imageId ) || {};
		copyAllTextCache.set( imageId, {
			...cached,
			workflowPresent: false,
			workflowNull: result.workflowNull === true
		} );
	}

	return result.workflowNull === true;
}


async function markImageWorkflowAsPresent( imageId, imageFilename = '', workflowId = null, workflowRevision = null ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return false;
	}

	const workflowIdString = workflowId === null || workflowId === undefined
		? ''
		: String( workflowId ).trim();
	const workflowRevisionString = workflowRevision === null || workflowRevision === undefined
		? ''
		: String( workflowRevision ).trim();

	const response = await fetch( 'api/update_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {
			imageId,
			workflowState: 'present',
			workflow: workflowIdString !== '' ? workflowIdString : true,
			...( workflowRevisionString !== '' ? { version: workflowRevisionString } : {} ),
			modelId: currentModelId,
			modelVersionId: currentVersionId,
			imageFilename
		} )
	} );

	const result = await response.json();
	if( !response.ok || !result.success ) {
		throw new Error( result.error || `HTTP ${response.status}` );
	}

	if( copyAllTextCache.has( imageId ) ) {
		const cached = copyAllTextCache.get( imageId ) || {};
		copyAllTextCache.set( imageId, {
			...cached,
			workflowPresent: true,
			workflowNull: false
		} );
	}

	return true;
}


function isMissingWorkflowError( message ) {
	const text = String( message || '' ).toLowerCase();
	return text === 'no data';
}


function shouldMarkWorkflowAsMissing( error ) {
	if( !error ) {
		return false;
	}

	if( typeof error === 'object' && error !== null && error.errorCode === 'WORKFLOW_NOT_FOUND' ) {
		return true;
	}

	return isMissingWorkflowError( error?.message );
}


async function toggleImageFavorite( checkbox ) {
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
				modelId: currentModelId,
				modelVersionId: currentVersionId,
				imageFilename: checkbox.dataset.imageFilename || ''
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		if( copyAllTextCache.has( imageId ) ) {
			const cached = copyAllTextCache.get( imageId ) || {};
			copyAllTextCache.set( imageId, {
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


async function copyImageWorkflow( button ) {
	if( !button ) {
		return;
	}

	const imageId = Number( button.dataset.imageId || 0 );
	const imagePageUrl = button.dataset.imagePageUrl || '';
	const fullImageUrl = button.dataset.fullImageUrl || '';
	const imageFilename = extractFilenameFromUrl( fullImageUrl || imagePageUrl );
	const card = button.closest( '.image-card' );
	const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;
	const originalText = button.textContent;
	let copiedSuccessfully = false;

	button.disabled = true;
	button.textContent = 'Extracting...';

	try {
		const result = await fetchImageWorkflowData( imageId, imagePageUrl, fullImageUrl );
		const workflowId = result?.workflowJson?.id ?? null;
		const workflowRevision = result?.workflowJson?.revision ?? null;

		if( Number.isInteger( imageId ) && imageId > 0 ) {
			applyWorkflowIdentityToCard( button, workflowId, workflowRevision );
			try {
				await markImageWorkflowAsPresent( imageId, imageFilename, workflowId, workflowRevision );
			} catch( error ) {
				console.warn( `Could not mark workflow state for image ${imageId}:`, error );
			}

			if( favoriteCheckbox ) {
				favoriteCheckbox.dataset.workflowPresent = '1';
				favoriteCheckbox.dataset.workflowNull = '0';
				updateImageCardState( favoriteCheckbox, {
					workflowLoaded: true,
					workflowPresent: true,
					workflowNull: false
				} );
				setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
			} else {
				applyImageCardBorder( button, false, true, false );
				updateImageCardState( button, {
					workflowLoaded: true,
					workflowPresent: true,
					workflowNull: false
				} );
			}

			applyImageCardFilters();
		}

		const copied = await copyTextWithFallback( result.workflowText );
		if( copied ) {
			copiedSuccessfully = true;
		} else {
			window.prompt( 'Clipboard was blocked. Press Ctrl+C (Cmd+C on Mac), then Enter:', result.workflowText );
		}
	} catch( error ) {
		console.warn( 'Workflow extraction/copy failed:', error );

		if( Number.isInteger( imageId ) && imageId > 0 && shouldMarkWorkflowAsMissing( error ) ) {
			try {
				await markImageWorkflowAsNull( imageId, imageFilename );
			} catch( markError ) {
				console.warn( `Could not mark workflow state for image ${imageId}:`, markError );
			}

			if( favoriteCheckbox ) {
				favoriteCheckbox.dataset.workflowPresent = '0';
				favoriteCheckbox.dataset.workflowNull = '1';
				updateImageCardState( favoriteCheckbox, {
					workflowLoaded: true,
					workflowPresent: false,
					workflowNull: true
				} );
				setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
			} else {
				applyImageCardBorder( button, false, false, true );
				updateImageCardState( button, {
					workflowLoaded: true,
					workflowPresent: false,
					workflowNull: true
				} );
			}
		}

	} finally {
		button.disabled = false;
		button.textContent = copiedSuccessfully ? 'Copied' : originalText;
	}
}


async function copyTextWithFallback( text ) {
	const value = typeof text === 'string' ? text : String( text ?? '' );
	if( value.trim() === '' ) {
		return false;
	}

	if( navigator.clipboard && typeof navigator.clipboard.writeText === 'function' ) {
		try {
			await navigator.clipboard.writeText( value );
			return true;
		} catch( error ) {
			console.warn( 'Clipboard API write failed, trying fallback:', error );
		}
	}

	try {
		const textarea = document.createElement( 'textarea' );
		textarea.value = value;
		textarea.setAttribute( 'readonly', '' );
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		textarea.style.top = '0';
		document.body.appendChild( textarea );
		textarea.focus();
		textarea.select();
		textarea.setSelectionRange( 0, textarea.value.length );
		const copied = document.execCommand( 'copy' );
		document.body.removeChild( textarea );
		return copied === true;
	} catch( error ) {
		console.warn( 'Fallback copy failed:', error );
		return false;
	}
}


async function fetchImageWorkflowData( imageId, imagePageUrl, fullImageUrl ) {
	const response = await fetch( 'api/extract_image_workflow.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( {
			imageId,
			imagePageUrl,
			fullImageUrl
		} )
	} );

	const result = await response.json();
	if( !response.ok || !result.success || typeof result.workflowText !== 'string' || result.workflowText.trim() === '' ) {
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


async function fetchNodePortDefinitions( nodes ) {
	const nodeTypes = [ ...new Set(
		nodes
			.map( node => typeof node?.type === 'string' ? node.type.trim() : '' )
			.filter( type => type !== '' )
	) ];

	if( nodeTypes.length === 0 ) {
		return {};
	}

	const response = await fetch( 'api/get_comfyui_node_ports.php', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( { nodeTypes } )
	} );

	const result = await response.json();
	if( !response.ok || !result.success || typeof result.nodes !== 'object' || result.nodes === null ) {
		throw new Error( result.error || `HTTP ${response.status}` );
	}

	return result.nodes;
}


function buildWorkflowAnalysisData( workflowJson ) {
	const nodesRaw = Array.isArray( workflowJson?.nodes ) ? workflowJson.nodes : [];
	const linksRaw = Array.isArray( workflowJson?.links ) ? workflowJson.links : [];

	// Build sets of link IDs that each side of the connection acknowledges.
	// A ghost/orphaned link exists in the top-level links array but is not referenced
	// by the origin node's output slot or the target node's input slot (or both).
	const outputAcknowledgedLinks = new Set();
	const inputAcknowledgedLinks = new Set();

	nodesRaw.forEach( node => {
		const outputs = Array.isArray( node?.outputs ) ? node.outputs : [];
		outputs.forEach( output => {
			const slotLinks = Array.isArray( output?.links ) ? output.links : [];
			slotLinks.forEach( id => outputAcknowledgedLinks.add( Number( id ) ) );
		} );
		const inputs = Array.isArray( node?.inputs ) ? node.inputs : [];
		inputs.forEach( input => {
			if( input?.link != null ) {
				inputAcknowledgedLinks.add( Number( input.link ) );
			}
		} );
	} );

	const nodes = nodesRaw.map( node => ( {
		id: node?.id ?? null,
		type: node?.type ?? '',
		inputs: Array.isArray( node?.inputs ) ? node.inputs.map( input => ( {
			name: typeof input?.name === 'string' ? input.name : '',
			link: input?.link ?? null,
			widgetName: typeof input?.widget?.name === 'string' ? input.widget.name : ''
		} ) ) : [],
		widgets_values: Array.isArray( node?.widgets_values ) ? node.widgets_values : []
	} ) );

	const links = linksRaw
		.filter( link => {
			if( !Array.isArray( link ) || link.length < 5 ) {
				return false;
			}
			const linkId = Number( link[0] );
			return outputAcknowledgedLinks.has( linkId ) && inputAcknowledgedLinks.has( linkId );
		} )
		.map( link => link.slice( 0, 5 ) );

	const workflowId = workflowJson?.id ?? null;
	const workflowRevision = workflowJson?.revision ?? null;

	return { workflowId, workflowRevision, nodes, links };
}


function renderWorkflowAnalysis( imageId, analysisData, nodePortDefinitions = {} ) {
	const section = document.getElementById( 'workflowAnalysisSection' );
	const title = document.getElementById( 'workflowAnalysisTitle' );
	const linksToggleBtn = document.getElementById( 'workflowToggleLinksBtn' );
	const textToggleBtn = document.getElementById( 'workflowToggleTextBtn' );
	const nodeList = document.getElementById( 'workflowAnalysisNodeList' );
	const output = document.getElementById( 'workflowAnalysisOutput' );

	if( !section || !title || !nodeList || !output ) {
		return;
	}

	title.textContent = `Workflow Analysis (Image ${imageId})`;
	nodeList.innerHTML = '';

	const nodes = Array.isArray( analysisData?.nodes ) ? analysisData.nodes : [];
	const links = Array.isArray( analysisData?.links ) ? analysisData.links : [];
	const workflowId = analysisData?.workflowId ?? null;
	const workflowRevision = analysisData?.workflowRevision ?? null;

	if( workflowId !== null || workflowRevision !== null ) {
		const metaDiv = document.createElement( 'div' );
		metaDiv.style.cssText = 'font-size: 12px; color: #adb5bd; margin-bottom: 8px; padding: 6px 8px; background: #25262b; border-radius: 4px; border: 1px solid #373a40;';

		if( workflowId !== null ) {
			const idLine = document.createElement( 'div' );
			idLine.style.fontWeight = '700';
			idLine.textContent = String( workflowId );
			metaDiv.appendChild( idLine );
		}

		if( workflowRevision !== null ) {
			const revisionLine = document.createElement( 'div' );
			revisionLine.textContent = `Version: ${workflowRevision}`;
			metaDiv.appendChild( revisionLine );
		}

		nodeList.appendChild( metaDiv );
	}

	const typeOrder = { input: 0, widget: 1, output: 2 };
	const sectionTitles = { input: 'Inputs', widget: 'Widgets', output: 'Outputs' };
	const nodesById = new Map();
	const nodeCardById = new Map();
	const sectionRenderEntries = [];
	const inputCellByNodePort = new Map();
	const widgetCellByNodePort = new Map();
	const outputCellByNodePort = new Map();
	const connectionSignaturesByCell = new WeakMap();
	const processedLinkEdges = new Set();

	nodes.forEach( node => {
		const id = Number( node?.id );
		if( Number.isFinite( id ) ) {
			nodesById.set( id, node );
		}
	} );

	const getPortLabel = ( nodeType, portType, portIndex ) => {
		const definition = nodePortDefinitions[ nodeType ];
		const ports = Array.isArray( definition?.ports ) ? definition.ports : [];
		const match = ports.find( port => {
			const type = String( port?.port_type || '' ).toLowerCase();
			const idx = Number( port?.port_index );
			return type === portType && idx === portIndex;
		} );

		const label = typeof match?.label === 'string' ? match.label.trim() : '';
		return label || 'Unknown';
	};

	const ensureMaskedCellWrappers = ( valueCell ) => {
		if( !valueCell || valueCell.dataset.maskReady === '1' ) {
			return;
		}

		// Skip masking if cell contains any nested elements (buttons, links, etc.)
		if( valueCell.querySelector( 'button, a, div' ) ) {
			valueCell.dataset.maskReady = '1';
			return;
		}

		const content = document.createElement( 'div' );
		content.className = 'workflow-cell-content';
		while( valueCell.firstChild ) {
			content.appendChild( valueCell.firstChild );
		}

		const mask = document.createElement( 'div' );
		mask.className = 'workflow-cell-mask';
		mask.textContent = '...';
		mask.style.display = 'none';

		valueCell.appendChild( content );
		valueCell.appendChild( mask );
		valueCell.dataset.maskReady = '1';
	};

	const setCellMasked = ( valueCell, masked ) => {
		ensureMaskedCellWrappers( valueCell );
		const mask = valueCell ? valueCell.querySelector( '.workflow-cell-mask' ) : null;
		const content = valueCell ? valueCell.querySelector( '.workflow-cell-content' ) : null;

		if( !mask ) {
			return;
		}

		mask.style.display = masked ? '' : 'none';
		if( content ) {
			content.style.display = masked ? 'none' : '';
		}
	};

	const focusWorkflowNodeCard = ( nodeId ) => {
		nodeCardById.forEach( card => {
			card.style.outline = '';
			card.style.boxShadow = '';
		} );

		const card = nodeCardById.get( nodeId );
		if( !card ) {
			return;
		}

		card.style.outline = '2px solid #4dabf7';
		card.style.boxShadow = '0 0 0 2px rgba(77, 171, 247, 0.35)';
		card.scrollIntoView( { behavior: 'smooth', block: 'center' } );

		setTimeout( () => {
			card.style.outline = '';
			card.style.boxShadow = '';
		}, 1800 );
	};

	const appendConnectionLine = ( cell, lineText, referencedNodeId ) => {
		if( !cell ) {
			return;
		}

		const connectionSignature = `${lineText}::${referencedNodeId}`;
		let cellSignatures = connectionSignaturesByCell.get( cell );
		if( !cellSignatures ) {
			cellSignatures = new Set();
			connectionSignaturesByCell.set( cell, cellSignatures );
		}

		if( cellSignatures.has( connectionSignature ) ) {
			return;
		}
		cellSignatures.add( connectionSignature );

		const cellContent = cell && cell.dataset.maskReady === '1'
			? ( cell.querySelector( '.workflow-cell-content' ) || cell )
			: cell;
		let list = cell.querySelector( '.workflow-connection-list' );
		if( !list ) {
			list = document.createElement( 'div' );
			list.className = 'workflow-connection-list';
			if( cellContent && cellContent.textContent && cellContent.textContent.trim() !== '' ) {
				list.classList.add( 'workflow-connection-list--offset' );
			}
			( cellContent || cell ).appendChild( list );
		}

		const line = document.createElement( 'div' );
		line.className = 'workflow-connection-line';

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.textContent = lineText;
		button.className = 'workflow-connection-btn';
		button.title = 'Jump to referenced node';
		button.onclick = ( event ) => {
			event.preventDefault();
			focusWorkflowNodeCard( referencedNodeId );
		};

		line.appendChild( button );
		list.appendChild( line );
	};

	const resolveCombinedTargetSlot = ( targetNode, nodeType, targetSlot ) => {
		const runtimeInputs = Array.isArray( targetNode?.inputs ) ? targetNode.inputs : [];
		const runtimeInput = runtimeInputs[ targetSlot ];
		if( runtimeInput ) {
			const runtimeLabel = typeof runtimeInput?.name === 'string' && runtimeInput.name.trim()
				? runtimeInput.name.trim()
				: 'Unknown';
			const widgetName = typeof runtimeInput?.widgetName === 'string' && runtimeInput.widgetName.trim()
				? runtimeInput.widgetName.trim().toLowerCase()
				: '';

			if( widgetName ) {
				const widgetPorts = Array.isArray( nodePortDefinitions[ nodeType ]?.ports )
					? nodePortDefinitions[ nodeType ].ports.filter( port => String( port?.port_type || '' ).toLowerCase() === 'widget' )
					: [];
				const widgetMatch = widgetPorts.find( port => {
					const label = typeof port?.label === 'string' ? port.label.trim().toLowerCase() : '';
					return label === widgetName;
				} );

				if( widgetMatch ) {
					const widgetIndex = Number( widgetMatch?.port_index );
					return {
						portType: 'widget',
						portIndex: Number.isFinite( widgetIndex ) ? widgetIndex : targetSlot,
						label: runtimeLabel,
						displaySuffix: Number.isFinite( widgetIndex ) ? `widget ${widgetIndex}` : 'widget'
					};
				}
			}

			return {
				portType: 'input',
				portIndex: targetSlot,
				label: runtimeLabel,
				displaySuffix: String( targetSlot )
			};
		}

		const definition = nodePortDefinitions[ nodeType ];
		const ports = Array.isArray( definition?.ports ) ? definition.ports : [];
		const inputPorts = ports.filter( port => String( port?.port_type || '' ).toLowerCase() === 'input' );
		const widgetPorts = ports.filter( port => String( port?.port_type || '' ).toLowerCase() === 'widget' );

		const inputIndices = inputPorts
			.map( port => Number( port?.port_index ) )
			.filter( idx => Number.isFinite( idx ) );
		const maxInputIndex = inputIndices.length > 0 ? Math.max( ...inputIndices ) : -1;

		const inputMatch = inputPorts.find( port => Number( port?.port_index ) === targetSlot );
		if( inputMatch ) {
			const label = typeof inputMatch?.label === 'string' && inputMatch.label.trim() ? inputMatch.label.trim() : 'Unknown';
			return {
				portType: 'input',
				portIndex: targetSlot,
				label,
				displaySuffix: String( targetSlot )
			};
		}

		if( targetSlot > maxInputIndex ) {
			const widgetIndex = targetSlot - ( maxInputIndex + 1 );
			const widgetMatch = widgetPorts.find( port => Number( port?.port_index ) === widgetIndex );
			if( widgetMatch ) {
				const label = typeof widgetMatch?.label === 'string' && widgetMatch.label.trim() ? widgetMatch.label.trim() : 'Unknown';
				return {
					portType: 'widget',
					portIndex: widgetIndex,
					label,
					displaySuffix: 'widget'
				};
			}
		}

		const fallbackWidget = widgetPorts.find( port => Number( port?.port_index ) === targetSlot );
		if( fallbackWidget ) {
			const label = typeof fallbackWidget?.label === 'string' && fallbackWidget.label.trim() ? fallbackWidget.label.trim() : 'Unknown';
			return {
				portType: 'widget',
				portIndex: targetSlot,
				label,
				displaySuffix: 'widget'
			};
		}

		return {
			portType: 'input',
			portIndex: targetSlot,
			label: 'Unknown',
			displaySuffix: String( targetSlot )
		};
	};

	const formatNumberValue = ( numberValue ) => {
		if( !Number.isFinite( numberValue ) ) {
			return String( numberValue );
		}

		return String( Number( numberValue.toFixed( 2 ) ) );
	};

	const normalizeNumericPrecision = ( value ) => {
		if( typeof value === 'number' ) {
			if( Number.isFinite( value ) ) {
				return Number( value.toFixed( 2 ) );
			}

			return value;
		}

		if( Array.isArray( value ) ) {
			return value.map( item => normalizeNumericPrecision( item ) );
		}

		if( value && typeof value === 'object' ) {
			const normalized = {};
			Object.keys( value ).forEach( key => {
				normalized[ key ] = normalizeNumericPrecision( value[ key ] );
			} );
			return normalized;
		}

		return value;
	};

	const formatWidgetValue = ( value ) => {
		if( value === null || typeof value === 'undefined' ) {
			return '';
		}

		if( typeof value === 'number' ) {
			return formatNumberValue( value );
		}

		if( typeof value === 'string' || typeof value === 'boolean' ) {
			return String( value );
		}

		try {
			return JSON.stringify( normalizeNumericPrecision( value ) );
		} catch( error ) {
			return String( value );
		}
	};

	const normalizePortName = ( value ) => String( value || '' ).trim().toLowerCase();

	const isWidgetPortLinked = ( node, widgetLabel ) => {
		const widgetLabelNormalized = normalizePortName( widgetLabel );
		if( !widgetLabelNormalized ) {
			return false;
		}

		const runtimeInputs = Array.isArray( node?.inputs ) ? node.inputs : [];
		return runtimeInputs.some( input => {
			if( input?.link == null ) {
				return false;
			}

			const widgetName = normalizePortName( input?.widgetName );
			const inputName = normalizePortName( input?.name );
			return widgetName === widgetLabelNormalized || inputName === widgetLabelNormalized;
		} );
	};

	nodes.forEach( ( node ) => {
		const nodeType = typeof node?.type === 'string' && node.type.trim() ? node.type : 'Unknown';
		const nodeIdNumber = Number( node?.id );
		const hasNodeId = Number.isFinite( nodeIdNumber );
		const nodeId = hasNodeId ? nodeIdNumber : '?';
		const widgetValues = Array.isArray( node?.widgets_values ) ? node.widgets_values : [];
		const item = document.createElement( 'div' );
		item.className = 'node';
		if( hasNodeId ) {
			item.dataset.workflowNodeId = String( nodeIdNumber );
			nodeCardById.set( nodeIdNumber, item );
		}

		const nodeTitle = document.createElement( 'div' );
		nodeTitle.className = 'node-title';
		nodeTitle.textContent = `${nodeType} (${nodeId})`;
		item.appendChild( nodeTitle );

		const definition = nodePortDefinitions[ nodeType ];
		const ports = Array.isArray( definition?.ports ) ? definition.ports.slice() : [];
		const hasWidgetTable = ports.some( port => String( port?.port_type || '' ).toLowerCase() === 'widget' );
		item.dataset.hasWidgetTable = hasWidgetTable ? '1' : '0';
		ports.sort( ( a, b ) => {
			const aType = typeof a?.port_type === 'string' ? a.port_type.toLowerCase() : '';
			const bType = typeof b?.port_type === 'string' ? b.port_type.toLowerCase() : '';
			const aOrder = Object.prototype.hasOwnProperty.call( typeOrder, aType ) ? typeOrder[ aType ] : 999;
			const bOrder = Object.prototype.hasOwnProperty.call( typeOrder, bType ) ? typeOrder[ bType ] : 999;

			if( aOrder !== bOrder ) {
				return aOrder - bOrder;
			}

			return ( Number( a?.port_index ) || 0 ) - ( Number( b?.port_index ) || 0 );
		} );

		if( ports.length === 0 ) {
			item.style.borderColor = 'rgb(191, 69, 71)';
			const empty = document.createElement( 'div' );
			empty.style.cssText = 'opacity: 0.8; font-size: 12px;';
			empty.textContent = 'No port definitions found in database.';
			item.appendChild( empty );
			nodeList.appendChild( item );
			return;
		}

		[ 'input', 'widget', 'output' ].forEach( sectionType => {
			const sectionRows = ports.filter( port => ( String( port?.port_type || '' ).toLowerCase() === sectionType ) );
			if( sectionRows.length === 0 ) {
				return;
			}

			const sectionContainer = document.createElement( 'div' );
			item.appendChild( sectionContainer );

			const sectionLabel = document.createElement( 'div' );
			sectionLabel.className = 'node-table-title';
			sectionLabel.textContent = sectionTitles[ sectionType ];
			sectionContainer.appendChild( sectionLabel );

			const table = document.createElement( 'table' );
			table.className = sectionType === 'widget' ? 'node-widgets' : 'node-links';
			sectionRenderEntries.push( {
				sectionType,
				sectionContainer,
				labelEl: sectionLabel,
				tableEl: table
			} );

			sectionRows.forEach( port => {
				const tr = document.createElement( 'tr' );
				const portIndex = Number( port?.port_index ) || 0;
				const portLabel = typeof port?.label === 'string' ? port.label : '';

				const tdIndex = document.createElement( 'td' );
				tdIndex.className = 'port';
				tdIndex.textContent = String( portIndex );

				const tdLabel = document.createElement( 'td' );
				tdLabel.className = 'label';
				tdLabel.textContent = portLabel;

				const tdEmpty = document.createElement( 'td' );
				tdEmpty.className = 'value';
				const widgetLinked = sectionType === 'widget' ? isWidgetPortLinked( node, portLabel ) : false;
				tdEmpty.textContent = sectionType === 'widget' && !widgetLinked ? formatWidgetValue( widgetValues[ portIndex ] ) : '';

				if( sectionType === 'input' && hasNodeId ) {
					inputCellByNodePort.set( `${nodeIdNumber}:${portIndex}`, tdEmpty );
				}

				if( sectionType === 'widget' && hasNodeId ) {
					widgetCellByNodePort.set( `${nodeIdNumber}:${portIndex}`, tdEmpty );
				}

				if( sectionType === 'output' && hasNodeId ) {
					outputCellByNodePort.set( `${nodeIdNumber}:${portIndex}`, tdEmpty );
				}

				tr.appendChild( tdIndex );
				tr.appendChild( tdLabel );
				tr.appendChild( tdEmpty );
				table.appendChild( tr );
			} );

			sectionContainer.appendChild( table );
		} );

		nodeList.appendChild( item );
	} );

	links.forEach( link => {
		if( !Array.isArray( link ) || link.length < 5 ) {
			return;
		}

		const originNodeId = Number( link[1] );
		const originSlot = Number( link[2] );
		const targetNodeId = Number( link[3] );
		const targetSlot = Number( link[4] );

		if( !Number.isFinite( originNodeId ) || !Number.isFinite( originSlot ) || !Number.isFinite( targetNodeId ) || !Number.isFinite( targetSlot ) ) {
			return;
		}

		const edgeKey = `${originNodeId}:${originSlot}->${targetNodeId}:${targetSlot}`;
		if( processedLinkEdges.has( edgeKey ) ) {
			return;
		}
		processedLinkEdges.add( edgeKey );

		const targetNode = nodesById.get( targetNodeId );
		const originNode = nodesById.get( originNodeId );
		if( !targetNode ) {
			return;
		}

		const targetType = typeof targetNode?.type === 'string' && targetNode.type.trim() ? targetNode.type : 'Unknown';
		const targetPort = resolveCombinedTargetSlot( targetNode, targetType, targetSlot );
		const outputLinkText = `${targetType} (${targetNodeId}) > ${targetPort.label} (${targetPort.displaySuffix})`;

		const originType = typeof originNode?.type === 'string' && originNode.type.trim() ? originNode.type : 'Unknown';
		const originLabel = getPortLabel( originType, 'output', originSlot );
		const inputLinkText = `${originType} (${originNodeId}) > ${originLabel} (${originSlot})`;

		const outputCell = outputCellByNodePort.get( `${originNodeId}:${originSlot}` );
		if( outputCell ) {
			appendConnectionLine( outputCell, outputLinkText, targetNodeId );
		}

		const targetCellMap = targetPort.portType === 'widget' ? widgetCellByNodePort : inputCellByNodePort;
		const targetCell = targetCellMap.get( `${targetNodeId}:${targetPort.portIndex}` );
		if( targetCell ) {
			appendConnectionLine( targetCell, inputLinkText, originNodeId );
		}
	} );

	sectionRenderEntries.forEach( ( sectionEntry ) => {
		const { labelEl, tableEl } = sectionEntry;
		const rows = tableEl.querySelectorAll( 'tr' );
		let visibleRowCount = 0;

		rows.forEach( row => {
			const valueCell = row.children[2];
			const hasValue = Boolean( valueCell && valueCell.textContent.trim() !== '' );
			row.style.display = hasValue ? '' : 'none';
			if( hasValue ) {
				visibleRowCount++;
			}
		} );

		if( visibleRowCount === 0 ) {
			tableEl.style.display = 'none';
			labelEl.style.color = '#868e96';
			sectionEntry.hasVisibleRows = false;
		} else {
			tableEl.style.display = '';
			labelEl.style.color = '';
			sectionEntry.hasVisibleRows = true;
		}
	} );

	const applyLinksVisibility = () => {
		sectionRenderEntries.forEach( ( sectionEntry ) => {
			const isLinkSection = sectionEntry.sectionType === 'input' || sectionEntry.sectionType === 'output';
			if( !isLinkSection ) {
				return;
			}

			sectionEntry.sectionContainer.style.display = workflowLinksHidden ? 'none' : '';
		} );

		nodeCardById.forEach( card => {
			const hasWidgetTable = card.dataset.hasWidgetTable === '1';
			if( workflowLinksHidden && !hasWidgetTable ) {
				card.style.display = 'none';
			} else {
				card.style.display = '';
			}
		} );

		if( linksToggleBtn ) {
			linksToggleBtn.textContent = workflowLinksHidden ? 'Show Links' : 'Hide Links';
		}
	};

	const applyTextVisibility = () => {
		sectionRenderEntries.forEach( ( sectionEntry ) => {
			const rows = sectionEntry.tableEl.querySelectorAll( 'tr' );
			rows.forEach( row => {
				if( row.style.display === 'none' ) {
					return;
				}

				const labelCell = row.children[1];
				const valueCell = row.children[2];
				if( !labelCell || !valueCell ) {
					return;
				}

				const labelText = labelCell.textContent.toLowerCase();
				const isTextLike = labelText.includes( 'text' ) || labelText.includes( 'string' );
				if( isTextLike ) {
					setCellMasked( valueCell, workflowTextHidden );
				} else if( valueCell.dataset.maskReady === '1' ) {
					setCellMasked( valueCell, false );
				}
			} );
		} );

		if( textToggleBtn ) {
			textToggleBtn.textContent = workflowTextHidden ? 'Show Text' : 'Hide Text';
		}
	};

	if( linksToggleBtn ) {
		linksToggleBtn.onclick = () => {
			workflowLinksHidden = !workflowLinksHidden;
			applyLinksVisibility();
		};
	}

	if( textToggleBtn ) {
		textToggleBtn.onclick = () => {
			workflowTextHidden = !workflowTextHidden;
			applyTextVisibility();
		};
	}

	applyLinksVisibility();
	applyTextVisibility();

	const metaParts = [];
	if( workflowId !== null ) metaParts.push( `id: ${workflowId}` );
	if( workflowRevision !== null ) metaParts.push( `revision: ${workflowRevision}` );
	const metaPrefix = metaParts.length > 0 ? metaParts.join( '   ' ) + '\n\n' : '';
	const { workflowId: _wfId, workflowRevision: _wfRev, ...analysisDataForJson } = analysisData;
	output.textContent = metaPrefix + JSON.stringify( analysisDataForJson, null, 2 );
	section.style.display = 'block';
	section.scrollIntoView( { behavior: 'smooth', block: 'start' } );
}


async function analyzeImageWorkflow( button ) {
	if( !button ) {
		return;
	}

	const imageId = Number( button.dataset.imageId || 0 );
	const imagePageUrl = button.dataset.imagePageUrl || '';
	const fullImageUrl = button.dataset.fullImageUrl || '';
	const imageFilename = extractFilenameFromUrl( fullImageUrl || imagePageUrl );
	const card = button.closest( '.image-card' );
	const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;
	const originalText = button.textContent;

	button.disabled = true;
	button.textContent = 'Analyzing...';

	try {
		const result = await fetchImageWorkflowData( imageId, imagePageUrl, fullImageUrl );
		const workflowId = result?.workflowJson?.id ?? null;
		const workflowRevision = result?.workflowJson?.revision ?? null;

		if( Number.isInteger( imageId ) && imageId > 0 ) {
			applyWorkflowIdentityToCard( button, workflowId, workflowRevision );
			try {
				await markImageWorkflowAsPresent( imageId, imageFilename, workflowId, workflowRevision );
			} catch( error ) {
				console.warn( `Could not mark workflow state for image ${imageId}:`, error );
			}

			if( favoriteCheckbox ) {
				favoriteCheckbox.dataset.workflowPresent = '1';
				favoriteCheckbox.dataset.workflowNull = '0';
				updateImageCardState( favoriteCheckbox, {
					workflowLoaded: true,
					workflowPresent: true,
					workflowNull: false
				} );
				setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
			} else {
				applyImageCardBorder( button, false, true, false );
				updateImageCardState( button, {
					workflowLoaded: true,
					workflowPresent: true,
					workflowNull: false
				} );
			}

			applyImageCardFilters();
		}

		const workflowJson = result.workflowJson;
		const analysisData = buildWorkflowAnalysisData( workflowJson );
		const nodePortDefinitions = await fetchNodePortDefinitions( analysisData.nodes );
		renderWorkflowAnalysis( imageId, analysisData, nodePortDefinitions );

		const workflowNodeList = document.getElementById( 'workflowAnalysisNodeList' );
		if( workflowNodeList ) {
			workflowNodeList.scrollIntoView( { behavior: 'smooth', block: 'start' } );
		}
	} catch( error ) {
		console.warn( 'Workflow analysis failed:', error );

		if( Number.isInteger( imageId ) && imageId > 0 && shouldMarkWorkflowAsMissing( error ) ) {
			try {
				await markImageWorkflowAsNull( imageId, imageFilename );
			} catch( markError ) {
				console.warn( `Could not mark workflow state for image ${imageId}:`, markError );
			}

			if( favoriteCheckbox ) {
				favoriteCheckbox.dataset.workflowPresent = '0';
				favoriteCheckbox.dataset.workflowNull = '1';
				updateImageCardState( favoriteCheckbox, {
					workflowLoaded: true,
					workflowPresent: false,
					workflowNull: true
				} );
				setFavoriteImageBorder( favoriteCheckbox, favoriteCheckbox.checked === true );
			} else {
				applyImageCardBorder( button, false, false, true );
				updateImageCardState( button, {
					workflowLoaded: true,
					workflowPresent: false,
					workflowNull: true
				} );
			}
		}

	} finally {
		button.disabled = false;
		button.textContent = originalText;
	}
}


// Sync tags to database
async function syncTagsToDatabase( nextData, modelId ) {
	try {
		// Extract tagsOnModels from __NEXT_DATA__
		const tagsOnModels = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.tagsOnModels;

		if( !tagsOnModels || !Array.isArray( tagsOnModels ) || tagsOnModels.length === 0 ) {
			console.log( 'No tags found in __NEXT_DATA__' );
			return;
		}

		// Extract numeric model ID from the input (handles formats like "434302" or "434302?modelVersionId=...")
		const numericModelId = parseInt( modelId.toString().match( /\d+/ )?.[0] || '0' );

		if( !numericModelId ) {
			console.error( 'Invalid model ID for tag sync:', modelId );
			return;
		}

		console.log( `Syncing ${tagsOnModels.length} tags for model ${numericModelId} to database...` );

		const response = await fetch( 'api/sync_tags.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { tagsOnModels, modelId: numericModelId } )
		} );

		const result = await response.json();

		if( result.success ) {
			console.log( `Tags synced: ${result.tags.inserted} inserted, ${result.tags.updated} updated, ${result.tags.total_processed} total processed` );
			console.log( `Model-Tag associations: ${result.model_tags.inserted} inserted for model ${numericModelId}` );
			if( result.tags.errors && result.tags.errors.length > 0 ) {
				console.warn( 'Tag sync errors:', result.tags.errors );
			}
			if( result.model_tags.errors && result.model_tags.errors.length > 0 ) {
				console.warn( 'Model-tag sync errors:', result.model_tags.errors );
			}
		} else {
			console.error( 'Tag sync failed:', result.error );
		}
	} catch( error ) {
		console.error( 'Tag sync error:', error );
	}
}


// Sync model data to database
async function syncModelsToDatabase( nextData, modelId, filename, clickedVersionId ) {
	try {
		// Extract modelVersions from __NEXT_DATA__
		const modelVersions = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;
		const modelType = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.type;

		if( !modelVersions || !Array.isArray( modelVersions ) || modelVersions.length === 0 ) {
			console.log( 'No model versions found in __NEXT_DATA__' );
			return;
		}

		// Only sync the specific version that was clicked
		const targetVersion = modelVersions.find( v => v.id === clickedVersionId );
		if( !targetVersion ) {
			console.warn( `Clicked version ${clickedVersionId} not found in model versions` );
			return;
		}

		console.log( `Syncing version ${clickedVersionId} to database...` );

		const response = await fetch( 'api/sync_models.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { modelVersions: [targetVersion], filename, modelType } )
		} );

		const result = await response.json();

		if( result.success ) {
			console.log( `Models synced: ${result.stats.inserted} inserted, ${result.stats.updated} updated` );
			if( result.stats.errors && result.stats.errors.length > 0 ) {
				console.warn( 'Model sync errors:', result.stats.errors );
			}
		} else {
			console.error( 'Model sync failed:', result.error );
		}
	} catch( error ) {
		console.error( 'Model sync error:', error );
	}
}


// Get cache size info
async function getCacheSize( modelId ) {
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


// Clear cache
async function clearCache( modelId = null ) {
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
			// Refresh the data
			fetchData();
		}
	} catch( error ) {
		console.error( 'Cache clear failed:', error );
		alert( 'Failed to clear cache' );
	}
}


async function fetchData( options = {} ) {
	const { preserveFilename = false } = options;

	if( !preserveFilename ) {
		currentFilename = null;
	}

	const modelId = modelIdInput.value.trim();

	if( !modelId ) {
		output.innerHTML = '<div class="error">Please enter a model ID</div>';
		return;
	}

	const imageLoadToken = ++currentImageLoadToken;

	// Hide sections while loading
	document.getElementById( 'modelTags' ).classList.remove( 'visible' );
	document.getElementById( 'versionLinks' ).classList.remove( 'visible' );
	document.getElementById( 'addToDbSection' ).style.display = 'none';

	// Reset loading flags on any existing containers from previous model
	const existingCarousel = document.getElementById( 'carouselContainer' );
	if( existingCarousel ) existingCarousel.dataset.loading = 'false';
	const existingGallery = document.getElementById( 'galleryContainer' );
	if( existingGallery ) existingGallery.dataset.loading = 'false';

	// Show loading state
	output.innerHTML = '<div class="loading">Fetching model data...</div>';

	try {
		// Add cache-busting parameter to prevent browser caching
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

		if( result.error ) {
			output.innerHTML = `<div class="error">${escapeHtml( result.error )}</div>`;
		} else if( result.data ) {
			currentModelJsonData = result.data;
			// Note: Database syncing removed - loading a LoRA should only display data, not write to database
			// Tags and models are synced during initial batch import only

			// Set current model ID for cache tracking (moved earlier)
			currentModelId = result.modelId || modelId.split( '?' )[0];

			// Update currentVersionId and currentModelIdForDb from selected version
			if( result.selectedVersion && result.selectedVersion.id ) {
				currentVersionId    = result.selectedVersion.id;
				currentModelIdForDb = currentModelId;
			}

			// Check if model exists in database (await to get filename before proceeding)
			currentOriginalFilename = null;
			currentModelExistsInDb = false;

			// Reset active tags and settings for new model
			currentSettingsSets = [];
			currentSamplerOptions = [];
			currentSchedulerOptions = [];
			currentSettingsShowAll = {};

			await checkModelInDatabase( currentModelId, result.selectedVersion );

			// Populate model tags
			if( result.modelTags && Array.isArray( result.modelTags ) && result.modelTags.length > 0 ) {
				const modelTagsContainer = document.getElementById( 'modelTagsContainer' );
				let modelTagsHtml = '';

				result.modelTags.forEach( tag => {
					const activeClass = activeTags.has( tag ) ? ' active' : '';
					modelTagsHtml += `<div class="model-tag${activeClass}" data-tag="${escapeHtml( tag )}" onclick="toggleTag(this)">${escapeHtml( tag )}</div>`;
				} );

				modelTagsContainer.innerHTML = modelTagsHtml;
				document.getElementById( 'modelTags' ).classList.add( 'visible' );
			}

			// Populate version links
			const modelVersions = result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;
			const modelType = result.data?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.type;
			const trpcQueries = result.data?.props?.pageProps?.trpcState?.json?.queries;
			const trpcDescription = Array.isArray( trpcQueries )
				? ( trpcQueries.find( query => typeof query?.state?.data?.description === 'string' )?.state?.data?.description || '' )
				: '';
			if( modelVersions && Array.isArray( modelVersions ) && modelVersions.length > 0 ) {
				const versionLinksContainer = document.getElementById( 'versionLinksContainer' );
				let versionLinksHtml = '';
				const selectedVersionId = result.selectedVersion?.id || null;

				modelVersions.forEach( version => {
					if( version.id && version.modelId && version.name ) {
						const modelVersionString = `${version.modelId}?modelVersionId=${version.id}`;
						const activeClass = selectedVersionId === version.id ? ' active' : '';
						versionLinksHtml += `<div class="version-link${activeClass}" onclick="loadModelVersion('${escapeHtml( modelVersionString )}')">${escapeHtml( version.name )}</div>`;
					}
				} );

				versionLinksContainer.innerHTML = versionLinksHtml;
				document.getElementById( 'versionLinks' ).classList.add( 'visible' );
			}

			let html = '';

			// Show selected version information
			if( result.selectedVersion ) {
				const version = result.selectedVersion;

				// Update currentBaseModel from version data (for rename operations)
				if( version.baseModel ) {
					currentBaseModel = version.baseModel;
				}

				// Original filename source:
				// - DB rows: always show DB value (authoritative)
				// - Non-DB rows: show Civitai-resolved value
				let safetensorsFile = '';
				if( currentModelExistsInDb ) {
					safetensorsFile = ( typeof currentOriginalFilename === 'string' && currentOriginalFilename.trim() !== '' )
						? currentOriginalFilename.trim()
						: '';
				} else {
					safetensorsFile = await fetchOriginalFilename( version.id /*, version.files*/ );
				}

				// Keep filename behavior consistent:
				// - DB rows: preserve DB-driven currentFilename value
				// - Non-DB rows: always mirror canonical/original filename to avoid stale previous value
				if( safetensorsFile && ( !currentModelExistsInDb || !currentFilename ) ) {
					// Strip .safetensors extension for display
					if( safetensorsFile.endsWith( '.safetensors' ) ) {
						currentFilename = safetensorsFile.substring( 0, safetensorsFile.length - 12 );
					} else {
						currentFilename = safetensorsFile;
					}
				}

				// Extract trained words
				let trainedWords = '';
				if( version.trainedWords && Array.isArray( version.trainedWords ) ) {
					trainedWords = version.trainedWords.map( w => `<code class="trigger-word">${escapeHtml( w )}</code>` ).join( '<br>' );
				}

				html += `
					<div class="info success">
						<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
							<div class="editable-filename" contenteditable="true" onkeydown="handleFilenameKeydown(event, this)" onblur="saveFilename(this)" data-original="${escapeHtml( currentFilename || '' )}" data-original-file="${escapeHtml( safetensorsFile || '' )}" style="flex: 1;">${escapeHtml( currentFilename || 'Unknown' )}</div>
							<button class="reset-filename-btn" onclick="resetFilename()" style="padding: 8px 16px; background: #f39c12; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; white-space: nowrap;">Reset</button>
						</div>
						${result.versionSelectionMethod ? `<div class="matched"><em>${escapeHtml( result.versionSelectionMethod )}</em></div>` : ''}
						
						<table class="info-table">
							<tr>
								<td>Type</td>
								<td>${escapeHtml( modelType || 'N/A' )}</td>
							</tr>
							<tr>
								<td>ID</td>
								<td>${version.id}</td>
							</tr>
							<tr>
								<td>Name</td>
								<td>${escapeHtml( version.name || 'N/A' )}</td>
							</tr>
							${version.baseModel ? `
							<tr>
								<td>Base Model</td>
								<td>${escapeHtml( version.baseModel )}</td>
							</tr>` : ''}
							${version.createdAt ? `
							<tr>
								<td>Created</td>
								<td>${new Date( version.createdAt ).toLocaleDateString()}</td>
							</tr>` : ''}
							${version.description ? `
							<tr>
								<td>Description</td>
								<td>${version.description}</td>
							</tr>` : ''}
							${trainedWords ? `
							<tr>
								<td>Trigger Words</td>
								<td>${trainedWords}</td>
							</tr>` : ''}
							${currentModelExistsInDb ? `
							<tr>
								<td>Original Filename (DB)</td>
								<td class="filename editable-original-filename" contenteditable="true" onkeydown="handleOriginalFilenameKeydown(event, this)" onblur="saveOriginalFilename(this)" data-original="${escapeHtml( safetensorsFile || '' )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( safetensorsFile || '' )}</td>
							</tr>` : ( safetensorsFile ? `
							<tr>
								<td>Original Filename (Civitai)</td>
								<td class="filename" style="color: #8fd19e;">${escapeHtml( safetensorsFile )}</td>
							</tr>` : '' )}
						</table>
						<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
							<strong>Settings</strong>
						</div>
						<div id="settingsTablesContainer">${buildSettingsTablesHtml( currentSettingsSets, true )}</div>
						${currentModelExistsInDb ? '<div style="display: flex; justify-content: flex-end; margin-top: 10px;"><button id="addSettingsSetBtn" onclick="addSettingsSet()" style="padding: 4px 10px; font-size: 12px;">Add set</button></div>' : ''}
					</div>
				`;

				if( trpcDescription ) {
					html += `
					<div class="info">
						<div style="margin-top: 8px;">${trpcDescription}</div>
					</div>
				`;
				}
			} else if( result.versionSelectionMethod ) {
				html += `
					<div class="info warning">
						<strong>Model Version Selection:</strong><br>
						${escapeHtml( result.versionSelectionMethod )}
					</div>
				`;
			}

			// Cache info section
			html += `
				<div class="info" style="background: #1e1e2e; border: 1px solid #333;">
					<div id="cacheInfo" style="display: flex; gap: 20px; align-items: center; font-size: 13px;">
						<span style="color: #888;">Loading cache info...</span>
					</div>
				</div>
			`;

			// Thumbnail size selector
			html += `
				<div class="info" style="background: #1e1e2e; border: 1px solid #333; padding: 10px 15px;">
					<label style="display: flex; align-items: center; gap: 10px; font-size: 13px;">
						<strong>Thumbnail Size:</strong>
						<select id="thumbnailSize" onchange="updateThumbnailSize(this.value)" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer;">
							<option value="150">150px</option>
							<option value="300">300px</option>
							<option value="450">450px</option>
						</select>
					</label>
				</div>
			`;

			// Display version images - placeholder with loading indicator
			html += `
				<div class="info">
					<div style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
						<button type="button" id="generationToggleParamsBtn" onclick="toggleGenerationPreview('params')" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Params</button>
						<button type="button" id="generationTogglePromptsBtn" onclick="toggleGenerationPreview('prompts')" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Prompts</button>
						<button type="button" id="generationToggleNonWorkflowBtn" onclick="toggleGenerationPreview('non-workflow')" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Non-Workflow</button>
						<button type="button" id="generationToggleNonFavoritesBtn" onclick="toggleGenerationPreview('non-favorites')" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Non-Favorites</button>
					</div>
					<div id="workflowFilterSection" style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;">
						<div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #cfd8dc;">
							<strong>Workflow Filter</strong>
							<span id="workflowFilterStatus" style="color: #8aa0ae;">(loading...)</span>
						</div>
						<div id="workflowFilterButtons" style="display: inline-flex; flex-direction: column; gap: 6px; max-width: 100%;"></div>
					</div>
					<strong>Carousel Images <span id="carouselStatus">(loading...)</span></strong>
					<div id="carouselContainer" style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;"></div>
				</div>
			`;

			// Display gallery images - placeholder with loading indicator
			html += `
				<div class="info">
					<strong>Gallery Images <span id="galleryStatus">(loading...)</span></strong>
					<div id="galleryContainer" style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;"></div>
				</div>
			`;

			html += `
				<div class="info" id="workflowAnalysisSection" style="display: none;">
					<strong id="workflowAnalysisTitle">Workflow Analysis</strong>
					<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
						<button type="button" id="workflowToggleLinksBtn" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Links</button>
						<button type="button" id="workflowToggleTextBtn" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Text</button>
					</div>
					<div id="workflowAnalysisNodeList" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;"></div>
					<div class="json-output" style="margin-top: 10px;">
						<pre id="workflowAnalysisOutput"></pre>
					</div>
				</div>
			`;

			// Render HTML immediately so user sees content right away
			output.innerHTML = html;
			setupWorkflowAnalysisVisibilityObserver();
			applyGenerationPreviewVisibility();
			loadVersionWorkflowFilters( result.selectedVersion?.id || currentVersionId );

			// Load and display cache info
			getCacheSize( currentModelId ).then( cacheInfo => {
				if( cacheInfo ) {
					const cacheInfoDiv = document.getElementById( 'cacheInfo' );
					cacheInfoDiv.innerHTML = `
						<div>
							<strong>Model cache:</strong> ${cacheInfo.modelSizeMB} MB
							<button onclick="clearCache('${currentModelId}')" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear</button>
						</div>
						<div>
							<strong>Total cache:</strong> ${cacheInfo.totalSizeMB} MB (${cacheInfo.fileCount} files)
							<button onclick="clearCache()" style="margin-left: 10px; padding: 2px 8px; background: #c92a2a; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px;">Clear All</button>
						</div>
					`;
				}
			} );

			// Set thumbnail size dropdown to saved value
			const thumbnailSizeSelect = document.getElementById( 'thumbnailSize' );
			if( thumbnailSizeSelect ) {
				thumbnailSizeSelect.value = thumbnailSize;
			}

			// Load images asynchronously - don't block main content display
			loadModelImages( currentModelId, result.selectedVersion, imageLoadToken );
		} else {
			output.innerHTML = '<div class="error">No data found in response</div>';
		}
	} catch( error ) {
		output.innerHTML = `<div class="error">Error: ${escapeHtml( error.message )}</div>`;
	}
}


// Check if model exists in database
async function checkModelInDatabase( modelId, selectedVersion ) {
	if( !selectedVersion || !selectedVersion.id ) {
		console.log( 'No selectedVersion, skipping database check' );
		return;
	}

	try {
		//console.log( `Checking if model ${modelId} version ${selectedVersion.id} exists in database...` );
		const response = await fetch( 'api/check_model_exists.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { modelId: parseInt( modelId ), versionId: selectedVersion.id } )
		} );

		if( !response.ok ) {
			console.error( `HTTP error! status: ${response.status}` );
			return;
		}

		const result = await response.json();
		//console.log( 'Database check result:', result );
		//console.log( 'result.exists type:', typeof result.exists, 'value:', result.exists );

		currentModelExistsInDb = result.success && result.exists === true;

		// If model exists in database, use the filename from database
		if( result.success && result.exists === true && result.filename ) {
			// Strip .safetensors extension if present
			currentFilename = result.filename.endsWith( '.safetensors' )
				? result.filename.substring( 0, result.filename.length - 12 )
				: result.filename;
			//console.log( 'Model exists in database, using filename:', currentFilename );
		}

		if( result.success && result.exists === true ) {
			currentOriginalFilename = result.originalFilename ?? null;
			currentSettingsSets = normalizeSettingsSets( result.settingsSets, true );
			currentSamplerOptions = Array.isArray( result.samplerOptions ) ? result.samplerOptions : [];
			currentSchedulerOptions = Array.isArray( result.schedulerOptions ) ? result.schedulerOptions : [];
			//console.log( 'Model exists in database, using original filename:', currentOriginalFilename );
		} else {
			currentOriginalFilename = null;
			currentSettingsSets = normalizeSettingsSets( [], true );
			currentSamplerOptions = [];
			currentSchedulerOptions = [];
		}

		if( result.success && result.exists === false ) {
			console.log( 'Model not in database - showing Add to Database button' );

			// Store current model and version data globally for the button click handler
			currentModelIdForDb = modelId;
			currentSelectedVersion = selectedVersion;
			console.log( 'Stored for Add to Database:', { modelId, versionId: selectedVersion.id } );

			// Model not in database - show Add to Database button
			const addToDbSection = document.getElementById( 'addToDbSection' );
			const addToDbBtn = document.getElementById( 'addToDbBtn' );
			const addToDbStatus = document.getElementById( 'addToDbStatus' );

			if( !addToDbSection || !addToDbBtn || !addToDbStatus ) {
				console.error( 'Button elements not found in DOM!' );
				return;
			}

			addToDbSection.style.display = 'block';
			addToDbStatus.textContent = '';
			addToDbBtn.disabled = false; // Re-enable button in case it was disabled from previous use

			//console.log( 'Button displayed and ready' );
		} else if( result.success && result.exists === true ) {
			//console.log( 'Model already exists in database' );
		} else {
			console.error( 'Unexpected result from check_model_exists.php:', result );
		}
	} catch( error ) {
		console.error( 'Error checking model in database:', error );
	}
}


// Add model to database (models, tags, and model_tags tables)
async function addModelToDatabase( modelId, selectedVersion ) {
	console.log( 'addModelToDatabase called with:', { modelId, versionId: selectedVersion?.id } );

	// Get fresh references to DOM elements (important after button cloning)
	const addToDbBtn = document.getElementById( 'addToDbBtn' );
	const addToDbStatus = document.getElementById( 'addToDbStatus' );

	if( !addToDbBtn || !addToDbStatus ) {
		console.error( 'Button elements not found!' );
		return;
	}

	if( !modelId || !selectedVersion ) {
		console.error( 'Missing modelId or selectedVersion!' );
		addToDbStatus.textContent = '❌ Error: Missing model data';
		addToDbStatus.style.color = '#fa5252';
		return;
	}

	addToDbBtn.disabled = true;
	addToDbStatus.textContent = '⏳ Adding to database...';
	addToDbStatus.style.color = '#868e96';

	try {
		// Get the full __NEXT_DATA__ from the page
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

		if( result.error || !result.data ) {
			throw new Error( result.error || 'Failed to fetch model data' );
		}

		// Determine filename: use canonical download filename from API whenever possible
		let filename = await fetchOriginalFilename( selectedVersion.id /*, selectedVersion.files*/ );
		if( filename ) {
			console.log( `Using canonical download filename: ${filename}` );
		}

		// Second priority: Use sidebar filename if no original filename found
		if( !filename && currentFilename ) {
			filename = currentFilename.endsWith( '.safetensors' ) ? currentFilename : `${currentFilename}.safetensors`;
			console.log( `Using filename from sidebar: ${filename}` );
		}

		// Last resort: Generate a filename based on model name
		if( !filename ) {
			const modelName = selectedVersion.name || 'model';
			filename = `${modelName.replace( /[^a-zA-Z0-9_-]/g, '_' )}.safetensors`;
			console.log( `Generated fallback filename: ${filename}` );
		}

		// Sync tags
		await syncTagsToDatabase( result.data, modelId );

		// Sync model
		await syncModelsToDatabase( result.data, modelId, filename, selectedVersion.id );

		addToDbStatus.textContent = '✅ Successfully added to database!';
		addToDbStatus.style.color = '#51cf66';

		// Reload both sidebars to mirror rename refresh behavior
		await Promise.all( [
			loadLoras( true ),
			loadCheckpoints( true )
		] );

		// Hide the button after successful addition
		setTimeout( () => {
			document.getElementById( 'addToDbSection' ).style.display = 'none';
		}, 3000 );

	} catch( error ) {
		console.error( 'Error adding to database:', error );
		addToDbStatus.textContent = `❌ Error: ${error.message}`;
		addToDbStatus.style.color = '#fa5252';
		addToDbBtn.disabled = false;
	}
}


// Load model images asynchronously (carousel + gallery)
async function loadModelImages( modelId, selectedVersion, imageLoadToken = currentImageLoadToken ) {
	const isStale = () => imageLoadToken !== currentImageLoadToken;
	copyAllTextQueue = [];
	copyAllTextPending = new Map();
	copyAllTextCache = new Map();

	const pauseIfWorkflowAnalysisVisible = async () => {
		while( !isStale() && workflowAnalysisSectionVisible ) {
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

	// Fetch images from server
	try {
		await pauseIfWorkflowAnalysisVisible();
		if( isStale() ) {
			return;
		}

		const response = await fetch( 'api/get_model_images.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { modelId, versionId } )
		} );

		const result = await response.json();
		if( isStale() ) {
			return;
		}

		if( result.error ) {
			console.error( 'Image fetch error:', result.error );
			setStatus( 'carouselStatus', '(error loading)' );
			setStatus( 'galleryStatus', '(error loading)' );
			return;
		}

		// Load carousel images
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

				//console.log( `Starting carousel load: ${result.carouselImages.length} images` );
				container.dataset.loading = 'true';
				container.innerHTML = ''; // Clear container

				// Reset counter
				const carouselCountEl = document.getElementById( 'carouselCount' );
				if( carouselCountEl ) {
					carouselCountEl.textContent = '0';
				}

				// First, check which images are cached (fast, parallel)
				const cacheChecks = result.carouselImages.map( img => {
					const lookupUrl = img.linkUrl || img.originalUrl || img.url;
					const isVideo = img.type === 'video' || ( img.url && ( img.url.includes( '.mp4' ) || img.url.includes( '.webm' ) ) );
					if( isVideo ) {
						return Promise.resolve( { originalUrl: img.originalUrl || img.url, linkUrl: img.linkUrl || img.url, url: img.url, isVideo: true, cached: true } );
					}
					return checkCached( img.url, lookupUrl ).then( result => ( {
						originalUrl: img.originalUrl || img.url,
						linkUrl: img.linkUrl || img.url,
						url: result.url,
						cached: result.cached,
						isVideo: false
					} ) );
				} );

				const imageInfo = await Promise.all( cacheChecks );

				const uncachedCount = imageInfo.filter( i => !i.cached && !i.isVideo ).length;
				//console.log( `Carousel: ${imageInfo.length} total, ${uncachedCount} to download` );

				// Reserve visual positions so cards stay in original order regardless of fetch order.
				const slotElements = imageInfo.map( () => {
					const slot = document.createElement( 'div' );
					slot.style.flex = '0 0 auto';
					container.appendChild( slot );
					return slot;
				} );

				// Display cached/video entries first so cache-backed rendering is never blocked
				// behind delayed remote downloads.
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

					// If not cached, download with delay only between consecutive remote downloads.
					// Cached assets reset delay so cache-backed loading is never throttled.
					let displayUrl = info.url;
					if( !info.cached && !info.isVideo ) {
						if( shouldDelayBeforeRemoteDownload ) {
							//console.log(`Waiting 1.5s before downloading carousel image ${info.renderPosition}...`);
							await new Promise( resolve => setTimeout( resolve, 1500 ) );
						}
						//console.log(`Downloading carousel image ${info.renderPosition}/${imageInfo.length}`);
						displayUrl = await downloadAndCache( info.originalUrl, info.linkUrl || info.originalUrl );
						shouldDelayBeforeRemoteDownload = true;
					} else {
						shouldDelayBeforeRemoteDownload = false;
					}

					let imageHtml = '';
					if( info.isVideo ) {
						const mp4Url = info.url.replace( /\.webm$/, '.mp4' );
						imageHtml = `
								<div class="image-card" data-favorite-loaded="0" data-favorite="0" data-workflow-loaded="0" data-workflow-present="0" data-workflow-null="0" data-workflow-id="" data-workflow-revision="" style="flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: flex-start;">
									<video style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block; cursor: pointer;"
												 playsinline loop muted autoplay
												 onclick="this.requestFullscreen()">
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
												 style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block;"
												 loading="lazy">
									</a>
									<label style="margin-top: 6px; font-size: 11px; color: #cfd8dc; display: flex; align-items: center; gap: 6px;">
										<input type="checkbox" class="favorite-checkbox" data-image-id="${imageId || ''}" data-image-filename="${escapeHtml( imageFilename )}" onchange="toggleImageFavorite(this)">
										Favorite
									</label>
									<div class="workflow-actions" style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
										<button type="button" class="workflow-copy-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" onclick="copyImageWorkflow(this)" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Copy Workflow</button>
										<button type="button" class="workflow-analyze-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" onclick="analyzeImageWorkflow(this)" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Analyze Workflow</button>
									</div>
									<div class="workflow-no-workflow" style="margin-top: 6px; font-size: 11px; color: #bf4547; display: none;">No Workflow</div>
									<textarea class="generation-preview generation-params-preview" readonly style="margin-top: 6px; width: 100%; min-height: 42px; background: #1f1f1f; color: #cfd8dc; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 11px; line-height: 1.35; white-space: pre-wrap; resize: none; overflow: hidden; box-sizing: border-box;">Loading parameters...</textarea>
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
						const paramsField = card ? card.querySelector( '.generation-params-preview' ) : null;
						const promptField = card ? card.querySelector( '.generation-prompt-preview' ) : null;
						const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;
						syncCopyAllPreviewWidth( card );
						applyGenerationPreviewVisibility();
						applyImageCardFilters();
						queueCopyAllPreviewHydration( paramsField, promptField, favoriteCheckbox, info.linkUrl || info.originalUrl, imageLoadToken, {
							modelId: currentModelId,
							modelVersionId: currentVersionId,
							imageFilename: extractFilenameFromUrl( displayUrl )
						} );
					}

					// Update counter based on actual number of images in container
					const carouselCountEl = document.getElementById( 'carouselCount' );
					if( carouselCountEl ) {
						carouselCountEl.textContent = String( renderedCount );
					}
				}

				//console.log( `Carousel loading complete: ${container.children.length} images added` );
				container.dataset.loading = 'false';
				setStatus( 'carouselStatus', `(${renderedCount})`, true );
			};

			loadCarouselImages();
		} else {
			setStatus( 'carouselStatus', '(0)' );
		}

		// Load gallery images
		if( result.galleryImages && result.galleryImages.length > 0 ) {
			setStatus( 'galleryStatus', `(<span id="galleryCount">0</span>/${result.galleryImages.length})`, true );
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

				//console.log( `Starting gallery load: ${result.galleryImages.length} images` );
				container.dataset.loading = 'true';
				container.innerHTML = ''; // Clear container

				// Reset counter
				const galleryCountEl = document.getElementById( 'galleryCount' );
				if( galleryCountEl ) {
					galleryCountEl.textContent = '0';
				}

				// First, check which images are cached (fast, parallel)
				const cacheChecks = result.galleryImages.map( img => {
					const lookupUrl = img.linkUrl || img.originalUrl || img.url;
					const isVideo = img.type === 'video' || ( img.url && ( img.url.includes( '.mp4' ) || img.url.includes( '.webm' ) ) );
					if( isVideo ) {
						return Promise.resolve( { originalUrl: img.originalUrl || img.url, linkUrl: img.linkUrl || img.url, url: img.url, isVideo: true, cached: true } );
					}
					return checkCached( img.url, lookupUrl ).then( result => ( {
						originalUrl: img.originalUrl || img.url,
						linkUrl: img.linkUrl || img.url,
						url: result.url,
						cached: result.cached,
						isVideo: false
					} ) );
				} );

				const imageInfo = await Promise.all( cacheChecks );

				const uncachedCount = imageInfo.filter( i => !i.cached && !i.isVideo ).length;
				//console.log( `Gallery: ${imageInfo.length} total, ${uncachedCount} to download, ${imageInfo.length - uncachedCount} cached` );

				// Reserve visual positions so cards stay in original order regardless of fetch order.
				const slotElements = imageInfo.map( () => {
					const slot = document.createElement( 'div' );
					slot.style.flex = '0 0 auto';
					container.appendChild( slot );
					return slot;
				} );

				// Display cached/video entries first so cache-backed rendering is never blocked
				// behind delayed remote downloads.
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

					// If not cached, download with delay only between consecutive remote downloads.
					// Cached assets reset delay so cache-backed loading is never throttled.
					let displayUrl = info.url;
					if( !info.cached && !info.isVideo ) {
						if( shouldDelayBeforeRemoteDownload ) {
							//console.log(`Waiting 1.5s before downloading gallery image ${info.renderPosition}...`);
							await new Promise( resolve => setTimeout( resolve, 1500 ) );
						}
						//console.log(`Downloading gallery image ${info.renderPosition}/${imageInfo.length}`);
						displayUrl = await downloadAndCache( info.originalUrl, info.linkUrl || info.originalUrl );
						shouldDelayBeforeRemoteDownload = true;
					} else if( info.cached ) {
						//console.log( `Gallery image ${info.renderPosition} loaded from cache` );
						shouldDelayBeforeRemoteDownload = false;
					} else {
						shouldDelayBeforeRemoteDownload = false;
					}

					let imageHtml = '';
					if( info.isVideo ) {
						const mp4Url = info.url.replace( /\.webm$/, '.mp4' );
						imageHtml = `
								<div class="image-card" data-favorite-loaded="0" data-favorite="0" data-workflow-loaded="0" data-workflow-present="0" data-workflow-null="0" data-workflow-id="" data-workflow-revision="" style="flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: flex-start;">
									<video style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block; cursor: pointer;"
												 playsinline loop muted autoplay
												 onclick="this.requestFullscreen()">
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
												 style="max-width: ${thumbnailSize}px; max-height: ${thumbnailSize}px; width: auto; height: auto; border-radius: 4px; border: 1px solid #444; display: block;"
												 loading="lazy">
									</a>
									<label style="margin-top: 6px; font-size: 11px; color: #cfd8dc; display: flex; align-items: center; gap: 6px;">
										<input type="checkbox" class="favorite-checkbox" data-image-id="${imageId || ''}" data-image-filename="${escapeHtml( imageFilename )}" onchange="toggleImageFavorite(this)">
										Favorite
									</label>
									<div class="workflow-actions" style="margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
										<button type="button" class="workflow-copy-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" onclick="copyImageWorkflow(this)" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Copy Workflow</button>
										<button type="button" class="workflow-analyze-btn" data-image-id="${imageId || ''}" data-image-page-url="${escapeHtml( info.linkUrl || info.originalUrl )}" data-full-image-url="${escapeHtml( info.originalUrl || '' )}" onclick="analyzeImageWorkflow(this)" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Analyze Workflow</button>
									</div>
									<div class="workflow-no-workflow" style="margin-top: 6px; font-size: 11px; color: #bf4547; display: none;">No Workflow</div>
									<textarea class="generation-preview generation-params-preview" readonly style="margin-top: 6px; width: 100%; min-height: 42px; background: #1f1f1f; color: #cfd8dc; border: 1px solid #444; border-radius: 4px; padding: 6px; font-size: 11px; line-height: 1.35; white-space: pre-wrap; resize: none; overflow: hidden; box-sizing: border-box;">Loading parameters...</textarea>
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
						const paramsField = card ? card.querySelector( '.generation-params-preview' ) : null;
						const promptField = card ? card.querySelector( '.generation-prompt-preview' ) : null;
						const favoriteCheckbox = card ? card.querySelector( '.favorite-checkbox' ) : null;
						syncCopyAllPreviewWidth( card );
						applyGenerationPreviewVisibility();
						applyImageCardFilters();
						queueCopyAllPreviewHydration( paramsField, promptField, favoriteCheckbox, info.linkUrl || info.originalUrl, imageLoadToken, {
							modelId: currentModelId,
							modelVersionId: currentVersionId,
							imageFilename: extractFilenameFromUrl( displayUrl )
						} );
					}

					// Update counter based on actual number of images in container
					const galleryCountEl = document.getElementById( 'galleryCount' );
					if( galleryCountEl ) {
						galleryCountEl.textContent = String( renderedCount );
					}
				}

				//console.log( `Gallery loading complete: ${container.children.length} images added` );
				container.dataset.loading = 'false';
				setStatus( 'galleryStatus', `(${renderedCount})`, true );
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

// Escape HTML special characters
function escapeHtml( text ) {
	const div = document.createElement( 'div' );
	div.textContent = text;
	return div.innerHTML;
}


// Toggle tag selection
function toggleTag( element ) {
	const tag = element.getAttribute( 'data-tag' );

	if( activeTags.has( tag ) ) {
		activeTags.delete( tag );
		element.classList.remove( 'active' );
	} else {
		activeTags.add( tag );
		element.classList.add( 'active' );
	}

	console.log( 'Active tags:', Array.from( activeTags ) );
	updateSidebarHighlighting();
}


// Update sidebar to show only loras that match all active tags
async function updateSidebarHighlighting() {
	if( activeTags.size === 0 ) {
		// No tags selected - show all loras
		document.querySelectorAll( '#lorasList .file-item' ).forEach( item => {
			item.classList.remove( 'hidden' );
		} );
		return;
	}

	try {
		// Fetch tag information for all models from database
		const response = await fetch( 'api/get_model_tags.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { tags: Array.from( activeTags ) } )
		} );

		const result = await response.json();

		if( result.success && result.matchingModels ) {
			// Get all lora file items
			const fileItems = document.querySelectorAll( '#lorasList .file-item' );

			fileItems.forEach( item => {
				const modelId = item.getAttribute( 'data-model' );
				const versionId = item.getAttribute( 'data-version' );

				// Check if this model matches all active tags
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


// Handle Enter key on filename edit
function handleFilenameKeydown( event, element ) {
	if( event.key === 'Enter' ) {
		event.preventDefault();
		element.blur(); // Trigger save
	}
}


function handleOriginalFilenameKeydown( event, element ) {
	if( event.key === 'Enter' ) {
		event.preventDefault();
		element.blur();
	}
}


// Save renamed filename
async function saveFilename( element, options = {} ) {
	const allowMissingFile = options.allowMissingFile === true;
	let newFilename = element.textContent.trim();
	let originalFilename = element.getAttribute( 'data-original' );
	const originalDownloadFilename = element.getAttribute( 'data-original-file' ) || '';

	// Strip .safetensors extension if user added it
	if( newFilename.endsWith( '.safetensors' ) ) {
		newFilename = newFilename.substring( 0, newFilename.length - 12 );
	}
	if( originalFilename.endsWith( '.safetensors' ) ) {
		originalFilename = originalFilename.substring( 0, originalFilename.length - 12 );
	}

	// If filename hasn't changed, do nothing
	if( newFilename === originalFilename ) {
		return;
	}

	// Validate filename (must not be empty)
	if( !newFilename ) {
		alert( 'Invalid filename. Cannot be empty.' );
		element.textContent = originalFilename;
		return;
	}

	try {
		// Call API to rename file and update database
		// API will add .safetensors extension automatically
		const renameData = {
			oldFilename: originalFilename,
			newFilename: newFilename,
			originalDownloadFilename,
			modelId: currentModelIdForDb || null,
			versionId: currentVersionId || null,
			baseModel: currentBaseModel || null,
			allowMissingFile
		};

		console.log( 'Renaming file with data:', renameData );

		const response = await fetch( 'api/rename_model.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( renameData )
		} );

		const result = await response.json();
		console.log( 'Rename result:', result );

		if( result.success ) {
			// Update stored filename
			currentFilename = newFilename;
			element.setAttribute( 'data-original', newFilename );

			if( result.warning ) {
				alert( result.warning );
			}

			// Refresh the sidebar to show new filename (preserve folder states)
			await Promise.all( [
				loadLoras( true ),
				loadCheckpoints( true )
			] );

			console.log( 'Filename updated successfully' );
		} else {
			alert( 'Error renaming file: ' + ( result.error || 'Unknown error' ) );
			element.textContent = originalFilename;
		}
	} catch( error ) {
		console.error( 'Error renaming file:', error );
		alert( 'Error renaming file: ' + error.message );
		element.textContent = originalFilename;
	}
}


async function saveOriginalFilename( element ) {
	const originalValue = element.getAttribute( 'data-original' ) || '';
	const newValue = element.textContent.trim();

	if( newValue === originalValue ) {
		return;
	}

	if( !currentVersionId ) {
		alert( 'Cannot update original filename: version is missing.' );
		element.textContent = originalValue;
		return;
	}

	try {
		const response = await fetch( 'api/update_original_filename.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				modelId: currentModelIdForDb,
				versionId: currentVersionId,
				originalFilename: newValue
			} )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		const savedValue = result.originalFilename || '';
		currentOriginalFilename = savedValue;
		element.textContent = savedValue;
		element.setAttribute( 'data-original', savedValue );

		console.log( 'Original filename updated:', {
			modelId: currentModelIdForDb,
			versionId: currentVersionId,
			originalFilename: savedValue
		} );
	} catch( error ) {
		console.error( 'Error updating original filename:', error );
		alert( 'Error updating original filename: ' + error.message );
		element.textContent = originalValue;
	}
}


async function saveSettingsField( element, field, setId = null ) {
	const allowedFields = [ 'name', 'cfg', 'steps', 'clip_skip', 'positive', 'negative' ];
	if( !allowedFields.includes( field ) ) {
		return;
	}

	const parsedSetId = Number.isInteger( Number( setId ) ) && Number( setId ) > 0
		? Number( setId )
		: ( Number.isInteger( Number( element.getAttribute( 'data-set-id' ) ) ) && Number( element.getAttribute( 'data-set-id' ) ) > 0
			? Number( element.getAttribute( 'data-set-id' ) )
			: 1 );

	const originalValue = element.getAttribute( 'data-original' ) || '';
	const rawValue = element.textContent;
	const trimmedValue = rawValue.trim();
	const newValue = field === 'name' || field === 'clip_skip' || field === 'cfg' || field === 'steps' ? trimmedValue : rawValue;

	if( newValue === originalValue ) {
		return;
	}

	if( !currentVersionId ) {
		alert( 'Cannot update settings: version is missing.' );
		element.textContent = originalValue;
		return;
	}

	let payload = {
		versionId: currentVersionId,
		setId: parsedSetId,
		field,
		value: newValue
	};

	let cfgParsed = null;
	let stepsParsed = null;
	if( field === 'cfg' ) {
		cfgParsed = parseCfg( newValue );
		if( !cfgParsed ) {
			alert( 'cfg must contain at least one number (example: 7 or 3 to 9).' );
			element.textContent = originalValue;
			return;
		}

		if( cfgParsed.outOfRange ) {
			alert( 'cfg values must be between 0 and 100.' );
			element.textContent = originalValue;
			return;
		}

		payload = {
			versionId: currentVersionId,
			setId: parsedSetId,
			field,
			cfgMin: cfgParsed.cfgMin,
			cfgMax: cfgParsed.cfgMax
		};
	} else if( field === 'steps' ) {
		stepsParsed = parseSteps( newValue );
		if( !stepsParsed ) {
			alert( 'steps must contain at least one integer (example: 20 or 20 to 35).' );
			element.textContent = originalValue;
			return;
		}

		if( stepsParsed.notInteger ) {
			alert( 'steps values must be integers.' );
			element.textContent = originalValue;
			return;
		}

		if( stepsParsed.outOfRange ) {
			alert( 'steps values must be between 1 and 10000.' );
			element.textContent = originalValue;
			return;
		}

		payload = {
			versionId: currentVersionId,
			setId: parsedSetId,
			field,
			stepsMin: stepsParsed.stepsMin,
			stepsMax: stepsParsed.stepsMax
		};
	}

	if( field === 'clip_skip' && newValue !== '' ) {
		if( !/^\d+$/.test( newValue ) ) {
			alert( 'clip_skip must be a whole number from 0 to 11.' );
			element.textContent = originalValue;
			return;
		}

		const numeric = parseInt( newValue, 10 );
		if( numeric < 0 || numeric > 11 ) {
			alert( 'clip_skip must be between 0 and 11.' );
			element.textContent = originalValue;
			return;
		}
	}

	if( field === 'name' && newValue.length > 64 ) {
		alert( 'name must be 64 characters or fewer.' );
		element.textContent = originalValue;
		return;
	}

	try {
		const response = await fetch( 'api/update_settings.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( payload )
		} );

		const result = await response.json();
		if( !response.ok || !result.success ) {
			throw new Error( result.error || `HTTP ${response.status}` );
		}

		const savedValue = field === 'cfg'
			? formatMinMaxRange( result.cfgMin ?? null, result.cfgMax ?? null )
			: ( field === 'steps'
				? formatMinMaxRange( result.stepsMin ?? null, result.stepsMax ?? null )
				: ( result.value ?? '' ) );
		const savedText = savedValue === null ? '' : String( savedValue );
		element.textContent = savedText;
		element.setAttribute( 'data-original', savedText );
		element.setAttribute( 'data-set-id', String( result.setId ?? parsedSetId ) );

		const updatedSet = result.settingsSet
			? result.settingsSet
			: null;

		if( updatedSet ) {
			upsertCurrentSettingsSet( updatedSet );
		}
	} catch( error ) {
		console.error( `Error updating ${field}:`, error );
		alert( `Error updating ${field}: ` + error.message );
		element.textContent = originalValue;
	}
}


// Reset filename to original filename from Civitai
async function resetFilename() {
	const filenameElement = document.querySelector( '.editable-filename' );
	if( !filenameElement ) {
		alert( 'Filename element not found' );
		return;
	}

	const originalFile = filenameElement.getAttribute( 'data-original-file' );
	if( !originalFile ) {
		alert( 'Original filename not available' );
		return;
	}

	// Strip .safetensors extension from original filename
	let originalFilename = originalFile;
	if( originalFilename.endsWith( '.safetensors' ) ) {
		originalFilename = originalFilename.substring( 0, originalFilename.length - 12 );
	}

	const currentName = filenameElement.textContent.trim();

	// If already matches, do nothing
	if( currentName === originalFilename ) {
		alert( 'Filename is already set to the original' );
		return;
	}

	if( !confirm( `Reset filename from "${currentName}" to "${originalFilename}"?` ) ) {
		return;
	}

	// Set the text content
	filenameElement.textContent = originalFilename;

	// Trigger the save
	await saveFilename( filenameElement, { allowMissingFile: true } );
}
