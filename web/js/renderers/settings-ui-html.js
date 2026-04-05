import { escapeHtml } from '../dom-utils.js';

function rowVisibilityStyle( value, showAll ) {
	if( showAll ) {
		return '';
	}

	return String( value || '' ).trim() === '' ? ' style="display: none;"' : '';
}

export function renderSettingsTablesHtml( normalizedSets, currentSettingsShowAll, formatMinMaxRange ) {
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

		return `
			<div class="settings-table-wrap" data-set-id="${setId}">
				${hasAnyData ? `<div style="display: flex; justify-content: flex-end; margin: 6px 0 2px 0; font-size: 11px; color: #adb5bd;">
					<label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;">
						<input type="checkbox" ${showAll ? 'checked' : ''} data-action="toggle-settings-show-all" data-set-id="${setId}" style="width: 10px; height: 10px; margin: 0; vertical-align: middle;">
						<span>show all</span>
					</label>
				</div>` : ''}
			<table class="settings-table" data-set-id="${setId}">
				${hasMultipleSets ? `
				<thead>
					<tr>
						<th colspan="2" class="editable-settings-header" contenteditable="true" data-set-id="${setId}" data-original-name="${escapeHtml( nameDisplay )}" style="text-align: center; padding: 6px; border: 1px solid #373a40; background-color: #25262b; color: rgb(193, 194, 197); outline: none; cursor: text;">${escapeHtml( headerText )}</th>
					</tr>
				</thead>
				` : ''}
				<tbody>
				<tr${rowVisibilityStyle( samplerDisplay, showAll )}>
					<td>sampler(s)</td>
					<td class="editable-settings-value" data-action="open-settings-tools-select" data-set-id="${setId}" data-tool-type="sampler" style="outline: none; border-bottom: 1px dashed #666; cursor: pointer;">${escapeHtml( samplerDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( schedulerDisplay, showAll )}>
					<td>scheduler(s)</td>
					<td class="editable-settings-value" data-action="open-settings-tools-select" data-set-id="${setId}" data-tool-type="scheduler" style="outline: none; border-bottom: 1px dashed #666; cursor: pointer;">${escapeHtml( schedulerDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( cfgDisplay, showAll )}>
					<td>cfg</td>
					<td class="editable-settings-value" contenteditable="true" data-field="cfg" data-set-id="${setId}" data-original="${escapeHtml( cfgDisplay )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( cfgDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( stepsDisplay, showAll )}>
					<td>steps</td>
					<td class="editable-settings-value" contenteditable="true" data-field="steps" data-set-id="${setId}" data-original="${escapeHtml( stepsDisplay )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( stepsDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( clipSkipDisplay, showAll )}>
					<td>clip_skip</td>
					<td class="editable-settings-value" contenteditable="true" data-field="clip_skip" data-set-id="${setId}" data-original="${escapeHtml( clipSkipDisplay )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( clipSkipDisplay )}</td>
				</tr>
				<tr${rowVisibilityStyle( settingsSet.positive, showAll )}>
					<td>positive prompts</td>
					<td class="editable-settings-value" contenteditable="true" data-field="positive" data-set-id="${setId}" data-original="${escapeHtml( settingsSet.positive || '' )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text; white-space: pre-wrap;">${escapeHtml( settingsSet.positive || '' )}</td>
				</tr>
				<tr${rowVisibilityStyle( settingsSet.negative, showAll )}>
					<td>negative prompts</td>
					<td class="editable-settings-value" contenteditable="true" data-field="negative" data-set-id="${setId}" data-original="${escapeHtml( settingsSet.negative || '' )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text; white-space: pre-wrap;">${escapeHtml( settingsSet.negative || '' )}</td>
				</tr>
				</tbody>
			</table>
			</div>
		`;
	} ).join( '' );
}