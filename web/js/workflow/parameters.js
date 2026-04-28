/** Workflow analysis and graph construction based on parameters text, such as that from Automatic1111 or similar sources
 * - Functions to parse parameters text and build a corresponding workflow graph with nodes and links representing the inferred generation process
 * - Supports options related to high-resolution fix (hires upscale, hires resize, hires steps, hires upscaler) and modifies the workflow graph accordingly
 * - Allows for comparison and visualization of inferred workflow based on the parameters used for image generation
 * - Provides utility functions for fetching parameters, checking if text looks like parameters, and synchronizing settings between base and high-resolution sampler nodes
 * - Relies on external utilities for parsing parameters, creating nodes and links in the workflow graph, and fetching node port definitions
 * - The main entry point is the buildWorkflowAnalysisFromParametersText function, which takes raw parameters text and constructs a structured workflow analysis data structure that can be used for visualization and comparison
 * - The workflow graph is built using a consistent structure and includes nodes for model loading, prompt encoding, sampling, and other key steps in the generation process, with connections that reflect the conditioning specified in the parameters
 * - The code is designed to be flexible and extensible, allowing for additional options and nodes to be added as needed based on the parameters being parsed
 * - The resulting workflow analysis data structure includes a revision label for tracking the source of the inference and can be serialized to JSON for hashing and comparison purposes
 * - The code also includes error handling and fallback mechanisms for fetching parameters and building the workflow analysis, ensuring robustness in cases where parameters may be missing or malformed
 * - Overall, this module provides a comprehensive set of functions for analyzing parameters text and constructing a corresponding workflow graph that represents the inferred generation process, with support for various options and configurations commonly found in parameters from Automatic1111 and similar sources
 * - Note: This code relies on the structure of the workflow graph and node definitions used in the application, and may need to be updated if there are changes to the underlying graph structure or node types
 */


import { buildWorkflowAnalysisData } from './analysis.js';
import {
	addA1111Node,
	connectA1111Nodes,
	createA1111WorkflowGraph,
	createLoraNodeChain,
	removeInputLink
} from './parameter-workflow-graph-utils.js';
import {
	extractLoraEntries,
	normalizeA1111ParametersText,
	normalizeSamplerForA1111Import,
	normalizeSamplerForFluxImport,
	normalizeScheduleTypeForA1111Import,
	parseA1111OptionsFromParameters
} from './parameter-parsing-utils.js';
import { getPortDefinitions } from './parameter-workflow-port-definitions.js';
import { parseIntegerFromText, parseFloatFromText, parseSizeValue, ceilToMultiple } from '../math-utils.js';



/** Build a consistent text representation of workflow shape for hashing and comparison  
 * @param {Object} inferredWorkflow inferred workflow data containing a workflowGraph with nodes and links
 * @returns {string} JSON string representation of the workflow graph
 */
export function buildInferredWorkflowJsonText( inferredWorkflow ) { //
	if( !inferredWorkflow || !inferredWorkflow.workflowGraph ) {
		return '';
	}

	return JSON.stringify( inferredWorkflow.workflowGraph, null, 2 );
}

/** Check if given text looks like it contains parameters from Automatic1111 or similar, by looking for common parameter labels (Steps, Sampler, CFG, etc.) and presence of a prompt (positive or negative)
 * @param {number} imageId ID of the image associated with the parameters, used for node labeling and analysis context
 * @param {string} parametersText parameters text to analyze
 */
export function renderParametersAnalysis( imageId, parametersText ) {
	const section = document.getElementById( 'parametersAnalysisSection' );
	const title = document.getElementById( 'parametersAnalysisTitle' );
	const content = document.getElementById( 'parametersAnalysisContent' );
	if( !section || !title || !content ) {
		return;
	}

	title.textContent = `Parameters Analysis (Image ${imageId})`;
	content.textContent = String( parametersText || '' ).trim();
	section.style.display = 'block';
}

/** Fetch parameters text for given image ID from generation data, with checks to ensure it looks like valid parameters text
 * @param {*} imageId ID of the image to fetch parameters for
 * @returns {Promise<string>} parameters text if found, empty string otherwise
 */
export async function fetchParametersFallbackFromGenerationData( imageId ) {
	if( !Number.isInteger( imageId ) || imageId <= 0 ) {
		return '';
	}

	try {
		const response = await fetch( 'api/images/get_image_generation_data.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( { imageId } )
		} );

		const responseText = await response.text();
		if( responseText.trim() === '' ) {
			return '';
		}

		const result = JSON.parse( responseText );
		if( !response.ok || !result || result.success !== true ) {
			return '';
		}

		const copyAllText = typeof result.copyAllText === 'string' ? result.copyAllText.trim() : '';
		if( looksLikeA1111ParametersText( copyAllText ) ) {
			return copyAllText;
		}

		const promptText = typeof result.promptText === 'string' ? result.promptText.trim() : '';
		if( looksLikeA1111ParametersText( promptText ) ) {
			return promptText;
		}

		return '';
	} catch( error ) {
		console.warn( `Could not resolve parameter fallback for image ${imageId}:`, error );
		return '';
	}
}
/** Check if given text looks like it contains parameters from Automatic1111 or similar, by looking for common parameter labels (Steps, Sampler, CFG, etc.) and presence of a prompt (positive or negative)
 * @param {string} text input text to check
 * @returns {boolean} true if the text looks like it contains parameters, false otherwise
 */
export function looksLikeA1111ParametersText( text ) {
	const value = normalizeA1111ParametersText( text );
	if( value === '' ) {
		return false;
	}

	const hasNegativePrompt = /(^|\n|\r|[,;]\s*)negative\s*prompt\s*:/i.test( value );
	const hasSteps = /(^|\n|\r|[,;]\s*)steps\s*:/i.test( value );
	const hasSampler = /(^|\n|\r|[,;]\s*)sampler\s*:/i.test( value );
	const hasSeed = /(^|\n|\r|[,;]\s*)seed\s*:/i.test( value );

	// Some generation-data records have prompt + options (Steps/Sampler/Seed) but no explicit Negative prompt.
	return hasSteps && ( hasNegativePrompt || hasSampler || hasSeed );
}


/** Build workflow analysis data structure from parameters text
 * - Parse parameters and construct corresponding workflow graph with nodes and links representing inferred generation process
 * - Allows for comparison and visualization of inferred workflow based on parameters used for image generation
 * @param {string} parametersText raw parameters text to parse and build workflow analysis from
 * @param {number} imageId ID of the image associated with the parameters, used for node labeling and analysis context
 * @param {string} modelFilename filename of the model associated with the parameters, used for node labeling and analysis context
 * @returns {object|null} workflow analysis data structure or null if parsing fails
 */
export function buildWorkflowAnalysisFromParametersText( parametersText, imageId = 0, modelFilename = '' ) {
	const parsed = parseA1111OptionsFromParameters( parametersText );
	if( !parsed ) {
		return null;
	}

	const modelOption = String( parsed.opts?.model || '' ).toLowerCase();
	const isGguf = modelOption.endsWith( '.gguf' ) || modelFilename.toLowerCase().endsWith( '.gguf' );
	if( isGguf ) {
		return buildFluxGGUFWorkflowFromParsed( parsed, imageId, modelFilename );
	}

	const { opts } = parsed;
	const { graph, nodes } = createBaseA1111ParameterWorkflow( imageId );

	applyA1111BaseOptions( opts, nodes, modelFilename );
	const { hrSamplerNode, hrSteps } = buildA1111HiresFixBranch( graph, opts, nodes );
	syncA1111HiresSamplerSettings( opts, nodes.samplerNode, hrSamplerNode, hrSteps );

	const prompts = applyA1111PromptLoraChains( graph, parsed, nodes, hrSamplerNode );
	nodes.positiveNode.widgets_values[0] = prompts.positivePrompt;
	nodes.negativeNode.widgets_values[0] = prompts.negativePrompt;

	return buildParameterWorkflowResult( graph, 'A1111 importA1111 parity' );
}

/** Build workflow analysis data structure for Flux/GGUF from parsed parameters
 * @param {object} parsed parsed parameters object
 * @param {number} imageId ID of the image associated with the parameters, used for node labeling and analysis context
 * @param {string} modelFilename filename of the model associated with the parameters, used for node labeling and analysis context
 * @returns {object|null} workflow analysis data structure or null if parsing fails
 */
function buildFluxGGUFWorkflowFromParsed( parsed, imageId, modelFilename = '' ) {
	const opts = { ...parsed.opts };
	const { graph, nodes } = createFluxParameterWorkflow( imageId, modelFilename );

	popA1111Option( opts, 'model' );
	applyFluxWorkflowOptions( opts, nodes );

	const prompts = applyFluxPromptConditioning( graph, parsed, nodes );
	nodes.positiveNode.widgets_values[0] = prompts.positivePrompt;
	nodes.negativeNode.widgets_values[0] = prompts.negativePrompt;

	return buildParameterWorkflowResult( graph, 'A1111 Flux/GGUF parity' );
}
/** Create workflow analysis data structure for Flux/GGUF from image ID and model filename
 * @param {number} imageId ID of the image associated with the workflow, used for node labeling and analysis context
 * @param {string} modelFilename filename of the model associated with the workflow, used for node labeling and analysis context
 * @returns {object} workflow analysis data structure
 */
function createFluxParameterWorkflow( imageId, modelFilename ) {
	const graph = createA1111WorkflowGraph( imageId );
	const nodes = {
		modelNode: addA1111Node( graph, 'UnetLoaderGGUF', [ modelFilename || 'flux.gguf' ] ),
		vaeLoaderNode: addA1111Node( graph, 'VAELoader', [ 'ae.safetensors' ] ),
		dualClipNode: addA1111Node( graph, 'DualCLIPLoader', [ 't5xxl_fp16.safetensors', 'clip_l.safetensors', 'flux', 'default' ] ),
		positiveNode: addA1111Node( graph, 'CLIPTextEncode', [ '' ] ),
		negativeNode: addA1111Node( graph, 'CLIPTextEncode', [ '' ] ),
		latentNode: addA1111Node( graph, 'EmptySD3LatentImage', [ 1024, 1024, 1 ] ),
		samplerSelectNode: addA1111Node( graph, 'KSamplerSelect', [ 'euler_ancestral' ] ),
		schedulerNode: addA1111Node( graph, 'BasicScheduler', [ 'normal', 20, 1 ] ),
		noiseNode: addA1111Node( graph, 'RandomNoise', [ 0, 'fixed' ] ),
		fluxGuidanceNode: addA1111Node( graph, 'FluxGuidance', [ 7 ] ),
		guiderNode: addA1111Node( graph, 'BasicGuider', [] ),
		samplerAdvancedNode: addA1111Node( graph, 'SamplerCustomAdvanced', [] ),
		decodeNode: addA1111Node( graph, 'VAEDecode', [] ),
		previewNode: addA1111Node( graph, 'PreviewImage', [] )
	};

	connectA1111Nodes( graph, nodes.positiveNode, 0, nodes.fluxGuidanceNode, 0 );
	connectA1111Nodes( graph, nodes.noiseNode, 0, nodes.samplerAdvancedNode, 0 );
	connectA1111Nodes( graph, nodes.guiderNode, 0, nodes.samplerAdvancedNode, 1 );
	connectA1111Nodes( graph, nodes.samplerSelectNode, 0, nodes.samplerAdvancedNode, 2 );
	connectA1111Nodes( graph, nodes.schedulerNode, 0, nodes.samplerAdvancedNode, 3 );
	connectA1111Nodes( graph, nodes.latentNode, 0, nodes.samplerAdvancedNode, 4 );
	connectA1111Nodes( graph, nodes.samplerAdvancedNode, 0, nodes.decodeNode, 0 );
	connectA1111Nodes( graph, nodes.vaeLoaderNode, 0, nodes.decodeNode, 1 );
	connectA1111Nodes( graph, nodes.decodeNode, 0, nodes.previewNode, 0 );

	return { graph, nodes };
}
/** Apply workflow options parsed from parameters text to the Flux/GGUF workflow graph nodes
 * @param {object} opts options object parsed from parameters text
 * @param {object} nodes object containing references to key nodes in the workflow graph for easy access
 */
function applyFluxWorkflowOptions( opts, nodes ) {
	const sizeValue = popA1111Option( opts, 'size' );
	if( sizeValue !== undefined ) {
		const size = parseSizeValue( sizeValue );
		nodes.latentNode.widgets_values[0] = ceilToMultiple( size.width, 64 );
		nodes.latentNode.widgets_values[1] = ceilToMultiple( size.height, 64 );
	}

	const stepsValue = popA1111Option( opts, 'steps' );
	if( stepsValue !== undefined ) {
		nodes.schedulerNode.widgets_values[1] = parseIntegerFromText( stepsValue, 20 );
	}

	const seedValue = popA1111Option( opts, 'seed' );
	if( seedValue !== undefined ) {
		nodes.noiseNode.widgets_values[0] = parseIntegerFromText( seedValue, 0 );
	}

	const cfgScale = popA1111Option( opts, 'cfg scale' );
	if( cfgScale !== undefined ) {
		nodes.fluxGuidanceNode.widgets_values[0] = parseFloatFromText( cfgScale, 7 );
	}

	const samplerText = popA1111Option( opts, 'sampler' );
	if( samplerText !== undefined ) {
		const normalizedSampler = normalizeSamplerForFluxImport( samplerText );
		nodes.samplerSelectNode.widgets_values[0] = normalizedSampler.samplerName;
		nodes.schedulerNode.widgets_values[0] = normalizedSampler.scheduler;
	}

	const scheduleType = popA1111Option( opts, 'schedule type' );
	if( scheduleType !== undefined ) {
		const normalizedSchedule = normalizeScheduleTypeForA1111Import( scheduleType );
		if( normalizedSchedule !== '' ) {
			nodes.schedulerNode.widgets_values[0] = normalizedSchedule;
		}
	}

	const denoiseValue = popA1111Option( opts, 'denoising strength' );
	if( denoiseValue !== undefined ) {
		nodes.schedulerNode.widgets_values[2] = parseFloatFromText( denoiseValue, 1 );
	}
}
/** Apply prompt conditioning and LoRA chains to the Flux/GGUF workflow graph based on parsed parameters
 * - Extract LoRA entries from positive and negative prompts and create corresponding node chains in the graph
 * - Connect the LoRA chains to the appropriate nodes in the graph to reflect the conditioning specified in the parameters
 * @param {object} graph workflow graph to modify with prompt conditioning nodes and links
 * @param {object} parsed parsed parameters object containing prompts and options
 * @param {object} nodes object containing references to key nodes in the workflow graph for easy access
 * @returns {object} object containing cleaned positive and negative prompts with LoRA tags removed
 */
function applyFluxPromptConditioning( graph, parsed, nodes ) {
	const positiveLoraParse = extractLoraEntries( parsed.positivePrompt );
	let modelChain = createLoraNodeChain( graph, positiveLoraParse.loras, nodes.modelNode, 0, nodes.dualClipNode, 0 );

	const negativeLoraParse = extractLoraEntries( parsed.negativePrompt );
	if( negativeLoraParse.loras.length > 0 ) {
		modelChain = createLoraNodeChain( graph, negativeLoraParse.loras, modelChain.modelNode, modelChain.modelSlot, modelChain.clipNode, modelChain.clipSlot );
	}

	connectA1111Nodes( graph, modelChain.clipNode, modelChain.clipSlot, nodes.positiveNode, 0 );
	connectA1111Nodes( graph, modelChain.clipNode, modelChain.clipSlot, nodes.negativeNode, 0 );
	connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, nodes.schedulerNode, 0 );
	connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, nodes.guiderNode, 0 );
	connectA1111Nodes( graph, nodes.fluxGuidanceNode, 0, nodes.guiderNode, 1 );

	return {
		positivePrompt: positiveLoraParse.cleanedText,
		negativePrompt: negativeLoraParse.cleanedText
	};
}

/** Create base workflow graph structure for A1111 parameters, with nodes and links representing a standard generation process, and placeholders for model, prompts, sampler, etc.
 * - Serves as foundation for building out full inferred workflow based on the parameters text
 * - Allows for consistent structure and easier application of parsed options and prompt conditioning
 * @param {*} imageId ID of the image associated with the workflow, used for node labeling and analysis context
 * @returns {object} object containing the workflow graph and node references for A1111 parameters
 */
function createBaseA1111ParameterWorkflow( imageId ) {
	const graph = createA1111WorkflowGraph( imageId );
	const nodes = {
		ckptNode: addA1111Node( graph, 'CheckpointLoaderSimple', [ 'from_parameters' ] ),
		clipSkipNode: addA1111Node( graph, 'CLIPSetLastLayer', [ -1 ] ),
		positiveNode: addA1111Node( graph, 'CLIPTextEncode', [ '' ] ),
		negativeNode: addA1111Node( graph, 'CLIPTextEncode', [ '' ] ),
		samplerNode: addA1111Node( graph, 'KSampler', [ 0, 'fixed', 20, 7, 'euler', 'normal', 1 ] ),
		imageNode: addA1111Node( graph, 'EmptyLatentImage', [ 512, 512, 1 ] ),
		vaeNode: addA1111Node( graph, 'VAEDecode', [] ),
		saveNode: addA1111Node( graph, 'SaveImage', [ 'ComfyUI' ] )
	};

	connectA1111Nodes( graph, nodes.ckptNode, 1, nodes.clipSkipNode, 0 );
	connectA1111Nodes( graph, nodes.clipSkipNode, 0, nodes.positiveNode, 0 );
	connectA1111Nodes( graph, nodes.clipSkipNode, 0, nodes.negativeNode, 0 );
	connectA1111Nodes( graph, nodes.ckptNode, 0, nodes.samplerNode, 0 );
	connectA1111Nodes( graph, nodes.positiveNode, 0, nodes.samplerNode, 1 );
	connectA1111Nodes( graph, nodes.negativeNode, 0, nodes.samplerNode, 2 );
	connectA1111Nodes( graph, nodes.imageNode, 0, nodes.samplerNode, 3 );
	connectA1111Nodes( graph, nodes.samplerNode, 0, nodes.vaeNode, 0 );
	connectA1111Nodes( graph, nodes.ckptNode, 2, nodes.vaeNode, 1 );
	connectA1111Nodes( graph, nodes.vaeNode, 0, nodes.saveNode, 0 );

	return { graph, nodes };
}

/** Apply base options parsed from parameters text to the A1111 workflow graph nodes, such as model, sampler, steps, seed, etc.
 * - Modifies the workflow graph nodes in place based on the options specified in the parameters text
 * - Handles normalization of sampler names and schedule types for consistency with the expected node inputs
 * - Allows for accurate representation of the generation process as inferred from the parameters in the workflow graph structure
 * @param {object} opts options object parsed from parameters text
 * @param {object} nodes object containing references to key nodes in the workflow graph for easy access
 * @param {string} modelFilename filename of the model associated with the parameters, used for node labeling and analysis context
 */
function applyA1111BaseOptions( opts, nodes, modelFilename ) {
	popA1111Option( opts, 'model' );
	if( modelFilename ) {
		nodes.ckptNode.widgets_values[0] = modelFilename;
	}

	const cfgScale = popA1111Option( opts, 'cfg scale' );
	if( cfgScale !== undefined ) {
		nodes.samplerNode.widgets_values[3] = parseFloatFromText( cfgScale, 7 );
	}

	const clipSkip = popA1111Option( opts, 'clip skip' );
	if( clipSkip !== undefined ) {
		nodes.clipSkipNode.widgets_values[0] = -Math.max( 1, parseIntegerFromText( clipSkip, 1 ) );
	}

	const samplerText = popA1111Option( opts, 'sampler' );
	if( samplerText !== undefined ) {
		const normalizedSampler = normalizeSamplerForA1111Import( samplerText );
		nodes.samplerNode.widgets_values[4] = normalizedSampler.samplerName;
		nodes.samplerNode.widgets_values[5] = normalizedSampler.scheduler;
	}

	const scheduleType = popA1111Option( opts, 'schedule type' );
	if( scheduleType !== undefined ) {
		const normalizedSchedule = normalizeScheduleTypeForA1111Import( scheduleType );
		if( normalizedSchedule !== '' ) {
			nodes.samplerNode.widgets_values[5] = normalizedSchedule;
		}
	}

	const stepsValue = popA1111Option( opts, 'steps' );
	if( stepsValue !== undefined ) {
		nodes.samplerNode.widgets_values[2] = parseIntegerFromText( stepsValue, 20 );
	}

	const seedValue = popA1111Option( opts, 'seed' );
	if( seedValue !== undefined ) {
		nodes.samplerNode.widgets_values[0] = parseIntegerFromText( seedValue, 0 );
	}
}

/** Build workflow analysis data structure for A1111 parameters with support for high-resolution fix branch based on parsed options
 * - Checks for options related to high-resolution fix (hires upscale, hires resize, hires steps, hires upscaler) and modifies the workflow graph accordingly
 * - Adds nodes and links to represent the high-resolution fix process if specified in the parameters
 * - Returns references to the high-resolution sampler node and steps for further configuration if needed
 * @param {object} graph workflow graph to modify with high-resolution fix nodes and links
 * @param {object} opts options object parsed from parameters text
 * @param {object} nodes object containing references to key nodes in the workflow graph for easy access
 * @returns {object} object containing reference to the high-resolution sampler node and steps if high-resolution fix is applied, or null values if not
 */
function buildA1111HiresFixBranch( graph, opts, nodes ) {
	const sizeValue = popA1111Option( opts, 'size' );
	if( sizeValue === undefined ) {
		return { hrSamplerNode: null, hrSteps: null };
	}

	const size = parseSizeValue( sizeValue );
	const width = ceilToMultiple( size.width, 64 );
	const height = ceilToMultiple( size.height, 64 );
	nodes.imageNode.widgets_values[0] = width;
	nodes.imageNode.widgets_values[1] = height;

	const hrUp = popA1111Option( opts, 'hires upscale' );
	const hrResize = popA1111Option( opts, 'hires resize' );
	const hrSteps = popA1111Option( opts, 'hires steps' ) || null;
	const hrMethod = popA1111Option( opts, 'hires upscaler' );

	if( !hrUp && !hrResize ) {
		return { hrSamplerNode: null, hrSteps };
	}

	const { upscaleWidth, upscaleHeight } = resolveA1111HiresDimensions( width, height, hrUp, hrResize );
	const { latentSourceNode, latentSourceSlot } = createA1111HiresLatentSource(
		graph,
		nodes,
		hrMethod,
		upscaleWidth,
		upscaleHeight
	);
	const hrSamplerNode = addA1111Node( graph, 'KSampler', [ 0, 'fixed', 20, 7, 'euler', 'normal', 1 ] );

	connectA1111Nodes( graph, nodes.ckptNode, 0, hrSamplerNode, 0 );
	connectA1111Nodes( graph, nodes.positiveNode, 0, hrSamplerNode, 1 );
	connectA1111Nodes( graph, nodes.negativeNode, 0, hrSamplerNode, 2 );
	connectA1111Nodes( graph, latentSourceNode, latentSourceSlot, hrSamplerNode, 3 );

	removeInputLink( graph, nodes.vaeNode, 0, nodes.samplerNode, 0 );
	connectA1111Nodes( graph, hrSamplerNode, 0, nodes.vaeNode, 0 );

	return { hrSamplerNode, hrSteps };
}
/** Resolve the dimensions for high-resolution fix based on the original image size and the specified hires upscale or resize options
 * - If hires upscale is specified, calculate the new dimensions by multiplying the original size by the upscale factor and rounding up to the nearest multiple of 64
 * - If hires resize is specified, parse the target size and round up to the nearest multiple of 64
 * - Returns the calculated upscale width and height to be used for configuring the high-resolution fix branch in the workflow graph
 * @param {number} width original image width
 * @param {number} height original image height
 * @param {string|number|null} hrUp value of the hires upscale option, can be a numeric factor or a string representation of a number
 * @param {string|null} hrResize value of the hires resize option, can be a string representation of dimensions (e.g., "1024x1024")
 * @returns {object} object containing the calculated upscaleWidth and upscaleHeight for the high-resolution fix
 */
function resolveA1111HiresDimensions( width, height, hrUp, hrResize ) {
	if( hrUp ) {
		return {
			upscaleWidth: ceilToMultiple( width * Number( hrUp ), 64 ),
			upscaleHeight: ceilToMultiple( height * Number( hrUp ), 64 )
		};
	}

	const resizeSize = parseSizeValue( hrResize );
	return {
		upscaleWidth: ceilToMultiple( resizeSize.width, 64 ),
		upscaleHeight: ceilToMultiple( resizeSize.height, 64 )
	};
}
/** Create the source for the high-resolution latent image in the workflow graph based on the specified high-resolution method
 * - If the method is a latent upscaler, add a LatentUpscale node and connect it to the sampler node as the source for the high-resolution latent image
 * - If the method is not a latent upscaler, add nodes to decode the original latent image, upscale it with an image upscaler, and then encode it back to a latent image for use as the source in the high-resolution sampler
 * - Returns references to the latent source node and slot to be connected to the high-resolution sampler node in the workflow graph
 * @param {object} graph workflow graph to modify with high-resolution latent source nodes and links
 * @param {object} nodes object containing references to key nodes in the workflow graph for easy access
 * @param {string|null} hrMethod value of the hires upscaler option, used to determine the method for creating the high-resolution latent source
 * @param {number} upscaleWidth calculated width for the high-resolution latent image, used for configuring the nodes in the workflow graph
 * @param {number} upscaleHeight calculated height for the high-resolution latent image, used for configuring the nodes in the workflow graph
 * @returns {object} object containing references to the latent source node and slot for the high-resolution sampler node
 */
function createA1111HiresLatentSource( graph, nodes, hrMethod, upscaleWidth, upscaleHeight ) {
	if( String( hrMethod || '' ).startsWith( 'Latent' ) ) {
		const latentUpscaleNode = addA1111Node( graph, 'LatentUpscale', [ 'nearest-exact', upscaleWidth, upscaleHeight, 'disabled' ] );
		connectA1111Nodes( graph, nodes.samplerNode, 0, latentUpscaleNode, 0 );
		if( hrMethod === 'Latent (nearest-exact)' ) {
			latentUpscaleNode.widgets_values[0] = 'nearest-exact';
		}

		return { latentSourceNode: latentUpscaleNode, latentSourceSlot: 0 };
	}

	const decodeTiledNode = addA1111Node( graph, 'VAEDecodeTiled', [ 512, 64, 64, 8 ] );
	connectA1111Nodes( graph, nodes.samplerNode, 0, decodeTiledNode, 0 );
	connectA1111Nodes( graph, nodes.ckptNode, 2, decodeTiledNode, 1 );

	const upscaleLoaderNode = addA1111Node( graph, 'UpscaleModelLoader', [ '4x-AnimeSharp.pth' ] );
	if( hrMethod ) {
		upscaleLoaderNode.widgets_values[0] = hrMethod;
	}

	const imageUpscaleNode = addA1111Node( graph, 'ImageUpscaleWithModel', [] );
	connectA1111Nodes( graph, upscaleLoaderNode, 0, imageUpscaleNode, 0 );
	connectA1111Nodes( graph, decodeTiledNode, 0, imageUpscaleNode, 1 );

	const imageScaleNode = addA1111Node( graph, 'ImageScale', [ 'nearest-exact', upscaleWidth, upscaleHeight, 'disabled' ] );
	connectA1111Nodes( graph, imageUpscaleNode, 0, imageScaleNode, 0 );

	const encodeTiledNode = addA1111Node( graph, 'VAEEncodeTiled', [ 512, 64, 64, 8 ] );
	connectA1111Nodes( graph, imageScaleNode, 0, encodeTiledNode, 0 );
	connectA1111Nodes( graph, nodes.ckptNode, 2, encodeTiledNode, 1 );

	return { latentSourceNode: encodeTiledNode, latentSourceSlot: 0 };
}

/** Synchronize the settings of the high-resolution sampler node with the base sampler node based on the parsed options from parameters text
 * - If a high-resolution sampler node is present, update its settings (steps, CFG scale, sampler name, scheduler, denoising strength) to match those of the base sampler node or the specified high-resolution options
 * - Ensures consistency between the base sampling process and the high-resolution fix branch in the workflow graph based on the parameters specified for the generation
 * @param {object} opts options object parsed from parameters text containing potential high-resolution specific options
 * @param {object} samplerNode reference to the base sampler node in the workflow graph for accessing its settings
 * @param {object|null} hrSamplerNode reference to the high-resolution sampler node in the workflow graph to be updated, or null if no high-resolution fix is applied
 * @param {number|null} hrSteps value of the hires steps option if specified in the parameters text, used to set the steps for the high-resolution sampler node if applicable
 */
function syncA1111HiresSamplerSettings( opts, samplerNode, hrSamplerNode, hrSteps ) {
	if( !hrSamplerNode ) {
		return;
	}

	hrSamplerNode.widgets_values[2] = hrSteps
		? parseIntegerFromText( hrSteps, parseIntegerFromText( samplerNode.widgets_values[2], 20 ) )
		: parseIntegerFromText( samplerNode.widgets_values[2], 20 );
	hrSamplerNode.widgets_values[3] = parseFloatFromText( samplerNode.widgets_values[3], 7 );
	hrSamplerNode.widgets_values[4] = samplerNode.widgets_values[4];
	hrSamplerNode.widgets_values[5] = samplerNode.widgets_values[5];
	hrSamplerNode.widgets_values[6] = parseFloatFromText( popA1111Option( opts, 'denoising strength' ) || '1', 1 );
}

/** Apply prompt conditioning and LoRA chains to the A1111 workflow graph based on parsed parameters, with support for high-resolution fix branch if present
 * - Extract LoRA entries from positive and negative prompts and create corresponding node chains in the graph, connecting them to the appropriate nodes based on whether a high-resolution sampler node is present
 * - If a high-resolution sampler node is present, connect the LoRA chains to both the base sampler node and the high-resolution sampler node to ensure consistent conditioning across both branches
 * - Returns cleaned positive and negative prompts with LoRA tags removed for use in the prompt encoding nodes in the workflow graph
 * @param {object} graph workflow graph to modify with prompt conditioning nodes and links
 * @param {object} parsed parsed parameters object containing prompts and options
 * @param {object} nodes object containing references to key nodes in the workflow graph for easy access
 * @param {object|null} hrSamplerNode reference to the high-resolution sampler node in the workflow graph if a high-resolution fix branch is applied, or null if not
 * @returns {object} object containing cleaned positive and negative prompts with LoRA tags removed
 */
function applyA1111PromptLoraChains( graph, parsed, nodes, hrSamplerNode ) {
	const modelTargetNodes = hrSamplerNode ? [ nodes.samplerNode, hrSamplerNode ] : [ nodes.samplerNode ];
	let modelChain = { modelNode: nodes.ckptNode, modelSlot: 0, clipNode: nodes.clipSkipNode, clipSlot: 0 };

	const positiveResult = applyPromptLoraChain( graph, parsed.positivePrompt, modelChain, nodes.positiveNode, modelTargetNodes );
	modelChain = positiveResult.modelChain;

	const negativeResult = applyPromptLoraChain( graph, parsed.negativePrompt, modelChain, nodes.negativeNode, modelTargetNodes );

	return {
		positivePrompt: positiveResult.promptText,
		negativePrompt: negativeResult.promptText
	};
}
/** Apply a single prompt LoRA chain to the workflow graph based on the given prompt text and current model chain
 * - Extract LoRA entries from the prompt text and create a corresponding node chain in the graph, connecting it to the current model chain and the target CLIP node for the prompt encoding
 * - Connect the end of the LoRA chain to the specified target nodes for the model (sampler nodes) to ensure the conditioning is applied to the sampling process
 * - Returns the cleaned prompt text with LoRA tags removed and the updated model chain references for potential further chaining with the other prompt
 * @param {object} graph workflow graph to modify with the prompt LoRA chain nodes and links
 * @param {string} promptText original prompt text containing potential LoRA tags to be extracted and applied as a chain in the workflow graph
 * @param {object} modelChain object containing references to the current model node and slot, and the CLIP node and slot for connecting the LoRA chain
 * @param {object} clipTargetNode reference to the CLIP node in the workflow graph that serves as the target for connecting the LoRA chain for prompt encoding
 * @param {array} modelTargetNodes array of references to the model nodes in the workflow graph that serve as targets for connecting the end of the LoRA chain to apply the conditioning to the sampling process
 * @returns {object} object containing the cleaned prompt text with LoRA tags removed and the updated model chain references after applying the LoRA chain
 */
function applyPromptLoraChain( graph, promptText, modelChain, clipTargetNode, modelTargetNodes ) {
	const loraParse = extractLoraEntries( promptText );
	if( loraParse.loras.length === 0 ) {
		return { promptText: loraParse.cleanedText, modelChain };
	}

	const nextModelChain = createLoraNodeChain(
		graph,
		loraParse.loras,
		modelChain.modelNode,
		modelChain.modelSlot,
		modelChain.clipNode,
		modelChain.clipSlot
	);

	removeInputLink( graph, clipTargetNode, 0 );
	connectA1111Nodes( graph, nextModelChain.clipNode, nextModelChain.clipSlot, clipTargetNode, 0 );

	modelTargetNodes.forEach( node => {
		removeInputLink( graph, node, 0 );
		connectA1111Nodes( graph, nextModelChain.modelNode, nextModelChain.modelSlot, node, 0 );
	} );

	return {
		promptText: loraParse.cleanedText,
		modelChain: nextModelChain
	};
}


/** Build workflow analysis data structure from given graph, with a specified workflow revision label
 * @param {object} graph workflow graph to build analysis data from
 * @param {string} workflowRevision label for the workflow revision, used for analysis context and comparison
 * @returns {object} workflow analysis data structure containing nodes, links, and metadata
 */
function buildParameterWorkflowResult( graph, workflowRevision ) {
	const analysisData = buildWorkflowAnalysisData( graph );
	return {
		analysisData: {
			...analysisData,
			workflowId: 'Inferred from Parameters',
			workflowRevision
		},
		nodePortDefinitions: getPortDefinitions(),
		workflowGraph: graph
	};
}


/** Pop an option from the options object by name, returning its value and removing it from the object
 * - Used to extract options from the parsed parameters while building the workflow graph, allowing for sequential processing of options and cleaner code
 * @param {object} opts options object parsed from parameters text, containing key-value pairs of options to be applied to the workflow graph
 * @param {string} name name of the option to pop from the object
 * @returns {*} value of the popped option if it exists, or undefined if the option is not present in the object
 */
function popA1111Option( opts, name ) {
	const value = opts[ name ];
	delete opts[ name ];
	return value;
}