import { setModelClickHandler, loadCheckpoints, loadLoras } from './sidebar.js';
import { loadModelFromSidebar } from './model-loading.js';
import { AppState, modelInput, sourceBtn, output } from './app-context.js';
import { fetchData } from './model-actions.js';
import { addModelToDatabase } from './db-sync.js';


/** Initialize application by setting up event handlers and loading initial data */
async function initializeApp() {

	// Set click handler for files in sidebar to load models
	setModelClickHandler( loadModelFromSidebar );

	// Set event listener for [modelInput] field on [Enter]
	if( modelInput ) {
		modelInput.addEventListener( 'keydown', ( e ) => {
			if( e.key === 'Enter' ) {
				fetchData();
			}
		} );
	}

	// Set event listener for [Source] button
	if( sourceBtn && modelInput ) {
		sourceBtn.addEventListener( 'click', () => {
			const sourceUrl = buildSourceUrl( modelInput.value );
			if( !sourceUrl ) {
				alert( 'Please enter a valid Civitai model ID or URL.' );
				return;
			}
			window.open( sourceUrl, '_blank', 'noopener,noreferrer' );
		} );
	}

	// Set event listener for [Add to Database] button
	const addToDbBtn = document.getElementById( 'addToDbBtn' );
	if( addToDbBtn ) {
		addToDbBtn.addEventListener( 'click', () => {
			if( AppState.model.currentModelIdForDb && AppState.model.currentSelectedVersion ) {
				addModelToDatabase( AppState.model.currentModelIdForDb, AppState.model.currentSelectedVersion );
			} else {
				console.error( 'No model data stored for [Add to Database]' );
			}
		} );
	} else {
		console.error( '[Add to Database] button not found during initialization' );
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

	let modelId					= null;
	let modelVersionId	= null;

	// Support shorthand inputs like:
	// - 847101
	// - 847101?modelVersionId=1605769
	// - 847101/fluxed-up-flux-nsfw-checkpoint?modelVersionId=1605769
	const shorthandMatch = value.match( /^(\d+)(?:\/[^?\s]*)?(?:\?(.*))?$/ );
	if( shorthandMatch ) {
		modelId					= shorthandMatch[1] || null;
		const rawQuery	= shorthandMatch[2] || '';
		if( rawQuery ) {
			const params		= new URLSearchParams( rawQuery );
			modelVersionId	= params.get( 'modelVersionId' ) || null;
		}
	}

	// If not a shorthand input, try to parse as a full URL
	if( !modelId ) {
		try {
			const parsed = value.startsWith( 'http://' ) || value.startsWith( 'https://' )
				? new URL( value )
				: new URL( `https://civitai.red/models/${value.replace( /^\/+/, '' )}` );

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
	return `https://civitai.red/models/${encodeURIComponent( modelId )}${versionQuery}`;
}

// Add error handling for initialization
initializeApp().catch( error => {
	console.error( 'App initialization failed:', error );
	if( output ) {
		output.innerHTML = `<div class="error">Initialization failed: ${String( error.message || error )}</div>`;
	}
} );
