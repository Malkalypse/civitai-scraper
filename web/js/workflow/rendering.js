import { AppState } from '../app-context.js';

export async function copyTextWithFallback( text ) {
	const value = typeof text === 'string' ? text : String( text ?? '' );
	if( value.trim() === '' ) {
		return false;
	}

	if( navigator.clipboard && typeof navigator.clipboard.writeText === 'function' ) {
		try {
			await navigator.clipboard.writeText( value );
			return true;
		} catch( error ) {
			console.warn( 'Clipboard API write failed, trying fallback:', error );
		}
	}

	try {
		const textarea = document.createElement( 'textarea' );
		textarea.value = value;
		textarea.setAttribute( 'readonly', '' );
		textarea.style.position = 'fixed';
		textarea.style.left = '-9999px';
		textarea.style.top = '0';
		document.body.appendChild( textarea );
		textarea.focus();
		textarea.select();
		textarea.setSelectionRange( 0, textarea.value.length );
		const copied = document.execCommand( 'copy' );
		document.body.removeChild( textarea );
		return copied === true;
	} catch( error ) {
		console.warn( 'Fallback copy failed:', error );
		return false;
	}
}

export function renderWorkflowAnalysis( imageId, analysisData, nodePortDefinitions = {}, options = {} ) {
	const keepParametersVisible = options?.keepParametersVisible === true;
	const scrollToSection = options?.scrollToSection !== false;
	const exportableWorkflowJsonText = String( options?.exportableWorkflowJsonText || '' ).trim();

	const parametersSection = document.getElementById( 'parametersAnalysisSection' );
	if( parametersSection && !keepParametersVisible ) {
		parametersSection.style.display = 'none';
	}

	const section = document.getElementById( 'workflowAnalysisSection' );
	const title = document.getElementById( 'workflowAnalysisTitle' );
	const linksToggleBtn = document.getElementById( 'workflowToggleLinksBtn' );
	const textToggleBtn = document.getElementById( 'workflowToggleTextBtn' );
	const nodeList = document.getElementById( 'workflowAnalysisNodeList' );
	const outputJsonControls = document.getElementById( 'workflowJsonExportControls' );
	const outputJsonBtn = document.getElementById( 'workflowOutputJsonBtn' );
	const outputJsonStatus = document.getElementById( 'workflowOutputJsonStatus' );

	if( !section || !title || !nodeList ) {
		return;
	}

	if( outputJsonControls ) {
		outputJsonControls.style.display = exportableWorkflowJsonText !== '' ? '' : 'none';
	}

	if( outputJsonStatus ) {
		outputJsonStatus.textContent = '';
	}

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

	const nodes = Array.isArray( analysisData?.nodes ) ? analysisData.nodes : [];
	const links = Array.isArray( analysisData?.links ) ? analysisData.links : [];
	const workflowId = analysisData?.workflowId ?? null;
	const workflowRevision = analysisData?.workflowRevision ?? null;

	if( workflowId !== null || workflowRevision !== null ) {
		const metaDiv = document.createElement( 'div' );
		metaDiv.style.cssText = 'font-size: 12px; color: #adb5bd; margin-bottom: 8px; padding: 6px 8px; background: #25262b; border-radius: 4px; border: 1px solid #373a40;';

		if( workflowId !== null ) {
			const idLine = document.createElement( 'div' );
			idLine.style.fontWeight = '700';
			idLine.textContent = String( workflowId );
			metaDiv.appendChild( idLine );
		}

		if( workflowRevision !== null ) {
			const revisionLine = document.createElement( 'div' );
			revisionLine.textContent = `Version: ${workflowRevision}`;
			metaDiv.appendChild( revisionLine );
		}

		nodeList.appendChild( metaDiv );
	}

	const typeOrder = { input: 0, widget: 1, output: 2 };
	const sectionTitles = { input: 'Inputs', widget: 'Widgets', output: 'Outputs' };
	const nodesById = new Map();
	const nodeCardById = new Map();
	const sectionRenderEntries = [];
	const inputCellByNodePort = new Map();
	const widgetCellByNodePort = new Map();
	const outputCellByNodePort = new Map();
	const connectionSignaturesByCell = new WeakMap();
	const processedLinkEdges = new Set();

	nodes.forEach( node => {
		const id = Number( node?.id );
		if( Number.isFinite( id ) ) {
			nodesById.set( id, node );
		}
	} );

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

	const formatNumberValue = ( numberValue ) => {
		if( !Number.isFinite( numberValue ) ) {
			return String( numberValue );
		}

		return String( Number( numberValue.toFixed( 2 ) ) );
	};

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

	if( linksToggleBtn ) {
		linksToggleBtn.onclick = () => {
			AppState.workflow.workflowLinksHidden = !AppState.workflow.workflowLinksHidden;
			applyLinksVisibility();
		};
	}

	if( textToggleBtn ) {
		textToggleBtn.onclick = () => {
			AppState.workflow.workflowTextHidden = !AppState.workflow.workflowTextHidden;
			applyTextVisibility();
		};
	}

	applyLinksVisibility();
	applyTextVisibility();

	section.style.display = 'block';
	if( scrollToSection ) {
		section.scrollIntoView( { behavior: 'smooth', block: 'start' } );
	}
}