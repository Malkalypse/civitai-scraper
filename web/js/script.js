import { AppState, modelIdInput, sourceBtn, output } from './app-context.js';
import './filters.js';
import './settings-ui.js';
import './image-cache.js';
import './workflow.js';
import './image-gallery.js';
import './file-editing.js';
import { loadCheckpoints, loadLoras, setmodelClickHandler } from './sidebar.js';
import { fetchData } from './model-actions.js';
import { loadModelFromFile } from './model-loading.js';
import { addModelToDatabase } from './db-sync.js';


/** Main application script: initializes the app, sets up event handlers, and loads initial data
 * This script is responsible for:
 * - Setting up the click handler for files in the sidebar to load models when clicked
 * - Handling the "Enter" key on the model ID input to trigger data fetching
 * - Handling the "Source" button click to open the model URL in a new tab
 * - Handling the "Add to Database" button click to add the current model to the database
 * - Loading initial data for sidebar libraries (checkpoints and Loras)
 */
async function initializeApp() {
	setmodelClickHandler( loadModelFromFile );

	if( modelIdInput ) {
		modelIdInput.addEventListener( 'keydown', ( e ) => {
			if( e.key === 'Enter' ) {
				fetchData();
			}
		} );
	}

	if( sourceBtn && modelIdInput ) {
		sourceBtn.addEventListener( 'click', () => {
			const sourceUrl = buildSourceUrl( modelIdInput.value );
			if( !sourceUrl ) {
				alert( 'Please enter a valid Civitai model ID or URL.' );
				return;
			}
			window.open( sourceUrl, '_blank', 'noopener,noreferrer' );
		} );
	}

	const addToDbBtn = document.getElementById( 'addToDbBtn' );
	if( addToDbBtn ) {
		addToDbBtn.addEventListener( 'click', () => {
			if( AppState.model.currentModelIdForDb && AppState.model.currentSelectedVersion ) {
				addModelToDatabase( AppState.model.currentModelIdForDb, AppState.model.currentSelectedVersion );
			} else {
				console.error( 'No model data stored for Add to Database' );
			}
		} );
	} else {
		console.error( 'Add to Database button not found during initialization' );
	}

  // Load initial data for sidebar libraries
	await loadCheckpoints();
	await loadLoras();
}

/** Build a Civitai model URL from user input, which can be either a plain model ID or a full URL
 * @param {string} rawInput the user input to parse
 * @returns {string|null} the constructed URL or null if the input is invalid
 */
function buildSourceUrl( rawInput ) {
	const value = String( rawInput || '' ).trim();
	if( !value ) {
		return null;
	}

	let modelId = null;
	let modelVersionId = null;

	// Accept both plain IDs and full civitai model URLs.
	const idMatch = value.match( /(?:https?:\/\/civitai\.com\/models\/)?(\d+)(?:\?modelVersionId=(\d+))?/i );
	if( idMatch ) {
		modelId = idMatch[1] || null;
		modelVersionId = idMatch[2] || null;
	}

	if( !modelId ) {
		try {
			const parsed = new URL( value );
			const pathMatch = parsed.pathname.match( /\/models\/(\d+)/i );
			if( pathMatch ) {
				modelId = pathMatch[1];
				modelVersionId = parsed.searchParams.get( 'modelVersionId' ) || null;
			}
		} catch( error ) {
			return null;
		}
	}

	if( !modelId ) {
		return null;
	}

	const versionQuery = modelVersionId ? `?modelVersionId=${encodeURIComponent( modelVersionId )}` : '';
	return `https://civitai.com/models/${encodeURIComponent( modelId )}${versionQuery}`;
}

initializeApp().catch( error => {
	console.error( 'App initialization failed:', error );
	if( output ) {
		output.innerHTML = `<div class="error">Initialization failed: ${String( error.message || error )}</div>`;
	}
} );
