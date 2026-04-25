/** Database synchronization functions for Civitai Scraper
 * - Handles syncing of model and tag data to local database via API endpoints
 * - Provides function to check if a model/version exists in database and update UI accordingly
 * - Expects certain structure in __NEXT_DATA__ from Civitai model pages for extracting tags and version info
 */

import { AppState } from './app-context.js';
import { loadLoras, loadCheckpoints } from './sidebar.js';


/** Add currently selected model/version to database
 * @param {number|string}	modelId					civitai model ID to add
 * @param {object}				selectedVersion currently selected version object
 * @returns {Promise<void>}
 */
export async function addModelToDatabase( modelId, selectedVersion ) {
	console.log( 'addModelToDatabase called with:', { modelId, versionId: selectedVersion?.id } );

	const addToDbBtn		= document.getElementById( 'addToDbBtn' );
	const addToDbStatus	= document.getElementById( 'addToDbStatus' );

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

	addToDbBtn.disabled				= true;
	addToDbStatus.textContent	= '⏳ Adding to database...';
	addToDbStatus.style.color	= '#868e96';

	try {
		const cacheBuster	= new Date().getTime();
		const response		= await fetch( `api/models/fetch_data.php?_=${cacheBuster}`, {
			method:		'POST',
			headers:	{
				'Content-Type':		'application/json',
				'Cache-Control':	'no-cache'
			},
			body:			JSON.stringify( { modelInput: modelId } )
		} );

		const result = await response.json();

		if( result.error || !result.data ) {
			throw new Error( result.error || 'Failed to fetch model data' );
		}

		let filename = await fetchOriginalFilename( selectedVersion.id );
		if( filename ) {
			console.log( `Using canonical download filename: ${filename}` );
		}

		if( !filename && AppState.model.currentFilename ) {
			filename = AppState.model.currentFilename.endsWith( '.safetensors' ) ? AppState.model.currentFilename : `${AppState.model.currentFilename}.safetensors`;
			console.log( `Using filename from sidebar: ${filename}` );
		}

		if( !filename ) {
			const modelName = selectedVersion.name || 'model';
			filename = `${modelName.replace( /[^a-zA-Z0-9_-]/g, '_' )}.safetensors`;
			console.log( `Generated fallback filename: ${filename}` );
		}

		await syncTagsToDatabase( result.data, modelId );
		await syncModelsToDatabase( result.data, modelId, filename, selectedVersion.id );

		addToDbStatus.textContent = '✅ Successfully added to database!';
		addToDbStatus.style.color = '#51cf66';

		await Promise.all( [
			loadLoras( true ),
			loadCheckpoints( true )
		] );

		setTimeout( () => {
			document.getElementById( 'addToDbSection' ).style.display = 'none';
		}, 3000 );

	} catch( error ) {
		console.error( 'Error adding to database:', error );
		addToDbStatus.textContent	= `❌ Error: ${error.message}`;
		addToDbStatus.style.color	= '#fa5252';
		addToDbBtn.disabled				= false;
	}
}

/** Fetch original filename for given model version ID from server
 * @param {number|string} versionId model version ID to fetch filename for
 * @returns {Promise<string>} original filename (or empty string)
 */
export async function fetchOriginalFilename( versionId ) {
	console.log( `Fetching canonical download filename for version ${versionId}` );

	try {
		const response = await fetch( 'api/models/get_version_filename.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { versionId } )
		} );

		const result = await response.json();
		if( result?.success && result?.filename ) {
			console.log( `Received filename "${result.filename}" from API for version ${versionId}` );
			return result.filename;
		}
	} catch( error ) {
		console.warn( `Could not resolve canonical filename for version ${versionId}:`, error );
	}

	return '';
}

/** Sync tags from fetched model data to database for given model ID	
 * @param {*} nextData	__NEXT_DATA__ object from model page
 * @param {*} modelId		model ID to sync tags for
 */
export async function syncTagsToDatabase( nextData, modelId ) {
	try {
		const tagsOnModels = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.tagsOnModels;

		if( !tagsOnModels || !Array.isArray( tagsOnModels ) || tagsOnModels.length === 0 ) {
			console.log( 'No tags found in __NEXT_DATA__' );
			return;
		}

		const numericModelId = parseInt( modelId.toString().match( /\d+/ )?.[0] || '0' );

		if( !numericModelId ) {
			console.error( 'Invalid model ID for tag sync:', modelId );
			return;
		}

		console.log( `Syncing ${tagsOnModels.length} tags for model ${numericModelId} to database...` );

		const response = await fetch( 'api/tags/sync_tags.php', {
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

/** Sync model version data to database for given model ID and version ID
 * @param {*}							nextData					__NEXT_DATA__ object from model page
 * @param {*}							modelId						model ID to sync
 * @param {string}				filename					filename to use for this version in database
 * @param {number|string}	clickedVersionId	version ID of clicked version
 */
export async function syncModelsToDatabase( nextData, modelId, filename, clickedVersionId ) {
	try {
		const modelVersions = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.modelVersions;
		const modelType = nextData?.props?.pageProps?.trpcState?.json?.queries?.[2]?.state?.data?.type;

		if( !modelVersions || !Array.isArray( modelVersions ) || modelVersions.length === 0 ) {
			console.log( 'No model versions found in __NEXT_DATA__' );
			return;
		}

		const targetVersion = modelVersions.find( v => v.id === clickedVersionId );
		if( !targetVersion ) {
			console.warn( `Clicked version ${clickedVersionId} not found in model versions` );
			return;
		}

		console.log( `Syncing version ${clickedVersionId} to database...` );

		const response = await fetch( 'api/models/sync_models.php', {
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


/** Check if currently selected model/version exists in database and update AppState accordingly
 * @param {number|string} modelId the model ID to check
 * @param {object} selectedVersion the currently selected version object (should contain at least an "id" property)
 * @returns {Promise<void>}
 */
export async function checkModelInDatabase( modelId, selectedVersion ) {
	if( !selectedVersion || !selectedVersion.id ) {
		console.log( 'No selectedVersion, skipping database check' );
		return;
	}

	try {
		const response = await fetch( 'api/models/check_model_exists.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { modelId: parseInt( modelId ), versionId: selectedVersion.id } )
		} );

		if( !response.ok ) {
			console.error( `HTTP error! status: ${response.status}` );
			return;
		}

		const result = await response.json();
		AppState.model.currentModelExistsInDb = result.success && result.exists === true;

		if( result.success && result.exists === true && result.filename ) {
			AppState.model.currentFilename = result.filename.endsWith( '.safetensors' )
				? result.filename.substring( 0, result.filename.length - 12 )
				: result.filename;
		}

		if( result.success && result.exists === true ) {
			AppState.model.currentOriginalFilename = result.originalFilename ?? null;
		} else {
			AppState.model.currentOriginalFilename = null;
		}

		if( result.success && result.exists === false ) {
			console.log( 'Model not in database - showing Add to Database button' );
			AppState.model.currentModelIdForDb = modelId;
			AppState.model.currentSelectedVersion = selectedVersion;
			console.log( 'Stored for Add to Database:', { modelId, versionId: selectedVersion.id } );

			const addToDbSection = document.getElementById( 'addToDbSection' );
			const addToDbBtn = document.getElementById( 'addToDbBtn' );
			const addToDbStatus = document.getElementById( 'addToDbStatus' );

			if( !addToDbSection || !addToDbBtn || !addToDbStatus ) {
				console.error( 'Button elements not found in DOM!' );
				return;
			}

			addToDbSection.style.display = 'block';
			addToDbStatus.textContent = '';
			addToDbBtn.disabled = false;
		} else if( !result.success ) {
			console.error( 'Unexpected result from check_model_exists.php:', result );
		}
	} catch( error ) {
		console.error( 'Error checking model in database:', error );
	}
}
