import { AppState } from '../app-context.js';
import { escapeHtml } from '../dom-utils.js';

/** Build HTML for model tags, applying "active" class to tags that are currently active in filters
 * @param {*} modelTags Array of tag strings to build HTML for
 * @returns {string} HTML string representing the model tags
 */
export function buildModelTagsHtml( modelTags ) {
	let modelTagsHtml = '';

	modelTags.forEach( tag => {

		const activeClass = AppState.filters.activeTags.has( tag )
			? ' active'
			: '';

		modelTagsHtml += `<div class="model-tag${
			activeClass
		}" data-tag="${
			escapeHtml( tag )
		}">${
			escapeHtml( tag )
		}</div>`;
	} );

	return modelTagsHtml;
}


/** Build complete HTML for model information and actions view
 * @param {Object} params									Parameters for building HTML
 * @param {Object} params.result					Result object containing model and version data
 * @param {Object} params.selectedVersion Currently selected version object
 * @param {string} params.modelType				Type of model
 * @param {string} params.trpcDescription Description from TRPC (if available)
 * @param {string} params.safetensorsFile Original filename from Civitai (if available)
 * @param {string} params.trainedWords		Comma-separated trigger words (if available)
 * @returns {string} Complete HTML string to render
 */
export function buildFetchDataHtml( {
	result,
	selectedVersion,
	modelType,
	trpcDescription,
	safetensorsFile,
	trainedWords
} ) {
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
	html += buildParametersAnalysisSectionHtml();
	html += buildWorkflowAnalysisSectionHtml();

	return html;
}

/** Build HTML for version links
 * @param {Array} modelVersions Array of model version objects
 * @param {number} selectedVersionId ID of the currently selected version
 * @returns {string} HTML string representing the version links
 * 
 * fetchData() > renderVersionLinks() > buildVersionLinksHtml()
 */
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

/** Build HTML for version information
 * @param {Object} params Parameters for building version info HTML
 * @param {Object} params.result Result object containing model and version data
 * @param {Object} params.version Currently selected version object
 * @param {string} params.modelType Type of model
 * @param {string} params.safetensorsFile Original filename from Civitai (if available)
 * @param {string} params.trainedWords Comma-separated trigger words (if available)
 * @returns {string} HTML string representing the version information
 */
export function buildVersionInfoHtml( {
	result,
	version,
	modelType,
	safetensorsFile,
	trainedWords
} ) {
	return `
		<div class="info success">
			<div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
				<div class="editable-filename" contenteditable="true" data-original="${escapeHtml( AppState.model.currentFilename || '' )}" data-original-filename="${escapeHtml( safetensorsFile || '' )}" style="flex: 1;">${escapeHtml( AppState.model.currentFilename || 'Unknown' )}</div>
				<button class="reset-filename-btn" data-action="reset-filename" style="padding: 8px 16px; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: bold; white-space: nowrap;">Reset</button>
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
		</div>
	`;
}

/** Build HTML for TRPC description
 * @param {string} trpcDescription TRPC description text
 * @returns {string} HTML string representing the TRPC description
 */
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

/** Build HTML for version selection warning
 * @param {string} versionSelectionMethod Version selection method text
 * @returns {string} HTML string representing the version selection warning
 */
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

/** Build HTML for cache info section
 * @returns {string} HTML string representing the cache info section
 */
export function buildCacheInfoSectionHtml() {
	return `
		<div class="info" style="background: #1e1e2e; border: 1px solid #333;">
			<div id="cacheInfo" style="display: flex; gap: 20px; align-items: center; font-size: 13px;">
				<span style="color: #888;">Loading cache info...</span>
			</div>
		</div>
	`;
}

/** Build HTML for thumbnail controls section
 * @returns {string} HTML string representing the thumbnail controls section
 */
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

/** Build HTML for images section
 * @returns {string} HTML string representing the images section
 */
export function buildImagesSectionHtml() {
	return `
		<div class="info">
			<div style="display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
				<button type="button" id="generationTogglePromptsBtn" data-toggle-type="prompts" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Prompts</button>
				<button type="button" id="generationToggleNonWorkflowBtn" data-toggle-type="non-workflow" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Non-Workflow</button>
				<button type="button" id="generationToggleNonFavoritesBtn" data-toggle-type="non-favorites" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Non-Favorites</button>
			</div>
			<div id="workflowFilterSection" style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;">
				<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
					<button type="button" id="scanWorkflowsBtn" data-action="scan-workflows" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Scan Workflows</button>
					<label for="scanWorkflowsRescan" style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #cfd8dc; cursor: pointer;">
						<input type="checkbox" id="scanWorkflowsRescan" style="margin: 0;">
						rescan
					</label>
				</div>
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

/** Build HTML for workflow analysis section
 * @returns {string} HTML string representing the workflow analysis section
 */
export function buildWorkflowAnalysisSectionHtml() {
	return `
		<div class="info" id="workflowAnalysisSection" style="display: none;">
			<strong id="workflowAnalysisTitle">Workflow Analysis</strong>
			<div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
				<button type="button" id="workflowToggleLinksBtn" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Links</button>
				<button type="button" id="workflowToggleTextBtn" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Hide Text</button>
			</div>
			<div id="workflowAnalysisNodeList" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;"></div>
			<div id="workflowJsonExportControls" style="display: none; margin-top: 10px;">
				<button type="button" id="workflowOutputJsonBtn" style="padding: 4px 8px; background: #2a2a3e; color: #fff; border: 1px solid #444; border-radius: 3px; cursor: pointer; font-size: 11px;">Output as JSON</button>
				<span id="workflowOutputJsonStatus" style="margin-left: 8px; color: #8aa0ae; font-size: 11px;"></span>
			</div>
		</div>
	`;
}

/** Build HTML for parameters analysis section
 * @returns {string} HTML string representing the parameters analysis section
 */
export function buildParametersAnalysisSectionHtml() {
	return `
		<div class="info" id="parametersAnalysisSection" style="display: none;">
			<strong id="parametersAnalysisTitle">Parameters Analysis</strong>
			<pre id="parametersAnalysisContent" style="margin-top: 10px; white-space: pre-wrap; word-break: break-word; background: #1f1f1f; color: #cfd8dc; border: 1px solid #444; border-radius: 4px; padding: 10px; max-height: 500px; overflow: auto;"></pre>
		</div>
	`;
}
