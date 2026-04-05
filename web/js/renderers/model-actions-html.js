import { AppState } from '../app-context.js';
import { escapeHtml } from '../dom-utils.js';
import { buildSettingsTablesHtml } from '../settings-ui.js';

export function buildModelTagsHtml( modelTags ) {
	let modelTagsHtml = '';

	modelTags.forEach( tag => {
		const activeClass = AppState.settings.activeTags.has( tag ) ? ' active' : '';
		modelTagsHtml += `<div class="model-tag${activeClass}" data-tag="${escapeHtml( tag )}">${escapeHtml( tag )}</div>`;
	} );

	return modelTagsHtml;
}

export function buildVersionLinksHtml( modelVersions, selectedVersionId ) {
	let versionLinksHtml = '';

	modelVersions.forEach( version => {
		if( version.id && version.modelId && version.name ) {
			const modelVersionString = `${version.modelId}?modelVersionId=${version.id}`;
			const activeClass = selectedVersionId === version.id ? ' active' : '';
			versionLinksHtml += `<div class="version-link${activeClass}" data-model-version="${escapeHtml( modelVersionString )}">${escapeHtml( version.name )}</div>`;
		}
	} );

	return versionLinksHtml;
}

export function buildVersionInfoHtml( { result, version, modelType, safetensorsFile, trainedWords } ) {
	return `
		<div class="info success">
			<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
				<div class="editable-filename" contenteditable="true" data-original="${escapeHtml( AppState.model.currentFilename || '' )}" data-original-file="${escapeHtml( safetensorsFile || '' )}" style="flex: 1;">${escapeHtml( AppState.model.currentFilename || 'Unknown' )}</div>
				<button class="reset-filename-btn" data-action="reset-filename" style="padding: 8px 16px; background: #f39c12; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; white-space: nowrap;">Reset</button>
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
				${AppState.model.currentModelExistsInDb ? `
				<tr>
					<td>Original Filename (DB)</td>
					<td class="filename editable-original-filename" contenteditable="true" data-original="${escapeHtml( safetensorsFile || '' )}" style="outline: none; border-bottom: 1px dashed #666; cursor: text;">${escapeHtml( safetensorsFile || '' )}</td>
				</tr>` : ( safetensorsFile ? `
				<tr>
					<td>Original Filename (Civitai)</td>
					<td class="filename" style="color: #8fd19e;">${escapeHtml( safetensorsFile )}</td>
				</tr>` : '' )}
			</table>
			<div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
				<strong>Settings</strong>
			</div>
			<div id="settingsTablesContainer">${buildSettingsTablesHtml( AppState.settings.currentSettingsSets, true )}</div>
			${AppState.model.currentModelExistsInDb ? '<div style="display: flex; justify-content: flex-end; margin-top: 10px;"><button id="addSettingsSetBtn" data-action="add-settings-set" style="padding: 4px 10px; font-size: 12px;">Add set</button></div>' : ''}
		</div>
	`;
}

export function buildTrpcDescriptionHtml( trpcDescription ) {
	if( !trpcDescription ) {
		return '';
	}

	return `
		<div class="info">
			<div style="margin-top: 8px;">${trpcDescription}</div>
		</div>
	`;
}

export function buildVersionSelectionWarningHtml( versionSelectionMethod ) {
	if( !versionSelectionMethod ) {
		return '';
	}

	return `
		<div class="info warning">
			<strong>Model Version Selection:</strong><br>
			${escapeHtml( versionSelectionMethod )}
		</div>
	`;
}

export function buildCacheInfoSectionHtml() {
	return `
		<div class="info" style="background: #1e1e2e; border: 1px solid #333;">
			<div id="cacheInfo" style="display: flex; gap: 20px; align-items: center; font-size: 13px;">
				<span style="color: #888;">Loading cache info...</span>
			</div>
		</div>
	`;
}

export function buildThumbnailControlsSectionHtml() {
	return `
		<div class="info" style="background: #1e1e2e; border: 1px solid #333; padding: 10px 15px;">
			<label style="display: flex; align-items: center; gap: 10px; font-size: 13px;">
				<strong>Thumbnail Size:</strong>
				<select id="thumbnailSize" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer;">
					<option value="150">150px</option>
					<option value="300">300px</option>
					<option value="450">450px</option>
				</select>
			</label>
		</div>
	`;
}

export function buildImagesSectionHtml() {
	return `
		<div class="info">
			<div style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
				<button type="button" id="generationToggleParamsBtn" data-toggle-type="params" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Params</button>
				<button type="button" id="generationTogglePromptsBtn" data-toggle-type="prompts" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Prompts</button>
				<button type="button" id="generationToggleNonWorkflowBtn" data-toggle-type="non-workflow" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Non-Workflow</button>
				<button type="button" id="generationToggleNonFavoritesBtn" data-toggle-type="non-favorites" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Non-Favorites</button>
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

		<div class="info">
			<strong>Gallery Images <span id="galleryStatus">(loading...)</span></strong>
			<div id="galleryContainer" style="display: flex; flex-wrap: wrap; gap: 15px; margin-top: 15px;"></div>
		</div>
	`;
}

export function buildWorkflowAnalysisSectionHtml() {
	return `
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
}

export function buildFetchDataHtml( { result, selectedVersion, modelType, trpcDescription, safetensorsFile, trainedWords } ) {
	let html = '';

	if( selectedVersion ) {
		html += buildVersionInfoHtml( {
			result,
			version: selectedVersion,
			modelType,
			safetensorsFile,
			trainedWords
		} );
		html += buildTrpcDescriptionHtml( trpcDescription );
	} else {
		html += buildVersionSelectionWarningHtml( result.versionSelectionMethod );
	}

	html += buildCacheInfoSectionHtml();
	html += buildThumbnailControlsSectionHtml();
	html += buildImagesSectionHtml();
	html += buildWorkflowAnalysisSectionHtml();

	return html;
}