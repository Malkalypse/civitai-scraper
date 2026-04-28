import { AppState } from '../app-context.js';
import { copyTextWithFallback } from '../dom-utils.js';

export { copyTextWithFallback } from '../dom-utils.js';


/** Render workflow analysis data for a given image, including nodes, links, and metadata, with interactive elements for navigation and JSON export
 * @param {number|string} imageId ID of the image the workflow analysis corresponds to, used in the section title
 * @param {Object} analysisData structured workflow analysis data containing nodes, links, workflowId, and workflowRevision
 * @param {Object} nodePortDefinitions definitions for node ports, used to label inputs, widgets, and outputs
 * @param {Object} options additional options for rendering, including:
 * - keepParametersVisible (boolean): whether to keep the parameters section visible when rendering workflow analysis
 * - scrollToSection (boolean): whether to scroll to the workflow analysis section after rendering
 * - exportableWorkflowJsonText (string): JSON text of the workflow for export
 */
export function renderWorkflowAnalysis( imageId, analysisData, nodePortDefinitions = {}, options = {} ) {

	const keepParametersVisible				= options?.keepParametersVisible === true;
	const scrollToSection							= options?.scrollToSection !== false;
	const exportableWorkflowJsonText	= String( options?.exportableWorkflowJsonText || '' ).trim();
	const parametersSection						= document.getElementById( 'parametersAnalysisSection' );

	if( parametersSection && !keepParametersVisible ) {
		parametersSection.style.display = 'none';
	}

	// Define element references
	const section							= document.getElementById( 'workflowAnalysisSection' );
	const title								= document.getElementById( 'workflowAnalysisTitle' );
	const linksToggleBtn			= document.getElementById( 'workflowToggleLinksBtn' );
	const textToggleBtn				= document.getElementById( 'workflowToggleTextBtn' );
	const nodeList						= document.getElementById( 'workflowAnalysisNodeList' );
	const outputJsonControls	= document.getElementById( 'workflowJsonExportControls' );
	const outputJsonBtn				= document.getElementById( 'workflowOutputJsonBtn' );
	const outputJsonStatus		= document.getElementById( 'workflowOutputJsonStatus' );

	if( !section || !title || !nodeList ) {
		return;
	}

	if( outputJsonControls ) {
		outputJsonControls.style.display = exportableWorkflowJsonText !== '' ? '' : 'none';
	}

	if( outputJsonStatus ) {
		outputJsonStatus.textContent = '';
	}

	// Set up event handler for exporting workflow JSON
	if( outputJsonBtn ) {
		outputJsonBtn.disabled = exportableWorkflowJsonText === '';

		outputJsonBtn.onclick = async () => {
			if( exportableWorkflowJsonText === '' ) {
				return;
			}

			outputJsonBtn.disabled = true;
			if( outputJsonStatus ) {
				outputJsonStatus.textContent = 'Copying...';
			}

			try {
				const copied = await copyTextWithFallback( exportableWorkflowJsonText );

				if( copied ) {
					if( outputJsonStatus ) {
						outputJsonStatus.textContent = 'Copied workflow JSON to clipboard.';
					}
				} else {
					if( outputJsonStatus ) {
						outputJsonStatus.textContent = 'Clipboard blocked. Use browser prompt fallback.';
					}
					window.prompt( 'Clipboard was blocked. Press Ctrl+C (Cmd+C on Mac), then Enter:', exportableWorkflowJsonText );
				}
			} catch( error ) {
				console.warn( 'Workflow JSON export failed:', error );
				if( outputJsonStatus ) {
					outputJsonStatus.textContent = 'Failed to copy workflow JSON.';
				}
			} finally {
				outputJsonBtn.disabled = false;
			}
		};
	}

	title.textContent = `Workflow Analysis (Image ${imageId})`;
	nodeList.innerHTML = '';

	const nodes							= Array.isArray( analysisData?.nodes ) ? analysisData.nodes : [];
	const links							= Array.isArray( analysisData?.links ) ? analysisData.links : [];
	const workflowId				= analysisData?.workflowId ?? null;
	const workflowRevision	= analysisData?.workflowRevision ?? null;

	if( workflowId !== null || workflowRevision !== null ) {
		const metaDiv					= document.createElement( 'div' );
		metaDiv.style.cssText	= 'font-size: 12px; color: #adb5bd; margin-bottom: 8px; padding: 6px 8px; background: #25262b; border-radius: 4px; border: 1px solid #373a40;';

		if( workflowId !== null ) {
			const idLine						= document.createElement( 'div' );
			idLine.style.fontWeight	= '700';
			idLine.textContent			= String( workflowId );
			metaDiv.appendChild( idLine );
		}

		if( workflowRevision !== null ) {
			const revisionLine				= document.createElement( 'div' );
			revisionLine.textContent	= `Version: ${workflowRevision}`;
			metaDiv.appendChild( revisionLine );
		}

		nodeList.appendChild( metaDiv );
	}

	const typeOrder										= { input: 0, widget: 1, output: 2 };
	const sectionTitles								= { input: 'Inputs', widget: 'Widgets', output: 'Outputs' };
	const nodesById										= new Map();
	const nodeCardById								= new Map();
	const sectionRenderEntries				= [];
	const inputCellByNodePort					= new Map();
	const widgetCellByNodePort				= new Map();
	const outputCellByNodePort				= new Map();
	const connectionSignaturesByCell	= new WeakMap();
	const processedLinkEdges					= new Set();

	nodes.forEach( node => {
		const id = Number( node?.id );
		if( Number.isFinite( id ) ) {
			nodesById.set( id, node );
		}
	} );

	/** Helper to get port label from definitions, with fallback to 'Unknown' if not found
	 * @param {string} nodeType 
	 * @param {string} portType 
	 * @param {number} portIndex 
	 * @returns {string}
	 */
	const getPortLabel = ( nodeType, portType, portIndex ) => {
		const definition = nodePortDefinitions[ nodeType ];
		const ports = Array.isArray( definition?.ports ) ? definition.ports : [];
		const match = ports.find( port => {
			const type = String( port?.port_type || '' ).toLowerCase();
			const idx = Number( port?.port_index );
			return type === portType && idx === portIndex;
		} );

		const label = typeof match?.label === 'string' ? match.label.trim() : '';
		return label || 'Unknown';
	};

	/** Ensure that a cell has the necessary wrappers for masking and connection lists, creating them if they don't exist
	 * @param {HTMLElement} valueCell the cell element to ensure wrappers for
	 */
	const ensureMaskedCellWrappers = ( valueCell ) => {
		if( !valueCell || valueCell.dataset.maskReady === '1' ) {
			return;
		}

		if( valueCell.querySelector( 'button, a, div' ) ) {
			valueCell.dataset.maskReady = '1';
			return;
		}

		const content = document.createElement( 'div' );
		content.className = 'workflow-cell-content';
		while( valueCell.firstChild ) {
			content.appendChild( valueCell.firstChild );
		}

		const mask = document.createElement( 'div' );
		mask.className = 'workflow-cell-mask';
		mask.textContent = '...';
		mask.style.display = 'none';

		valueCell.appendChild( content );
		valueCell.appendChild( mask );
		valueCell.dataset.maskReady = '1';
	};

	/** Set the masked state of a cell, showing or hiding the mask and content accordingly
	 * @param {HTMLElement} valueCell the cell element to set masked state for
	 * @param {boolean} masked whether the cell should be masked (true) or unmasked (false)
	 */
	const setCellMasked = ( valueCell, masked ) => {
		ensureMaskedCellWrappers( valueCell );
		const mask = valueCell ? valueCell.querySelector( '.workflow-cell-mask' ) : null;
		const content = valueCell ? valueCell.querySelector( '.workflow-cell-content' ) : null;

		if( !mask ) {
			return;
		}

		mask.style.display = masked ? '' : 'none';
		if( content ) {
			content.style.display = masked ? 'none' : '';
		}
	};

	/** Focus a workflow node card by its ID, applying temporary highlight styles and scrolling it into view
	 * @param {number} nodeId the ID of the node to focus
	 */
	const focusWorkflowNodeCard = ( nodeId ) => {
		nodeCardById.forEach( card => {
			card.style.outline = '';
			card.style.boxShadow = '';
		} );

		const card = nodeCardById.get( nodeId );
		if( !card ) {
			return;
		}

		card.style.outline = '2px solid #4dabf7';
		card.style.boxShadow = '0 0 0 2px rgba(77, 171, 247, 0.35)';
		card.scrollIntoView( { behavior: 'smooth', block: 'center' } );

		setTimeout( () => {
			card.style.outline = '';
			card.style.boxShadow = '';
		}, 1800 );
	};

	/** Append a connection line element to a cell for a given link, ensuring no duplicate connections are added
	 * @param {HTMLElement} cell the cell element to append the connection line to
	 * @param {string} lineText the text to display on the connection button
	 * @param {number} referencedNodeId the ID of the node that this connection references, used for navigation on click
	 */
	const appendConnectionLine = ( cell, lineText, referencedNodeId ) => {
		if( !cell ) {
			return;
		}

		const connectionSignature = `${lineText}::${referencedNodeId}`;
		let cellSignatures = connectionSignaturesByCell.get( cell );
		if( !cellSignatures ) {
			cellSignatures = new Set();
			connectionSignaturesByCell.set( cell, cellSignatures );
		}

		if( cellSignatures.has( connectionSignature ) ) {
			return;
		}
		cellSignatures.add( connectionSignature );

		const cellContent = cell && cell.dataset.maskReady === '1'
			? ( cell.querySelector( '.workflow-cell-content' ) || cell )
			: cell;
		let list = cell.querySelector( '.workflow-connection-list' );
		if( !list ) {
			list = document.createElement( 'div' );
			list.className = 'workflow-connection-list';
			if( cellContent && cellContent.textContent && cellContent.textContent.trim() !== '' ) {
				list.classList.add( 'workflow-connection-list--offset' );
			}
			( cellContent || cell ).appendChild( list );
		}

		const line = document.createElement( 'div' );
		line.className = 'workflow-connection-line';

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.textContent = lineText;
		button.className = 'workflow-connection-btn';
		button.title = 'Jump to referenced node';
		button.onclick = ( event ) => {
			event.preventDefault();
			focusWorkflowNodeCard( referencedNodeId );
		};

		line.appendChild( button );
		list.appendChild( line );
	};

	/** Resolve the target slot of a link to determine if it corresponds to a defined input or widget port, returning the appropriate label and display information for rendering
	 * @param {*} targetNode The target node object that the link is connected to 
	 * @param {*} nodeType The type of the target node
	 * @param {*} targetSlot The index of the target slot
	 * @returns {Object} An object containing the resolved port type, index, label, and display suffix
	 */
	const resolveCombinedTargetSlot = ( targetNode, nodeType, targetSlot ) => {
		const runtimeInputs = Array.isArray( targetNode?.inputs ) ? targetNode.inputs : [];
		const runtimeInput = runtimeInputs[ targetSlot ];
		if( runtimeInput ) {
			const runtimeLabel = typeof runtimeInput?.name === 'string' && runtimeInput.name.trim()
				? runtimeInput.name.trim()
				: 'Unknown';
			const widgetName = typeof runtimeInput?.widgetName === 'string' && runtimeInput.widgetName.trim()
				? runtimeInput.widgetName.trim().toLowerCase()
				: '';

			if( widgetName ) {
				const widgetPorts = Array.isArray( nodePortDefinitions[ nodeType ]?.ports )
					? nodePortDefinitions[ nodeType ].ports.filter( port => String( port?.port_type || '' ).toLowerCase() === 'widget' )
					: [];
				const widgetMatch = widgetPorts.find( port => {
					const label = typeof port?.label === 'string' ? port.label.trim().toLowerCase() : '';
					return label === widgetName;
				} );

				if( widgetMatch ) {
					const widgetIndex = Number( widgetMatch?.port_index );
					return {
						portType: 'widget',
						portIndex: Number.isFinite( widgetIndex ) ? widgetIndex : targetSlot,
						label: runtimeLabel,
						displaySuffix: Number.isFinite( widgetIndex ) ? `widget ${widgetIndex}` : 'widget'
					};
				}
			}

			return {
				portType: 'input',
				portIndex: targetSlot,
				label: runtimeLabel,
				displaySuffix: String( targetSlot )
			};
		}

		const definition = nodePortDefinitions[ nodeType ];
		const ports = Array.isArray( definition?.ports ) ? definition.ports : [];
		const inputPorts = ports.filter( port => String( port?.port_type || '' ).toLowerCase() === 'input' );
		const widgetPorts = ports.filter( port => String( port?.port_type || '' ).toLowerCase() === 'widget' );

		const inputIndices = inputPorts
			.map( port => Number( port?.port_index ) )
			.filter( idx => Number.isFinite( idx ) );
		const maxInputIndex = inputIndices.length > 0 ? Math.max( ...inputIndices ) : -1;

		const inputMatch = inputPorts.find( port => Number( port?.port_index ) === targetSlot );
		if( inputMatch ) {
			const label = typeof inputMatch?.label === 'string' && inputMatch.label.trim() ? inputMatch.label.trim() : 'Unknown';
			return {
				portType: 'input',
				portIndex: targetSlot,
				label,
				displaySuffix: String( targetSlot )
			};
		}

		if( targetSlot > maxInputIndex ) {
			const widgetIndex = targetSlot - ( maxInputIndex + 1 );
			const widgetMatch = widgetPorts.find( port => Number( port?.port_index ) === widgetIndex );
			if( widgetMatch ) {
				const label = typeof widgetMatch?.label === 'string' && widgetMatch.label.trim() ? widgetMatch.label.trim() : 'Unknown';
				return {
					portType: 'widget',
					portIndex: widgetIndex,
					label,
					displaySuffix: 'widget'
				};
			}
		}

		const fallbackWidget = widgetPorts.find( port => Number( port?.port_index ) === targetSlot );
		if( fallbackWidget ) {
			const label = typeof fallbackWidget?.label === 'string' && fallbackWidget.label.trim() ? fallbackWidget.label.trim() : 'Unknown';
			return {
				portType: 'widget',
				portIndex: targetSlot,
				label,
				displaySuffix: 'widget'
			};
		}

		return {
			portType: 'input',
			portIndex: targetSlot,
			label: 'Unknown',
			displaySuffix: String( targetSlot )
		};
	};

	/** Format a number value to a string with fixed precision, or return it as-is if it's not a finite number
	 * @param {*} numberValue value to format, expected to be a number but will be returned as a string if it's not finite
	 * @returns {string} formatted number as a string, or original value as a string if it's not a finite number
	 */
	const formatNumberValue = ( numberValue ) => {
		if( !Number.isFinite( numberValue ) ) {
			return String( numberValue );
		}

		return String( Number( numberValue.toFixed( 2 ) ) );
	};

	/** Normalize numeric values in an object or array to a fixed precision, while leaving non-numeric values unchanged. This is used to create a consistent text representation of workflow shape for hashing and comparison, excluding variable widget values.
	 * @param {*} value value to normalize, can be a number, array, or object
	 * @returns {*} normalized value with numeric values rounded to fixed precision
	 */
	const normalizeNumericPrecision = ( value ) => {
		if( typeof value === 'number' ) {
			if( Number.isFinite( value ) ) {
				return Number( value.toFixed( 2 ) );
			}

			return value;
		}

		if( Array.isArray( value ) ) {
			return value.map( item => normalizeNumericPrecision( item ) );
		}

		if( value && typeof value === 'object' ) {
			const normalized = {};
			Object.keys( value ).forEach( key => {
				normalized[ key ] = normalizeNumericPrecision( value[ key ] );
			} );
			return normalized;
		}

		return value;
	};

	/** Format a widget value to a string for display, normalizing numeric values to fixed precision and stringifying objects as JSON, while leaving non-numeric primitive values as strings
	 * @param {*} value the widget value to format, can be of any type
	 * @returns {string} formatted string representation of the widget value
	 */
	const formatWidgetValue = ( value ) => {
		if( value === null || typeof value === 'undefined' ) {
			return '';
		}

		if( typeof value === 'number' ) {
			return formatNumberValue( value );
		}

		if( typeof value === 'string' || typeof value === 'boolean' ) {
			return String( value );
		}

		try {
			return JSON.stringify( normalizeNumericPrecision( value ) );
		} catch( error ) {
			return String( value );
		}
	};

	const normalizePortName = ( value ) => String( value || '' ).trim().toLowerCase();

	/** Check if a widget port is linked to a node
	 * @param {Object} node					node to check
	 * @param {string} widgetLabel	label of widget port
	 * @returns {boolean} true if widget port is linked, otherwise false
	 */
	const isWidgetPortLinked = ( node, widgetLabel ) => {
		const widgetLabelNormalized = normalizePortName( widgetLabel );
		if( !widgetLabelNormalized ) {
			return false;
		}

		const runtimeInputs = Array.isArray( node?.inputs ) ? node.inputs : [];
		return runtimeInputs.some( input => {
			if( input?.link == null ) {
				return false;
			}

			const widgetName = normalizePortName( input?.widgetName );
			const inputName = normalizePortName( input?.name );
			return widgetName === widgetLabelNormalized || inputName === widgetLabelNormalized;
		} );
	};

	// Render nodes of workflow analysis, creating DOM elements for each node and its ports, and appending to node list container
	nodes.forEach( node => {
		const nodeType = typeof node?.type === 'string' && node.type.trim() ? node.type : 'Unknown';
		const nodeIdNumber = Number( node?.id );
		const hasNodeId = Number.isFinite( nodeIdNumber );
		const nodeId = hasNodeId ? nodeIdNumber : '?';
		const widgetValues = Array.isArray( node?.widgets_values ) ? node.widgets_values : [];
		const item = document.createElement( 'div' );
		item.className = 'node';
		if( hasNodeId ) {
			item.dataset.workflowNodeId = String( nodeIdNumber );
			nodeCardById.set( nodeIdNumber, item );
		}

		const nodeTitle = document.createElement( 'div' );
		nodeTitle.className = 'node-title';
		nodeTitle.textContent = `${nodeType} (${nodeId})`;
		item.appendChild( nodeTitle );

		const definition = nodePortDefinitions[ nodeType ];
		const ports = Array.isArray( definition?.ports ) ? definition.ports.slice() : [];
		const hasWidgetTable = ports.some( port => String( port?.port_type || '' ).toLowerCase() === 'widget' );
		item.dataset.hasWidgetTable = hasWidgetTable ? '1' : '0';
		ports.sort( ( a, b ) => {
			const aType = typeof a?.port_type === 'string' ? a.port_type.toLowerCase() : '';
			const bType = typeof b?.port_type === 'string' ? b.port_type.toLowerCase() : '';
			const aOrder = Object.prototype.hasOwnProperty.call( typeOrder, aType ) ? typeOrder[ aType ] : 999;
			const bOrder = Object.prototype.hasOwnProperty.call( typeOrder, bType ) ? typeOrder[ bType ] : 999;

			if( aOrder !== bOrder ) {
				return aOrder - bOrder;
			}

			return ( Number( a?.port_index ) || 0 ) - ( Number( b?.port_index ) || 0 );
		} );

		if( ports.length === 0 ) {
			item.style.borderColor = 'rgb(191, 69, 71)';
			const empty = document.createElement( 'div' );
			empty.style.cssText = 'opacity: 0.8; font-size: 12px;';
			empty.textContent = 'No port definitions found in database.';
			item.appendChild( empty );
			nodeList.appendChild( item );
			return;
		}

		[ 'input', 'widget', 'output' ].forEach( sectionType => {
			const sectionRows = ports.filter( port => ( String( port?.port_type || '' ).toLowerCase() === sectionType ) );
			if( sectionRows.length === 0 ) {
				return;
			}

			const sectionContainer = document.createElement( 'div' );
			item.appendChild( sectionContainer );

			const sectionLabel = document.createElement( 'div' );
			sectionLabel.className = 'node-table-title';
			sectionLabel.textContent = sectionTitles[ sectionType ];
			sectionContainer.appendChild( sectionLabel );

			const table = document.createElement( 'table' );
			table.className = sectionType === 'widget' ? 'node-widgets' : 'node-links';
			sectionRenderEntries.push( {
				sectionType,
				sectionContainer,
				labelEl: sectionLabel,
				tableEl: table
			} );

			sectionRows.forEach( port => {
				const tr = document.createElement( 'tr' );
				const portIndex = Number( port?.port_index ) || 0;
				const portLabel = typeof port?.label === 'string' ? port.label : '';

				const tdIndex = document.createElement( 'td' );
				tdIndex.className = 'port';
				tdIndex.textContent = String( portIndex );

				const tdLabel = document.createElement( 'td' );
				tdLabel.className = 'label';
				tdLabel.textContent = portLabel;

				const tdEmpty = document.createElement( 'td' );
				tdEmpty.className = 'value';
				const widgetLinked = sectionType === 'widget' ? isWidgetPortLinked( node, portLabel ) : false;
				tdEmpty.textContent = sectionType === 'widget' && !widgetLinked ? formatWidgetValue( widgetValues[ portIndex ] ) : '';

				if( sectionType === 'input' && hasNodeId ) {
					inputCellByNodePort.set( `${nodeIdNumber}:${portIndex}`, tdEmpty );
				}

				if( sectionType === 'widget' && hasNodeId ) {
					widgetCellByNodePort.set( `${nodeIdNumber}:${portIndex}`, tdEmpty );
				}

				if( sectionType === 'output' && hasNodeId ) {
					outputCellByNodePort.set( `${nodeIdNumber}:${portIndex}`, tdEmpty );
				}

				tr.appendChild( tdIndex );
				tr.appendChild( tdLabel );
				tr.appendChild( tdEmpty );
				table.appendChild( tr );
			} );

			sectionContainer.appendChild( table );
		} );

		nodeList.appendChild( item );
	} );

	// Render links between nodes, creating connection line elements for each link and appending them to the appropriate cells, while ensuring no duplicate connections are created and handling combined input/widget slots based on runtime information and definitions
	links.forEach( link => {
		if( !Array.isArray( link ) || link.length < 5 ) {
			return;
		}

		const originNodeId = Number( link[1] );
		const originSlot = Number( link[2] );
		const targetNodeId = Number( link[3] );
		const targetSlot = Number( link[4] );

		if( !Number.isFinite( originNodeId ) || !Number.isFinite( originSlot ) || !Number.isFinite( targetNodeId ) || !Number.isFinite( targetSlot ) ) {
			return;
		}

		const edgeKey = `${originNodeId}:${originSlot}->${targetNodeId}:${targetSlot}`;
		if( processedLinkEdges.has( edgeKey ) ) {
			return;
		}
		processedLinkEdges.add( edgeKey );

		const targetNode = nodesById.get( targetNodeId );
		const originNode = nodesById.get( originNodeId );
		if( !targetNode ) {
			return;
		}

		const targetType = typeof targetNode?.type === 'string' && targetNode.type.trim() ? targetNode.type : 'Unknown';
		const targetPort = resolveCombinedTargetSlot( targetNode, targetType, targetSlot );
		const outputLinkText = `${targetType} (${targetNodeId}) > ${targetPort.label} (${targetPort.displaySuffix})`;

		const originType = typeof originNode?.type === 'string' && originNode.type.trim() ? originNode.type : 'Unknown';
		const originLabel = getPortLabel( originType, 'output', originSlot );
		const inputLinkText = `${originType} (${originNodeId}) > ${originLabel} (${originSlot})`;

		const outputCell = outputCellByNodePort.get( `${originNodeId}:${originSlot}` );
		if( outputCell ) {
			appendConnectionLine( outputCell, outputLinkText, targetNodeId );
		}

		const targetCellMap = targetPort.portType === 'widget' ? widgetCellByNodePort : inputCellByNodePort;
		const targetCell = targetCellMap.get( `${targetNodeId}:${targetPort.portIndex}` );
		if( targetCell ) {
			appendConnectionLine( targetCell, inputLinkText, originNodeId );
		}
	} );

	// Apply initial visibility of sections and rows based on whether they have values, and set up toggle buttons for showing/hiding links and text values
	sectionRenderEntries.forEach( sectionEntry => {
		const { labelEl, tableEl } = sectionEntry;
		const rows = tableEl.querySelectorAll( 'tr' );
		let visibleRowCount = 0;

		rows.forEach( row => {
			const valueCell = row.children[2];
			const hasValue = Boolean( valueCell && valueCell.textContent.trim() !== '' );
			row.style.display = hasValue ? '' : 'none';
			if( hasValue ) {
				visibleRowCount++;
			}
		} );

		if( visibleRowCount === 0 ) {
			tableEl.style.display = 'none';
			labelEl.style.color = '#868e96';
			sectionEntry.hasVisibleRows = false;
		} else {
			tableEl.style.display = '';
			labelEl.style.color = '';
			sectionEntry.hasVisibleRows = true;
		}
	} );

	/** Apply visibility of link sections and node cards based on current state of workflowLinksHidden, and update the toggle button text accordingly */
	const applyLinksVisibility = () => {
		sectionRenderEntries.forEach( sectionEntry => {
			const isLinkSection = sectionEntry.sectionType === 'input' || sectionEntry.sectionType === 'output';
			if( !isLinkSection ) {
				return;
			}

			sectionEntry.sectionContainer.style.display = AppState.workflow.workflowLinksHidden ? 'none' : '';
		} );

		nodeCardById.forEach( card => {
			const hasWidgetTable = card.dataset.hasWidgetTable === '1';
			if( AppState.workflow.workflowLinksHidden && !hasWidgetTable ) {
				card.style.display = 'none';
			} else {
				card.style.display = '';
			}
		} );

		if( linksToggleBtn ) {
			linksToggleBtn.textContent = AppState.workflow.workflowLinksHidden ? 'Show Links' : 'Hide Links';
		}
	};

	/** Apply visibility of text values in cells based on current state of workflowTextHidden, showing or hiding the mask and content accordingly, and update the toggle button text */
	const applyTextVisibility = () => {
		sectionRenderEntries.forEach( sectionEntry => {
			const rows = sectionEntry.tableEl.querySelectorAll( 'tr' );
			rows.forEach( row => {
				if( row.style.display === 'none' ) {
					return;
				}

				const labelCell = row.children[1];
				const valueCell = row.children[2];
				if( !labelCell || !valueCell ) {
					return;
				}

				const labelText = labelCell.textContent.toLowerCase();
				const isTextLike = labelText.includes( 'text' ) || labelText.includes( 'string' );
				if( isTextLike ) {
					setCellMasked( valueCell, AppState.workflow.workflowTextHidden );
				} else if( valueCell.dataset.maskReady === '1' ) {
					setCellMasked( valueCell, false );
				}
			} );
		} );

		if( textToggleBtn ) {
			textToggleBtn.textContent = AppState.workflow.workflowTextHidden ? 'Show Text' : 'Hide Text';
		}
	};

	// Set up toggle buttons for showing/hiding links and text values, and apply initial visibility based on current state
	if( linksToggleBtn ) {
		linksToggleBtn.onclick = () => {
			AppState.workflow.workflowLinksHidden = !AppState.workflow.workflowLinksHidden;
			applyLinksVisibility();
		};
	}

	// Set up toggle button for showing/hiding text values, and apply initial visibility based on current state
	if( textToggleBtn ) {
		textToggleBtn.onclick = () => {
			AppState.workflow.workflowTextHidden = !AppState.workflow.workflowTextHidden;
			applyTextVisibility();
		};
	}

	applyLinksVisibility(); // apply initial visibility of link sections and node cards based on current state
	applyTextVisibility(); // apply initial visibility of text values in cells based on current state

	section.style.display = 'block';
	if( scrollToSection ) {
		section.scrollIntoView( { behavior: 'smooth', block: 'start' } );
	}
}