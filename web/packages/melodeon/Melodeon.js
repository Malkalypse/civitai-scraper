/** Generic collapsible sidebar with hierarchical categories and items.
 *
 * Data format expected by buildHTML():
 *   [{
 *     label:   string,
 *
 *     // Use `entries` to control display order of sub-categories and items:
 *     entries: [ ...items and/or sub-categories in display order... ]
 *     // An entry is a sub-category if it has `entries`, `categories`, or `items`;
 *     // otherwise it is a leaf item { label, data?, missing? }.
 *
 *     // Shorthand: `categories` + `items` renders all categories before all items:
 *     categories: [...recursive...],           // optional
 *     items:      [{ label, data?, missing? }] // optional
 *   }]
 *
 * Open-state tracking uses slash-joined label paths, e.g. "library/folder/subfolder".
 *
 * CSS classes emitted:
 *   .sidebar-cat, .sidebar-cat--level-N,
 *   .sidebar-cat-header, .sidebar-cat-header--level-N,
 *   .sidebar-cat-triangle, .sidebar-cat-body,
 *   .sidebar-item-list, .sidebar-item, .sidebar-item--missing, .sidebar-error
 *
 * Usage:
 *   const melodeon = new Melodeon({ containerId: 'myList', onItemClick: el => console.log(el) });
 *   await melodeon.load('api/data.php', { preserveState: true, errorLabel: 'items' });
 *
 * Extend this class and override buildHTML() to adapt a different API response shape.
*/

function escapeHtml( text ) {
	const div = document.createElement( 'div' );
	div.textContent	= text;
	return div.innerHTML;
}

export class Melodeon {

	#containerId
	#onItemClick

	/** Set container and item click handler
	 * @param {string} options.containerId ID of container element for category
	 * @param {function} [options.onItemClick] Click handler for items
	 */
	constructor( { containerId, onItemClick = null } ) {
		//console.log( `Initializing Melodeon sidebar for container #${ containerId }` );
		//console.log( `Item click handler: ${ typeof onItemClick === 'function' ? 'provided' : 'none' }` );

		this.#containerId = containerId;
		this.#onItemClick = typeof onItemClick === 'function'
			? onItemClick
			: null;
	}

	/** Update item click handler
	 * @param {function} handler New item click handler
	 */
	setOnItemClick( handler ) {
		//console.log( `Updating Melodeon item click handler: ${ handler.name }` );

		this.#onItemClick = typeof handler === 'function'
			? handler
			: null;
	}

	getContainer() {
		return document.getElementById( this.#containerId );
	}

	getOpenCategories() {
		return this.#readOpenCategories( this.getContainer() );
	}

	/** Fetch data from URL and render it into container
	 * @param {string}  url                     API endpoint returning { data: [...], error?: string }
	 * @param {boolean} [options.preserveState] Restore open/closed state after re-render
	 * @param {string}  [options.errorLabel]    Label shown in error fallback message
	 */
	async load(	url, { preserveState = false, errorLabel = 'items' } = {} ) {
		const container = this.getContainer(); // cache container reference
		if ( !container ) return;

		try {

			// If preserving state, read open categories before fetching new data 
			const openCategories = preserveState
				? this.#readOpenCategories( container )
				: new Set();

			// Fetch and parse new data from the API
			const response = await fetch( url );
			const result   = await response.json();

			// Handle API errors
			if ( result.error ) {
				container.innerHTML = `<div class="sidebar-error">${ escapeHtml( result.error ) }</div>`;
				return;
			}

			// Build HTML from fetched data and attach event handlers
			if ( result.data ) {
				container.innerHTML = this.buildHTML( result.data, openCategories );
				this.#attachEventHandlers( container );
			}

		// Handle fetch or parsing errors
		} catch {
			container.innerHTML = `<div class="sidebar-error">Error loading ${ escapeHtml( errorLabel ) }</div>`;
		}
	}

	/** Build HTML from hierarchical category data
	 * Override in subclasses to accept a different data shape — adapt and call super.buildHTML()
	 * @param {Array} categories     Array of { label, categories?, items?: [{ label, data?, missing? }] }
	 * @param {Set}   openCategories Set of path strings for categories that should render open
	 * @returns {string} HTML string
	 */
	buildHTML( categories, openCategories = new Set() ) {
		return categories.map( cat => this.#buildCategoryHTML( cat, 1, '', openCategories ) ).join( '' );
	}

	// --- Private ---------------------------------------------------------------

	/** Recursively build HTML for category and its subcategories/items
	 * @param {Object} category				Category object with { label, categories?, items? }
	 * @param {number} level					Nesting level (for CSS classes)
	 * @param {string} parentPath			Slash-joined path of parent categories
	 * @param {Set}    openCategories	Set of category paths that should render open
	 * @returns {string} HTML string for this category and its children
	 */
	#buildCategoryHTML( category, level, parentPath, openCategories ) {

		// Build full path for category
		const path = parentPath
			? `${ parentPath }/${ category.label }`
			: category.label;

		// Get and show open state for category
		const isOpen = openCategories.has( path );
		const rotate = isOpen ? ' style="transform: rotate(90deg);"' : '';

		// Get entries in display order: use `entries` if provided, otherwise combine `categories` and `items` with categories first
		const entries  = category.entries ?? [ ...( category.categories ?? [] ), ...( category.items ?? [] ) ];
		//console.log( `entries for category "${ category.label }" (path: "${ path }", level: ${ level }):`, entries );

		const bodyHTML = this.#buildEntriesBody( entries, level, path, openCategories );

		return `<div class="sidebar-cat sidebar-cat--level-${ level }" data-cat-path="${ escapeHtml( path ) }"><div class="sidebar-cat-header sidebar-cat-header--level-${ level }"><span class="sidebar-cat-triangle"${ rotate }>▶</span> ${ escapeHtml( category.label ) }</div><div class="sidebar-cat-body" style="display: ${ isOpen ? 'block' : 'none' };">${ bodyHTML }</div></div>`;
	}

	/** Render entries recursively
	 * @param {Array}		entries					Array of items and/or sub-categories in display order
	 * @param {number}	level						Nesting level (for CSS classes)
	 * @param {string}	path						Full path of parent categories (for open state tracking)
	 * @param {Set}			openCategories	Set of category paths that should render open
	 * @returns {string} HTML string for this list of entries
	 */
	#buildEntriesBody( entries, level, path, openCategories ) {

		// Build HTML for each entry, wrapping sub-categories in <li> and rendering items directly as <li>
		// An entry is a sub-category if it has `entries`, `categories`, or `items`; otherwise it is a leaf item
		const listItems = entries.map(
			entry => ( entry.entries !== undefined || entry.categories !== undefined || entry.items !== undefined )
				? `<li class="sidebar-cat-entry">${ this.#buildCategoryHTML( entry, level + 1, path, openCategories ) }</li>`
				: this.#buildItemHTML( entry )
		).join( '' );

		return listItems.length > 0
			? `<ul class="sidebar-item-list">${ listItems }</ul>`
			: '';
	}

	/** Build HTML for leaf item
	 * @param {Object} item { label, data?, missing? }
	 * @returns {string} HTML string for this item
	 */
	#buildItemHTML( item ) {

		// Build data attributes for item (e.g. data-model="123", data-version="456")
		const attrs = Object.entries( item.data ?? {} )
			.map( ( [k, v] ) => ` data-${ k }="${ escapeHtml( String( v ) ) }"` )
			.join( '' );

		// Add missing class if item is marked as missing
		const cls = item.missing
			? 'sidebar-item sidebar-item--missing'
			: 'sidebar-item';

		return `<li class="${ cls }"${ attrs }>${ escapeHtml( item.label ) }</li>`;
	}

	/** Read open/closed state of categories from the DOM, returning a set of open category paths
	 * @param {HTMLElement} container Root container element to read from
	 * @returns {Set} Set of category paths that are currently open
	 * NOTE: Relies on structure/classes of rendered HTML
	 */
	#readOpenCategories( container ) {
		//console.log( 'Reading open categories from container:', container );
		
		const open = new Set(); // initialize set of open categories
		if ( !container ) return open;

		// Add all displayed category paths to set of open categories
		container.querySelectorAll( '.sidebar-cat' ).forEach( cat => {
			const body = cat.querySelector( ':scope > .sidebar-cat-body' );

			if ( body?.style.display === 'block' ) {
				const path = cat.dataset.catPath; // data-cat-path attribute
				if ( path ) open.add( path );
			}
		} );

		return open;
	}

	/** Attach click event handlers for category toggling and item clicks
	 * @param {HTMLElement} container Root container element to attach handlers to
	 * NOTE: relies on event delegation and structure/classes of rendered HTML
	 */
	#attachEventHandlers( container ) {
		//console.log( 'Attaching event handlers to container:', container );

		// Validate container and prevent attaching multiple handlers to same container
		if ( !container || container.dataset.eventsBound === '1' ) return; // data-events-bound attribute

		// Attach click handlers using event delegation
		container.addEventListener( 'click', ( { target } ) => {

			// Check if category header was clicked to toggle open/closed state
			const header = target.closest( '.sidebar-cat-header' );
			if ( header ) return this.#toggleCategory( header );

			// Check if item was clicked to trigger item click handler
			const item = target.closest( '.sidebar-item' );
			if ( item ) this.#onItemClick?.( item );
		} );

		// Track containers with event handlers
		container.dataset.eventsBound = '1';
	}

	/** Toggle open/closed state of category when header is clicked
	 * @param {HTMLElement} headerEl Clicked category header element
	 * NOTE: relies on structure/classes of rendered HTML
	 */
	#toggleCategory( headerEl ) {

		// Get category elements
		const cat      = headerEl.closest( '.sidebar-cat' );
		const body     = cat.querySelector( ':scope > .sidebar-cat-body' );
		const triangle = headerEl.querySelector( '.sidebar-cat-triangle' );
		const isOpen   = body.style.display !== 'none';

		// Set display state
		body.style.display = isOpen ? 'none' : 'block';

		// Set triangle rotation
		if ( triangle ) triangle.style.transform = isOpen
			? 'rotate(0deg)'
			: 'rotate(90deg)';
	}
}
