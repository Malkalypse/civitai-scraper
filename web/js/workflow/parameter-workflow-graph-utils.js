import { getGraphNodeTemplate } from './parameter-workflow-node-templates.js';

/** Create chain of LoraLoader nodes in graph for given loras
 * - Connect them sequentially from starting model and clip nodes/slots
 * - Returning the final model and clip node/slot to connect the rest of the workflow to
 * @param {object}	graph						workflow graph object to modify
 * @param {Array}		loras						array of Lora objects containing name and weight
 * @param {object}	startModelNode	starting model node
 * @param {number}	startModelSlot	starting model slot
 * @param {object}	startClipNode		starting clip node
 * @param {number}	startClipSlot		starting clip slot
 * @returns {object} object containing final model and clip node/slot
 */
export function createLoraNodeChain( graph, loras, startModelNode, startModelSlot, startClipNode, startClipSlot ) {
	let modelNode = startModelNode;
	let modelSlot = startModelSlot;
	let clipNode = startClipNode;
	let clipSlot = startClipSlot;

	loras.forEach( lora => {
		const loraNode = addA1111Node( graph, 'LoraLoader', [ lora.name, lora.weight, lora.weight ] );
		connectA1111Nodes( graph, modelNode, modelSlot, loraNode, 0 );
		connectA1111Nodes( graph, clipNode, clipSlot, loraNode, 1 );
		modelNode = loraNode;
		modelSlot = 0;
		clipNode = loraNode;
		clipSlot = 1;
	} );

	return { modelNode, modelSlot, clipNode, clipSlot };
}
/** Add a node of given type to the graph with optional widget values, using templates for node structure and positioning
 * @param {object} graph workflow graph object to modify
 * @param {string} type type of node to add
 * @param {Array} widgetsValues optional array of widget values to set on the new node
 * @returns {object} the newly added node
 */
export function addA1111Node( graph, type, widgetsValues = [] ) {
	const typeCount = graph.nodes.filter( node => node.type === type ).length + 1;
	const template = getGraphNodeTemplate( type, typeCount );
	const node = {
		id: graph.last_node_id + 1,
		type,
		pos: template.pos,
		size: template.size,
		flags: {},
		order: graph.nodes.length,
		mode: 0,
		inputs: template.inputs.map( input => ( {
			localized_name: input.name,
			name: input.name,
			type: input.type,
			...( input.widget ? { widget: { name: input.name } } : {} ),
			link: null
		} ) ),
		outputs: template.outputs.map( output => ( {
			localized_name: output.name,
			name: output.name,
			type: output.type,
			links: null
		} ) ),
		properties: {},
		widgets_values: widgetsValues.slice()
	};

	graph.last_node_id = node.id;
	graph.nodes.push( node );
	return node;
}
/** Connect two nodes in graph
 * - Create a link from an output slot of one node to an input slot of another node
 * @param {object} graph workflow graph object to modify
 * @param {object} fromNode source node to connect from
 * @param {number} fromSlot output slot index on the source node
 * @param {object} toNode target node to connect to
 * @param {number} toSlot input slot index on the target node
 * @returns {number} the ID of the created link
 */
export function connectA1111Nodes( graph, fromNode, fromSlot, toNode, toSlot ) {
	const fromOutput = fromNode.outputs?.[ fromSlot ];
	const linkType = String( fromOutput?.type || '' );
	const linkId = graph.last_link_id + 1;
	graph.last_link_id = linkId;

	graph.links.push( [ linkId, fromNode.id, fromSlot, toNode.id, toSlot, linkType ] );

	if( Array.isArray( fromOutput?.links ) ) {
		fromOutput.links.push( linkId );
	} else if( fromOutput ) {
		fromOutput.links = [ linkId ];
	}

	if( Array.isArray( toNode.inputs ) && toNode.inputs[ toSlot ] ) {
		toNode.inputs[ toSlot ].link = linkId;
	}

	return linkId;
}


/** Create a new workflow graph with a unique ID and default structure for A1111 inferred workflows
 * @param {number|string} imageId ID of the image associated with this workflow, used in generating the graph ID
 * @returns {object} new workflow graph object with default structure
 */
export function createA1111WorkflowGraph( imageId ) {
	return {
		id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `inferred-${imageId}-${Date.now()}`,
		revision: 0,
		last_node_id: 0,
		last_link_id: 0,
		nodes: [],
		links: [],
		groups: [],
		config: {},
		extra: { ds: { scale: 1, offset: [ 0, 0 ] } },
		version: 0.4
	};
}


/** Remove a link from the graph that connects to a specific input slot of a node, and optionally clean up the corresponding output slot on the source node
 * @param {object} graph workflow graph object to modify
 * @param {object} node target node from which to remove the input link
 * @param {number} inputSlot index of the input slot on the target node to disconnect
 * @param {object|null} sourceNode optional source node from which the link originates, used for cleaning up output links
 * @param {number|null} sourceSlot optional output slot index on the source node to clean up
 */
export function removeInputLink( graph, node, inputSlot, sourceNode = null, sourceSlot = null ) {
	const existingLinkId = node.inputs?.[ inputSlot ]?.link;
	if( existingLinkId == null ) {
		return;
	}

	graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( existingLinkId ) );
	node.inputs[ inputSlot ].link = null;

	if( sourceNode?.outputs?.[ sourceSlot ] ) {
		const remainingLinks = Array.isArray( sourceNode.outputs[ sourceSlot ].links )
			? sourceNode.outputs[ sourceSlot ].links.filter( linkId => Number( linkId ) !== Number( existingLinkId ) )
			: [];
		sourceNode.outputs[ sourceSlot ].links = remainingLinks.length > 0 ? remainingLinks : null;
	}
}