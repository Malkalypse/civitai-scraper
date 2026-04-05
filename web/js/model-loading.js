import { AppState, modelIdInput } from './app-context.js';
import { fetchData } from './model-actions.js';

export function loadModelVersion( modelVersionString ) {
	AppState.model.currentFilename = null;
	modelIdInput.value = modelVersionString;
	fetchData();
}

/** Load specific model version when a version link is clicked
 * @param {*} element
 */
export function loadModelFromFile( element ) {

	// Get model ID, version ID, and base model from clicked element
	const modelId   = element.getAttribute( 'data-model' );
	const versionId = element.getAttribute( 'data-version' );
	const baseModel = element.getAttribute( 'data-folder' );

	// Get the filename
	let filename = element.textContent.trim();
	if( filename.endsWith( '.safetensors' ) ) {
		filename = filename.substring( 0, filename.length - 12 );
	}

	// Update AppState with the new model information
	AppState.model.currentFilename      = filename;
	AppState.model.currentVersionId     = versionId ? parseInt( versionId ) : null;
	AppState.model.currentModelIdForDb  = modelId ? parseInt( modelId ) : null;
	AppState.model.currentBaseModel     = baseModel;

	// Load model version based on clicked element data attributes
	if( modelId ) {
		if( versionId ) {
			modelIdInput.value = modelId + '?modelVersionId=' + versionId;
		} else {
			modelIdInput.value = modelId;
		}
		fetchData( { preserveFilename: true } );
	} else {
		console.error( 'No model ID found for this file' );
	}
}
