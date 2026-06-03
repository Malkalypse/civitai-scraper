/** Civitai sidebar — loads checkpoints and loras into the sidebar, with tag filtering.
 *
 * Extends the generic Melodeon package with civitai-specific data adaptation and tag filtering.
 */

import { Melodeon } from '../packages/melodeon/Melodeon.js';
import { AppState } from './app-context.js';


/** Recursively group files into an ordered entries array, preserving the position
 * at which each sub-category first appears among the files.
 * @param {Array}    files     Files with a `subfolder` string (e.g. "a/b/c") or null
 * @param {Function} makeItem  Converts a file to a sidebar item object
 * @returns {Array} Mixed array of item objects and sub-category objects
 */
function groupByPath( files, makeItem ) {
	const entries = [];
	const subMap  = {};

	for ( const file of files ) {
		const path = file.subfolder || '';
		if ( path === '' ) {
			entries.push( makeItem( file ) );
			continue;
		}
		const slashIdx = path.indexOf( '/' );
		const first    = slashIdx === -1 ? path : path.slice( 0, slashIdx );
		const rest     = slashIdx === -1 ? null  : path.slice( slashIdx + 1 ) || null;
		if ( !subMap[first] ) {
			subMap[first] = [];
			entries.push( first ); // placeholder — replaced in the map pass below
		}
		subMap[first].push( { ...file, subfolder: rest } );
	}

	return entries.map( entry =>
		typeof entry === 'string'
			? { label: entry, entries: groupByPath( subMap[entry], makeItem ) }
			: entry
	);
}

/** Adapts civitai API response shape to an arbitrarily-deep nested Sidebar hierarchy.
 *
 * API shape:  [{ folder, files: [{ name, modelId?, versionId?, exists?, subfolder? }] }]
 * Level 1:   Library label (e.g. "Checkpoints Library")
 * Level 2:   Base-model folder (e.g. "Pony")
 * Level 3+:  Disk subfolders (e.g. "Mature Citron", "Mature Citron/sub", …)
 * Items:     Model files
 */
class CivitaiSidebar extends Melodeon {

	#libraryLabel

	constructor( options ) {
		super( options );
		this.#libraryLabel = options.libraryLabel ?? '';
	}

	buildHTML( apiData, openCategories ) {
		const level2Categories = apiData.map( folder => {
			const makeItem = file => ( {
				label:   file.name,
				missing: file.exists === false,
				data:    {
					...( file.modelId   ? { model:   file.modelId   } : {} ),
					...( file.versionId ? { version: file.versionId } : {} ),
					folder: folder.folder
				}
			} );

			const entries = groupByPath( folder.files, makeItem );
			return { label: folder.folder, entries };
		} );

		const topLevel = this.#libraryLabel
			? [ { label: this.#libraryLabel, categories: level2Categories } ]
			: level2Categories;

		return super.buildHTML( topLevel, openCategories );
	}
}


const checkpointsSidebar = new CivitaiSidebar( { containerId: 'checkpointsList', libraryLabel: 'Checkpoints Library' } );
const lorasSidebar       = new CivitaiSidebar( { containerId: 'lorasList',       libraryLabel: 'Loras Library'       } );


export function setModelClickHandler( handler ) {
	checkpointsSidebar.setOnItemClick( handler );
	lorasSidebar.setOnItemClick( handler );
}

export async function loadCheckpoints( preserveState = false ) {
	await checkpointsSidebar.load( 'api/models/get_models.php?type=checkpoint', {
		preserveState,
		errorLabel: 'checkpoints'
	} );
}

export async function loadLoras( preserveState = false ) {
	await lorasSidebar.load( 'api/models/get_models.php?type=lora', {
		preserveState,
		errorLabel: 'loras'
	} );
}

export function toggleTag( element ) {
	const tag = element.getAttribute( 'data-tag' );
	if( AppState.filters.activeTags.has( tag ) ) {
		AppState.filters.activeTags.delete( tag );
		element.classList.remove( 'active' );
	} else {
		AppState.filters.activeTags.add( tag );
		element.classList.add( 'active' );
	}
	updateSidebarHighlighting();
}

export function toggleUserTag( element ) {
	const tag = element.getAttribute( 'data-tag' );
	if( AppState.filters.activeUserTags.has( tag ) ) {
		AppState.filters.activeUserTags.delete( tag );
		element.classList.remove( 'active' );
	} else {
		AppState.filters.activeUserTags.add( tag );
		element.classList.add( 'active' );
	}
	updateSidebarHighlighting();
}

export async function updateSidebarHighlighting() {
	const hasModelTags = AppState.filters.activeTags.size > 0;
	const hasUserTags  = AppState.filters.activeUserTags.size > 0;

	if( !hasModelTags && !hasUserTags ) {
		document.querySelectorAll( '.sidebar-item' ).forEach( item => {
			item.classList.remove( 'sidebar-item--hidden' );
		} );
		return;
	}

	try {
		const toKey = m => `${m.model_id}:${m.version_id}`;

		const [modelTagResult, userTagResult] = await Promise.all( [
			hasModelTags
				? fetch( 'api/tags/get_model_tags.php', {
					method:  'POST',
					headers: { 'Content-Type': 'application/json' },
					body:    JSON.stringify( { tags: Array.from( AppState.filters.activeTags ) } )
				} ).then( r => r.json() )
				: Promise.resolve( null ),
			hasUserTags
				? fetch( 'api/tags/user_tags.php', {
					method:  'POST',
					headers: { 'Content-Type': 'application/json' },
					body:    JSON.stringify( { action: 'filter', tags: Array.from( AppState.filters.activeUserTags ) } )
				} ).then( r => r.json() )
				: Promise.resolve( null )
		] );

		const modelTagKeys = modelTagResult?.matchingModels ? new Set( modelTagResult.matchingModels.map( toKey ) ) : null;
		const userTagKeys  = userTagResult?.matchingModels  ? new Set( userTagResult.matchingModels.map( toKey ) )  : null;

		document.querySelectorAll( '.sidebar-item' ).forEach( item => {
			const key = `${item.getAttribute( 'data-model' )}:${item.getAttribute( 'data-version' )}`;
			const matchesModelTags = !modelTagKeys || modelTagKeys.has( key );
			const matchesUserTags  = !userTagKeys  || userTagKeys.has( key );
			item.classList.toggle( 'sidebar-item--hidden', !( matchesModelTags && matchesUserTags ) );
		} );
	} catch( error ) {
		console.error( 'Error updating sidebar highlighting:', error );
	}
}

