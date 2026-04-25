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
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify( { nodeTypes } )
	} );

	const result = await response.json();
	if( !response.ok || !result.success || typeof result.nodes !== 'object' || result.nodes === null ) {
		throw new Error( result.error || `HTTP ${response.status}` );
	}

	return result.nodes;
}

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
		id: node?.id ?? null,
		type: node?.type ?? '',
		inputs: Array.isArray( node?.inputs ) ? node.inputs.map( input => ( {
			name: typeof input?.name === 'string' ? input.name : '',
			link: input?.link ?? null,
			widgetName: typeof input?.widget?.name === 'string' ? input.widget.name : ''
		} ) ) : [],
		widgets_values: Array.isArray( node?.widgets_values ) ? node.widgets_values : []
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

	const workflowId = workflowJson?.id ?? null;
	const workflowRevision = workflowJson?.revision ?? null;

	return { workflowId, workflowRevision, nodes, links };
}

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

export function buildWorkflowShapeTextFromAnalysisData( analysisData ) {
	const { workflowId: _wfId, workflowRevision: _wfRev, ...analysisDataForJson } = analysisData || {};
	const workflowShape = buildWorkflowShapeData( analysisDataForJson );
	return JSON.stringify( workflowShape, null, 2 );
}

export async function computeWorkflowShapeHashFromAnalysisData( analysisData ) {
	const workflowShapeText = buildWorkflowShapeTextFromAnalysisData( analysisData );
	return computeTextHashHex( workflowShapeText );
}

async function computeTextHashHex( text ) {
	if( window.crypto && window.crypto.subtle ) {
		const encoded = new TextEncoder().encode( text || '' );
		const digest = await window.crypto.subtle.digest( 'SHA-256', encoded );
		return Array.from( new Uint8Array( digest ) )
			.map( byte => byte.toString( 16 ).padStart( 2, '0' ) )
			.join( '' );
	}

	let hash = 2166136261;
	const value = String( text || '' );
	for( let i = 0; i < value.length; i += 1 ) {
		hash ^= value.charCodeAt( i );
		hash += ( hash << 1 ) + ( hash << 4 ) + ( hash << 7 ) + ( hash << 8 ) + ( hash << 24 );
	}

	return ( hash >>> 0 ).toString( 16 ).padStart( 8, '0' );
}