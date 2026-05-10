/* Workflow analysis utilities
  - Functions to analyze workflow JSON and parameters text to extract structured data for filtering and display
  - Functions to observe workflow analysis section visibility and update related UI state
  - Functions to compute a hash of the workflow shape for comparison and caching
*/


/** Fetch node port definitions for given nodes
 * @param {Array<{type: string}>} nodes array of nodes with at least a "type" property to fetch port definitions for
 * @returns {Promise<Object>} node port definitions keyed by node type
 */
export async function fetchNodePortDefinitions( nodes ) {
	const nodeTypes = [ ...new Set(
		nodes
			.map( node => typeof node?.type === 'string' ? node.type.trim() : '' )
			.filter( type => type !== '' )
	) ];

	if( nodeTypes.length === 0 ) {
		return {};
	}

	const response = await fetch( 'api/workflows/get_comfyui_node_ports.php', {
		method:		'POST',
		headers:	{ 'Content-Type': 'application/json' },
		body:			JSON.stringify( { nodeTypes } )
	} );

	const result = await response.json();
	if( !response.ok || !result.success || typeof result.nodes !== 'object' || result.nodes === null ) {
		throw new Error( result.error || `HTTP ${response.status}` );
	}

	return result.nodes;
}


/** Build structured workflow analysis data from raw workflow JSON, including only acknowledged links
 * @param {Object} workflowJson raw workflow JSON object with "nodes" and "links" arrays
 * @returns {Object} structured workflow analysis data with nodes and links
 */
export function buildWorkflowAnalysisData( workflowJson ) {
	const nodesRaw = Array.isArray( workflowJson?.nodes ) ? workflowJson.nodes : [];
	const linksRaw = Array.isArray( workflowJson?.links ) ? workflowJson.links : [];

	const outputAcknowledgedLinks = new Set();
	const inputAcknowledgedLinks = new Set();

	nodesRaw.forEach( node => {
		const outputs = Array.isArray( node?.outputs ) ? node.outputs : [];
		outputs.forEach( output => {
			const slotLinks = Array.isArray( output?.links ) ? output.links : [];
			slotLinks.forEach( id => outputAcknowledgedLinks.add( Number( id ) ) );
		} );
		const inputs = Array.isArray( node?.inputs ) ? node.inputs : [];
		inputs.forEach( input => {
			if( input?.link != null ) {
				inputAcknowledgedLinks.add( Number( input.link ) );
			}
		} );
	} );

	const nodes = nodesRaw.map( node => ( {
		id:							node?.id ?? null,
		type:						node?.type ?? '',
		inputs:				Array.isArray( node?.inputs ) ? node.inputs.map( input => ( {
			name:				typeof input?.name === 'string' ? input.name : '',
			link:				input?.link ?? null,
			widgetName:	typeof input?.widget?.name === 'string' ? input.widget.name : ''
		} ) ) : [],
		widgets_values:	Array.isArray( node?.widgets_values ) ? node.widgets_values : []
	} ) );

	const links = linksRaw
		.filter( link => {
			if( !Array.isArray( link ) || link.length < 5 ) {
				return false;
			}
			const linkId = Number( link[0] );
			return outputAcknowledgedLinks.has( linkId ) && inputAcknowledgedLinks.has( linkId );
		} )
		.map( link => link.slice( 0, 5 ) );

	const workflowId				= workflowJson?.id ?? null;
	const workflowRevision	= workflowJson?.revision ?? null;

	return { workflowId, workflowRevision, nodes, links };
}


/** Compute a hash of the workflow shape from analysis data for caching and comparison
 * @param {Object} analysisData structured workflow analysis data with nodes and links
 * @returns {Promise<string>} hex string of the computed workflow shape hash
 */
export async function computeWorkflowShapeHashFromAnalysisData( analysisData ) {
	const workflowShapeText = buildWorkflowShapeTextFromAnalysisData( analysisData );
	return computeTextHashHex( workflowShapeText );
}

/** Canonicalize node and link IDs in workflow analysis data for consistent hashing
 * - Source nodes (no parents) are BFS-traversed sorted by (type, input names)
 * - Children are enqueued sorted by (origin_slot, child_type) at each BFS step
 * - Disconnected/unreached nodes receive IDs at the end, sorted by (type, input names)
 * - Nodes are sorted by their new canonical ID
 * - Links are sorted by (new_origin_id, origin_slot, new_target_id, target_slot)
 * @param {Object} analysisData workflow analysis data (already filtered to acknowledged links)
 * @returns {Object} analysis data with canonicalized node and link IDs
 */
function normalizeWorkflowIds( analysisData ) {
	const { nodes, links, ...rest } = analysisData;
	if( !Array.isArray( nodes ) || !Array.isArray( links ) ) {
		return analysisData;
	}

	const nodeById = new Map( nodes.map( n => [n.id, n] ) );

	const children = new Map( nodes.map( n => [n.id, []] ) );
	const parents  = new Map( nodes.map( n => [n.id, []] ) );
	const outgoing = new Map( nodes.map( n => [n.id, []] ) );

	for( const link of links ) {
		const [linkId, originId, originSlot, targetId, targetSlot] = link.map( Number );
		if( nodeById.has( originId ) && nodeById.has( targetId ) ) {
			children.get( originId ).push( targetId );
			parents.get( targetId ).push( originId );
			outgoing.get( originId ).push( [originSlot, targetId, targetSlot, linkId] );
		}
	}

	const nodeSortKey = ( nid ) => {
		const n = nodeById.get( nid );
		const inputNames = ( n?.inputs ?? [] ).map( i => i.name ?? '' ).join( '\0' );
		return `${n?.type ?? ''}\0${inputNames}`;
	};

	const byNodeKey = ( a, b ) => {
		const ka = nodeSortKey( a );
		const kb = nodeSortKey( b );
		return ka < kb ? -1 : ka > kb ? 1 : 0;
	};

	const sourceNodes = [...nodeById.keys()]
		.filter( nid => parents.get( nid ).length === 0 )
		.sort( byNodeKey );

	const oldToNew = new Map();
	let nextId = 1;
	const queue = [...sourceNodes];
	const visited = new Set();

	while( queue.length > 0 ) {
		queue.sort( byNodeKey );
		const nid = queue.shift();
		if( visited.has( nid ) ) continue;
		visited.add( nid );
		oldToNew.set( nid, nextId++ );

		const edges = outgoing.get( nid ).slice().sort( ( a, b ) => {
			if( a[0] !== b[0] ) return a[0] - b[0];
			return byNodeKey( a[1], b[1] );
		} );
		for( const [, childId] of edges ) {
			if( !visited.has( childId ) ) queue.push( childId );
		}
	}

	[...nodeById.keys()]
		.filter( nid => !oldToNew.has( nid ) )
		.sort( byNodeKey )
		.forEach( nid => oldToNew.set( nid, nextId++ ) );

	const sortedLinks = [...links].sort( ( a, b ) => {
		const ao = oldToNew.get( Number( a[1] ) ) ?? 0;
		const bo = oldToNew.get( Number( b[1] ) ) ?? 0;
		if( ao !== bo ) return ao - bo;
		const aOSlot = Number( a[2] );
		const bOSlot = Number( b[2] );
		if( aOSlot !== bOSlot ) return aOSlot - bOSlot;
		const at = oldToNew.get( Number( a[3] ) ) ?? 0;
		const bt = oldToNew.get( Number( b[3] ) ) ?? 0;
		if( at !== bt ) return at - bt;
		return Number( a[4] ) - Number( b[4] );
	} );

	const oldLinkToNew = new Map( sortedLinks.map( ( lnk, i ) => [Number( lnk[0] ), i + 1] ) );

	const newNodes = nodes
		.map( node => {
			const newId = oldToNew.get( node.id );
			if( newId === undefined ) return node;
			return {
				...node,
				id:		newId,
				inputs:	node.inputs.map( inp => ( {
					...inp,
					link: inp.link != null ? ( oldLinkToNew.get( Number( inp.link ) ) ?? null ) : null
				} ) )
			};
		} )
		.sort( ( a, b ) => {
			const aId = typeof a.id === 'number' ? a.id : Infinity;
			const bId = typeof b.id === 'number' ? b.id : Infinity;
			return aId - bId;
		} );

	const newLinks = sortedLinks.map( ( lnk, i ) => [
		i + 1,
		oldToNew.get( Number( lnk[1] ) ) ?? Number( lnk[1] ),
		Number( lnk[2] ),
		oldToNew.get( Number( lnk[3] ) ) ?? Number( lnk[3] ),
		Number( lnk[4] )
	] );

	return { ...rest, nodes: newNodes, links: newLinks };
}

/** Build a consistent text representation of workflow shape for hashing and comparison
 * - Excluding widget values
 * @param {Object} analysisData structured workflow analysis data with nodes and links
 * @returns {string} formatted JSON string of workflow shape
 */
export function buildWorkflowShapeTextFromAnalysisData( analysisData ) {
	const { workflowId: _wfId, workflowRevision: _wfRev, ...analysisDataForJson } = analysisData || {};
	const normalized = normalizeWorkflowIds( analysisDataForJson );
	const workflowShape = buildWorkflowShapeData( normalized );
	return JSON.stringify( workflowShape, null, 2 );
}
/** Build workflow shape data by stripping variable widget values from analysis data
 * @param {Object} analysisDataForJson workflow analysis data with nodes and links, potentially including variable widget values
 * @returns {Object} workflow shape data with variable widget values removed for consistent hashing and comparison
 */
function buildWorkflowShapeData( analysisDataForJson ) {
	const shapeNodes = Array.isArray( analysisDataForJson?.nodes )
		? analysisDataForJson.nodes.map( node => {
			const { widgets_values: _ignoredWidgetsValues, ...nodeWithoutWidgets } = node || {};
			return nodeWithoutWidgets;
		} )
		: [];

	return {
		...analysisDataForJson,
		nodes: shapeNodes
	};
}

/** Compute hex hash of given text using SHA-256 if available, otherwise fallback to FNV-1a
 * @param {string} text input text to hash
 * @returns {Promise<string>} hex string of the computed hash
 */
async function computeTextHashHex( text ) {
	if( window.crypto && window.crypto.subtle ) {
		const encoded	= new TextEncoder().encode( text || '' );
		const digest	= await window.crypto.subtle.digest( 'SHA-256', encoded );
		return Array.from( new Uint8Array( digest ) )
			.map( byte => byte.toString( 16 ).padStart( 2, '0' ) )
			.join( '' );
	}

	let		hash		= 2166136261;
	const	value	= String( text || '' );

	for( let i = 0; i < value.length; i += 1 ) {
		hash ^= value.charCodeAt( i );
		hash += ( hash << 1 ) + ( hash << 4 ) + ( hash << 7 ) + ( hash << 8 ) + ( hash << 24 );
	}

	return ( hash >>> 0 ).toString( 16 ).padStart( 8, '0' );
}
