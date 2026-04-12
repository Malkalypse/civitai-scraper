/**
 * Dormant legacy module for settings UI rendering and interaction logic
 * Not currently used
 * Mmy be reactivated in the future if needed
 */

import { AppState, output } from './app-context.js';
import { renderSettingsTablesHtml } from './renderers/settings-ui-html.js';

export function formatMinMaxRange( minVal, maxVal ) {
	if( minVal == null || maxVal == null || minVal === '' || maxVal === '' ) {
		return '';
	}

	const min = Number( minVal );
	const max = Number( maxVal );

	if( Number.isNaN( min ) || Number.isNaN( max ) ) {
		return '';
	}

	if( min === max ) {
		return String( min );
	}

	return `${min} to ${max}`;
}

export function parseRange( value, { allowDecimal = true, minValue = null, maxValue = null } = {} ) {
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

export function parseCfg( value ) {
	const parsed = parseRange( value, {
		allowDecimal: true,
		minValue: 0,
		maxValue: 100
	} );

	if( !parsed || parsed.outOfRange || parsed.notInteger ) {
		return parsed;
	}

	return {
		cfgMin: parsed.min,
		cfgMax: parsed.max,
		display: parsed.display
	};
}

export function parseSteps( value ) {
	const parsed = parseRange( value, {
		allowDecimal: false,
		minValue: 1,
		maxValue: 10000
	} );

	if( !parsed || parsed.outOfRange || parsed.notInteger ) {
		return parsed;
	}

	return {
		stepsMin: parsed.min,
		stepsMax: parsed.max,
		display: parsed.display
	};
}

export function normalizeSettingsSets( settingsSets, ensureDefault = false ) {
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

export function buildSettingsTablesHtml( settingsSets, ensureDefault = true ) {
	const normalizedSets = normalizeSettingsSets( settingsSets, ensureDefault );

	return renderSettingsTablesHtml( normalizedSets, AppState.settings.currentSettingsShowAll, formatMinMaxRange );
}

function initializeSettingsUiEventHandlers() {
	if( !output || initializeSettingsUiEventHandlers.initialized ) {
		return;
	}

	output.addEventListener( 'click', ( event ) => {
		const toolsCell = event.target.closest( '[data-action="open-settings-tools-select"]' );
		if( toolsCell && output.contains( toolsCell ) ) {
			openSettingsToolsSelect( toolsCell, toolsCell.dataset.toolType, toolsCell.dataset.setId );
		}
	} );

	output.addEventListener( 'change', ( event ) => {
		const showAllToggle = event.target.closest( '[data-action="toggle-settings-show-all"]' );
		if( showAllToggle && output.contains( showAllToggle ) ) {
			toggleSettingsShowAll( showAllToggle.dataset.setId, showAllToggle.checked );
		}
	} );

	output.addEventListener( 'focusout', ( event ) => {
		const header = event.target.closest( '.editable-settings-header' );
		if( header && output.contains( header ) ) {
			saveSettingsHeaderName( header, header.dataset.setId );
			return;
		}

		const editableField = event.target.closest( '.editable-settings-value[contenteditable="true"]' );
		if( editableField && output.contains( editableField ) && editableField.dataset.field ) {
			saveSettingsField( editableField, editableField.dataset.field, editableField.dataset.setId );
		}
	} );

	initializeSettingsUiEventHandlers.initialized = true;
}

export function toggleSettingsShowAll( setId, enabled ) {
	const numericSetId = Number( setId );
	if( !Number.isInteger( numericSetId ) || numericSetId <= 0 ) {
		return;
	}

	AppState.settings.currentSettingsShowAll[numericSetId] = enabled === true;
	renderSettingsTables();
}

export function upsertCurrentSettingsSet( incomingSet ) {
	const normalizedIncoming = normalizeSettingsSets( [ incomingSet ], false )[0];
	if( !normalizedIncoming ) {
		return;
	}

	const existingIndex = AppState.settings.currentSettingsSets.findIndex( setRow => setRow.setId === normalizedIncoming.setId );
	if( existingIndex >= 0 ) {
		AppState.settings.currentSettingsSets[existingIndex] = {
			...AppState.settings.currentSettingsSets[existingIndex],
			...normalizedIncoming
		};
	} else {
		AppState.settings.currentSettingsSets.push( normalizedIncoming );
		AppState.settings.currentSettingsSets.sort( ( a, b ) => a.setId - b.setId );
	}
}

export function getSettingsSetById( setId ) {
	const numericSetId = Number( setId );
	if( !Number.isInteger( numericSetId ) || numericSetId <= 0 ) {
		return null;
	}

	return AppState.settings.currentSettingsSets.find( setRow => setRow.setId === numericSetId ) || null;
}

export function openSettingsToolsSelect( cell, type, setId ) {
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

	const options = type === 'sampler' ? AppState.settings.currentSamplerOptions : AppState.settings.currentSchedulerOptions;
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

export async function saveSettingsToolsSelection( cell, type, setId, selectedIds, originalDisplay ) {
	if( !AppState.model.currentVersionId ) {
		alert( `Cannot update ${type}s: version is missing.` );
		cell.textContent = originalDisplay;
		cell.dataset.editing = 'false';
		return;
	}

	try {
		const response = await fetch( 'api/settings/update_version_tools.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				versionId: AppState.model.currentVersionId,
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

export async function saveSettingsHeaderName( element, setId ) {
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

	if( !AppState.model.currentVersionId ) {
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
		const response = await fetch( 'api/settings/update_settings.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				versionId: AppState.model.currentVersionId,
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

export function renderSettingsTables() {
	const container = document.getElementById( 'settingsTablesContainer' );
	if( !container ) {
		return;
	}

	container.innerHTML = buildSettingsTablesHtml( AppState.settings.currentSettingsSets, true );
}

export async function addSettingsSet() {
	if( !AppState.model.currentVersionId ) {
		alert( 'Cannot add settings set: version is missing.' );
		return;
	}

	const addBtn = document.getElementById( 'addSettingsSetBtn' );
	if( addBtn ) {
		addBtn.disabled = true;
		addBtn.textContent = 'Adding...';
	}

	try {
		const response = await fetch( 'api/settings/create_settings_set.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				versionId: AppState.model.currentVersionId
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

export async function saveSettingsField( element, field, setId = null ) {
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

	if( !AppState.model.currentVersionId ) {
		alert( 'Cannot update settings: version is missing.' );
		element.textContent = originalValue;
		return;
	}

	let payload = {
		versionId: AppState.model.currentVersionId,
		setId: parsedSetId,
		field,
		value: newValue
	};

	if( field === 'cfg' ) {
		const cfgParsed = parseCfg( newValue );
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
			versionId: AppState.model.currentVersionId,
			setId: parsedSetId,
			field,
			cfgMin: cfgParsed.cfgMin,
			cfgMax: cfgParsed.cfgMax
		};
	} else if( field === 'steps' ) {
		const stepsParsed = parseSteps( newValue );
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
			versionId: AppState.model.currentVersionId,
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
		const response = await fetch( 'api/settings/update_settings.php', {
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

initializeSettingsUiEventHandlers();
