import { buildWorkflowAnalysisData } from './analysis.js';

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

function normalizeA1111ParametersText( text ) {
	const raw = String( text || '' ).trim();
	if( raw === '' ) {
		return '';
	}

	// Some DB/API payloads persist escaped line breaks ("\\n") instead of real newlines.
	return raw
		.replaceAll( '\\r\\n', '\n' )
		.replaceAll( '\\n', '\n' )
		.replaceAll( '\\r', '\n' )
		.replaceAll( '\r\n', '\n' )
		.replaceAll( '\r', '\n' )
		.trim();
}

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

function parseIntegerFromText( value, fallbackValue ) {
	const parsed = Number.parseInt( String( value || '' ).trim(), 10 );
	return Number.isFinite( parsed ) ? parsed : fallbackValue;
}

function parseFloatFromText( value, fallbackValue ) {
	const parsed = Number.parseFloat( String( value || '' ).trim() );
	return Number.isFinite( parsed ) ? parsed : fallbackValue;
}

function parseSizeValue( rawSize ) {
	const match = String( rawSize || '' ).match( /(\d+)\s*[xX]\s*(\d+)/ );
	if( !match ) {
		return { width: 512, height: 512 };
	}

	return {
		width: parseIntegerFromText( match[1], 512 ),
		height: parseIntegerFromText( match[2], 512 )
	};
}

function ceilToMultiple( value, multiple ) {
	const normalizedValue = Math.max( 1, Number( value ) || 1 );
	const normalizedMultiple = Math.max( 1, Number( multiple ) || 1 );
	return Math.ceil( normalizedValue / normalizedMultiple ) * normalizedMultiple;
}

function getDefaultPortDefinitionsForParameterWorkflow() {
	return {
		CheckpointLoaderSimple: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'ckpt_name' },
				{ port_type: 'output', port_index: 0, label: 'MODEL' },
				{ port_type: 'output', port_index: 1, label: 'CLIP' },
				{ port_type: 'output', port_index: 2, label: 'VAE' }
			]
		},
		UnetLoaderGGUF: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'unet_name' },
				{ port_type: 'output', port_index: 0, label: 'MODEL' }
			]
		},
		VAELoader: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'vae_name' },
				{ port_type: 'output', port_index: 0, label: 'VAE' }
			]
		},
		DualCLIPLoader: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'clip_name1' },
				{ port_type: 'widget', port_index: 1, label: 'clip_name2' },
				{ port_type: 'widget', port_index: 2, label: 'type' },
				{ port_type: 'widget', port_index: 3, label: 'device' },
				{ port_type: 'output', port_index: 0, label: 'CLIP' }
			]
		},
		CLIPSetLastLayer: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'clip' },
				{ port_type: 'widget', port_index: 0, label: 'stop_at_clip_layer' },
				{ port_type: 'output', port_index: 0, label: 'CLIP' }
			]
		},
		CLIPTextEncode: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'clip' },
				{ port_type: 'widget', port_index: 0, label: 'text' },
				{ port_type: 'output', port_index: 0, label: 'CONDITIONING' }
			]
		},
		EmptyLatentImage: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'width' },
				{ port_type: 'widget', port_index: 1, label: 'height' },
				{ port_type: 'widget', port_index: 2, label: 'batch_size' },
				{ port_type: 'output', port_index: 0, label: 'LATENT' }
			]
		},
		EmptySD3LatentImage: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'width' },
				{ port_type: 'widget', port_index: 1, label: 'height' },
				{ port_type: 'widget', port_index: 2, label: 'batch_size' },
				{ port_type: 'output', port_index: 0, label: 'LATENT' }
			]
		},
		KSampler: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'model' },
				{ port_type: 'input', port_index: 1, label: 'positive' },
				{ port_type: 'input', port_index: 2, label: 'negative' },
				{ port_type: 'input', port_index: 3, label: 'latent_image' },
				{ port_type: 'widget', port_index: 0, label: 'seed' },
				{ port_type: 'widget', port_index: 1, label: 'control_after_generate' },
				{ port_type: 'widget', port_index: 2, label: 'steps' },
				{ port_type: 'widget', port_index: 3, label: 'cfg' },
				{ port_type: 'widget', port_index: 4, label: 'sampler_name' },
				{ port_type: 'widget', port_index: 5, label: 'scheduler' },
				{ port_type: 'widget', port_index: 6, label: 'denoise' },
				{ port_type: 'output', port_index: 0, label: 'LATENT' }
			]
		},
		KSamplerSelect: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'sampler_name' },
				{ port_type: 'output', port_index: 0, label: 'SAMPLER' }
			]
		},
		BasicScheduler: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'model' },
				{ port_type: 'widget', port_index: 0, label: 'scheduler' },
				{ port_type: 'widget', port_index: 1, label: 'steps' },
				{ port_type: 'widget', port_index: 2, label: 'denoise' },
				{ port_type: 'output', port_index: 0, label: 'SIGMAS' }
			]
		},
		RandomNoise: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'noise_seed' },
				{ port_type: 'widget', port_index: 1, label: 'control_after_generate' },
				{ port_type: 'output', port_index: 0, label: 'NOISE' }
			]
		},
		FluxGuidance: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'conditioning' },
				{ port_type: 'widget', port_index: 0, label: 'guidance' },
				{ port_type: 'output', port_index: 0, label: 'CONDITIONING' }
			]
		},
		BasicGuider: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'model' },
				{ port_type: 'input', port_index: 1, label: 'conditioning' },
				{ port_type: 'output', port_index: 0, label: 'GUIDER' }
			]
		},
		SamplerCustomAdvanced: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'noise' },
				{ port_type: 'input', port_index: 1, label: 'guider' },
				{ port_type: 'input', port_index: 2, label: 'sampler' },
				{ port_type: 'input', port_index: 3, label: 'sigmas' },
				{ port_type: 'input', port_index: 4, label: 'latent_image' },
				{ port_type: 'output', port_index: 0, label: 'output' },
				{ port_type: 'output', port_index: 1, label: 'denoised_output' }
			]
		},
		VAEDecode: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'samples' },
				{ port_type: 'input', port_index: 1, label: 'vae' },
				{ port_type: 'output', port_index: 0, label: 'IMAGE' }
			]
		},
		PreviewImage: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'images' }
			]
		},
		SaveImage: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'images' },
				{ port_type: 'widget', port_index: 0, label: 'filename_prefix' }
			]
		},
		VAEDecodeTiled: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'samples' },
				{ port_type: 'input', port_index: 1, label: 'vae' },
				{ port_type: 'widget', port_index: 0, label: 'tile_size' },
				{ port_type: 'widget', port_index: 1, label: 'overlap' },
				{ port_type: 'widget', port_index: 2, label: 'temporal_size' },
				{ port_type: 'widget', port_index: 3, label: 'temporal_overlap' },
				{ port_type: 'output', port_index: 0, label: 'IMAGE' }
			]
		},
		UpscaleModelLoader: {
			ports: [
				{ port_type: 'widget', port_index: 0, label: 'model_name' },
				{ port_type: 'output', port_index: 0, label: 'UPSCALE_MODEL' }
			]
		},
		ImageUpscaleWithModel: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'upscale_model' },
				{ port_type: 'input', port_index: 1, label: 'image' },
				{ port_type: 'output', port_index: 0, label: 'IMAGE' }
			]
		},
		ImageScale: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'image' },
				{ port_type: 'widget', port_index: 0, label: 'upscale_method' },
				{ port_type: 'widget', port_index: 1, label: 'width' },
				{ port_type: 'widget', port_index: 2, label: 'height' },
				{ port_type: 'widget', port_index: 3, label: 'crop' },
				{ port_type: 'output', port_index: 0, label: 'IMAGE' }
			]
		},
		VAEEncodeTiled: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'pixels' },
				{ port_type: 'input', port_index: 1, label: 'vae' },
				{ port_type: 'widget', port_index: 0, label: 'tile_size' },
				{ port_type: 'widget', port_index: 1, label: 'overlap' },
				{ port_type: 'widget', port_index: 2, label: 'temporal_size' },
				{ port_type: 'widget', port_index: 3, label: 'temporal_overlap' },
				{ port_type: 'output', port_index: 0, label: 'LATENT' }
			]
		},
		LoraLoader: {
			ports: [
				{ port_type: 'input', port_index: 0, label: 'model' },
				{ port_type: 'input', port_index: 1, label: 'clip' },
				{ port_type: 'widget', port_index: 0, label: 'lora_name' },
				{ port_type: 'widget', port_index: 1, label: 'strength_model' },
				{ port_type: 'widget', port_index: 2, label: 'strength_clip' },
				{ port_type: 'output', port_index: 0, label: 'MODEL' },
				{ port_type: 'output', port_index: 1, label: 'CLIP' }
			]
		}
	};
}

function parseA1111OptionsFromParameters( parametersText ) {
	const text = normalizeA1111ParametersText( parametersText );
	if( text === '' ) {
		return null;
	}

	const stepsLabelMatch = text.match( /steps\s*:/i );
	if( !stepsLabelMatch || typeof stepsLabelMatch.index !== 'number' ) {
		return null;
	}

	const p = stepsLabelMatch.index;
	const optionsBlock = text.substring( p ).trim();
	const optionLines = optionsBlock
		.split( '\n' )
		.map( line => line.trim() )
		.filter( line => line.includes( ':' ) );

	const opts = {};

	if( optionLines.length > 1 ) {
		optionLines.forEach( line => {
			const colonIndex = line.indexOf( ':' );
			if( colonIndex <= 0 ) {
				return;
			}

			const key = line.substring( 0, colonIndex ).trim().toLowerCase();
			const value = line.substring( colonIndex + 1 ).trim();
			if( key !== '' ) {
				opts[ key ] = value;
			}
		} );
	} else {
		const optionsLine = optionLines[0] || '';
		const matchResult = optionsLine.match(
			new RegExp( '\\s*([^:]+:\\s*([^"\\{].*?|".*?"|\\{.*?\\}))\\s*(,|$)', 'g' )
		);
		if( Array.isArray( matchResult ) ) {
			matchResult.forEach( item => {
				const parts = item.split( ':' );
				if( parts.length < 2 ) {
					return;
				}

				if( parts[1].endsWith( ',' ) ) {
					parts[1] = parts[1].substr( 0, parts[1].length - 1 );
				}

				opts[ parts[0].trim().toLowerCase() ] = parts.slice( 1 ).join( ':' ).trim();
			} );
		}
	}

	if( Object.keys( opts ).length === 0 ) {
		return null;
	}

	let p2 = -1;
	const beforeStepsText = text.substring( 0, p );
	const negativeMatches = [ ...beforeStepsText.matchAll( /(^|\n)\s*negative\s*prompt\s*:/gi ) ];
	if( negativeMatches.length > 0 ) {
		const lastNegative = negativeMatches[ negativeMatches.length - 1 ];
		if( typeof lastNegative.index === 'number' ) {
			p2 = lastNegative.index + ( lastNegative[1] ? lastNegative[1].length : 0 );
		}
	}
	const hasNegativePrompt = p2 > -1;
	const positivePrompt = hasNegativePrompt
		? text.substring( 0, p2 ).trim()
		: text.substring( 0, p ).trim();
	const negativePrompt = hasNegativePrompt
		? text.substring( p2, p ).replace( /^\s*negative\s*prompt\s*:/i, '' ).trim()
		: '';

	return { positivePrompt, negativePrompt, opts };
}

function getGraphNodeTemplate( type, instanceIndex = 1 ) {
	const templates = {
		CheckpointLoaderSimple: { pos: [ 100, 130 ], size: [ 270, 98 ], inputs: [ { name: 'ckpt_name', type: 'COMBO', widget: true } ], outputs: [ { name: 'MODEL', type: 'MODEL' }, { name: 'CLIP', type: 'CLIP' }, { name: 'VAE', type: 'VAE' } ] },
		UnetLoaderGGUF: { pos: [ 100, 130 ], size: [ 270, 58 ], inputs: [ { name: 'unet_name', type: 'COMBO', widget: true } ], outputs: [ { name: 'MODEL', type: 'MODEL' } ] },
		VAELoader: { pos: [ 100, 318 ], size: [ 270, 58 ], inputs: [ { name: 'vae_name', type: 'COMBO', widget: true } ], outputs: [ { name: 'VAE', type: 'VAE' } ] },
		DualCLIPLoader: { pos: [ 100, 506 ], size: [ 270, 130 ], inputs: [ { name: 'clip_name1', type: 'COMBO', widget: true }, { name: 'clip_name2', type: 'COMBO', widget: true }, { name: 'type', type: 'COMBO', widget: true }, { name: 'device', type: 'COMBO', widget: true } ], outputs: [ { name: 'CLIP', type: 'CLIP' } ] },
		CLIPSetLastLayer: { pos: [ 470, 130 ], size: [ 270, 58 ], inputs: [ { name: 'clip', type: 'CLIP' }, { name: 'stop_at_clip_layer', type: 'INT', widget: true } ], outputs: [ { name: 'CLIP', type: 'CLIP' } ] },
		CLIPTextEncode: { pos: instanceIndex === 2 ? [ 840, 460 ] : [ 840, 130 ], size: [ 400, 200 ], inputs: [ { name: 'clip', type: 'CLIP' }, { name: 'text', type: 'STRING', widget: true } ], outputs: [ { name: 'CONDITIONING', type: 'CONDITIONING' } ] },
		EmptySD3LatentImage: { pos: [ 100, 766 ], size: [ 270, 106 ], inputs: [ { name: 'width', type: 'INT', widget: true }, { name: 'height', type: 'INT', widget: true }, { name: 'batch_size', type: 'INT', widget: true } ], outputs: [ { name: 'LATENT', type: 'LATENT' } ] },
		KSamplerSelect: { pos: [ 100, 1002 ], size: [ 270, 58 ], inputs: [ { name: 'sampler_name', type: 'COMBO', widget: true } ], outputs: [ { name: 'SAMPLER', type: 'SAMPLER' } ] },
		BasicScheduler: { pos: [ 860.4380859375, 130 ], size: [ 270, 106 ], inputs: [ { name: 'model', type: 'MODEL' }, { name: 'scheduler', type: 'COMBO', widget: true }, { name: 'steps', type: 'INT', widget: true }, { name: 'denoise', type: 'FLOAT', widget: true } ], outputs: [ { name: 'SIGMAS', type: 'SIGMAS' } ] },
		RandomNoise: { pos: [ 100, 1190 ], size: [ 270, 82 ], inputs: [ { name: 'noise_seed', type: 'INT', widget: true }, { name: 'control_after_generate', type: 'COMBO', widget: true } ], outputs: [ { name: 'NOISE', type: 'NOISE' } ] },
		FluxGuidance: { pos: [ 1360.4380859375, 130 ], size: [ 270, 58 ], inputs: [ { name: 'conditioning', type: 'CONDITIONING' }, { name: 'guidance', type: 'FLOAT', widget: true } ], outputs: [ { name: 'CONDITIONING', type: 'CONDITIONING' } ] },
		BasicGuider: { pos: [ 1730.4380859375, 130 ], size: [ 160, 46 ], inputs: [ { name: 'model', type: 'MODEL' }, { name: 'conditioning', type: 'CONDITIONING' } ], outputs: [ { name: 'GUIDER', type: 'GUIDER' } ] },
		SamplerCustomAdvanced: { pos: [ 1990.0064453125, 130 ], size: [ 212.3638671875, 106 ], inputs: [ { name: 'noise', type: 'NOISE' }, { name: 'guider', type: 'GUIDER' }, { name: 'sampler', type: 'SAMPLER' }, { name: 'sigmas', type: 'SIGMAS' }, { name: 'latent_image', type: 'LATENT' } ], outputs: [ { name: 'output', type: 'LATENT' }, { name: 'denoised_output', type: 'LATENT' } ] },
		PreviewImage: { pos: [ 2542.3703125, 130 ], size: [ 140, 26 ], inputs: [ { name: 'images', type: 'IMAGE' } ], outputs: [] },
		KSampler: { pos: instanceIndex === 2 ? [ 3153.5689453125, 130 ] : [ 1340, 130 ], size: [ 270, 262 ], inputs: [ { name: 'model', type: 'MODEL' }, { name: 'positive', type: 'CONDITIONING' }, { name: 'negative', type: 'CONDITIONING' }, { name: 'latent_image', type: 'LATENT' }, { name: 'seed', type: 'INT', widget: true }, { name: 'control_after_generate', type: 'COMBO', widget: true }, { name: 'steps', type: 'INT', widget: true }, { name: 'cfg', type: 'FLOAT', widget: true }, { name: 'sampler_name', type: 'COMBO', widget: true }, { name: 'scheduler', type: 'COMBO', widget: true }, { name: 'denoise', type: 'FLOAT', widget: true } ], outputs: [ { name: 'LATENT', type: 'LATENT' } ] },
		EmptyLatentImage: { pos: [ 100, 358 ], size: [ 270, 106 ], inputs: [ { name: 'width', type: 'INT', widget: true }, { name: 'height', type: 'INT', widget: true }, { name: 'batch_size', type: 'INT', widget: true } ], outputs: [ { name: 'LATENT', type: 'LATENT' } ] },
		VAEDecode: { pos: [ 3523.5689453125, 130 ], size: [ 140, 46 ], inputs: [ { name: 'samples', type: 'LATENT' }, { name: 'vae', type: 'VAE' } ], outputs: [ { name: 'IMAGE', type: 'IMAGE' } ] },
		SaveImage: { pos: [ 3763.5689453125, 130 ], size: [ 270, 58 ], inputs: [ { name: 'images', type: 'IMAGE' }, { name: 'filename_prefix', type: 'STRING', widget: true } ], outputs: [] },
		VAEDecodeTiled: { pos: [ 1710, 130 ], size: [ 270, 150 ], inputs: [ { name: 'samples', type: 'LATENT' }, { name: 'vae', type: 'VAE' }, { name: 'tile_size', type: 'INT', widget: true }, { name: 'overlap', type: 'INT', widget: true }, { name: 'temporal_size', type: 'INT', widget: true }, { name: 'temporal_overlap', type: 'INT', widget: true } ], outputs: [ { name: 'IMAGE', type: 'IMAGE' } ] },
		UpscaleModelLoader: { pos: [ 100, 594 ], size: [ 270, 58 ], inputs: [ { name: 'model_name', type: 'COMBO', widget: true } ], outputs: [ { name: 'UPSCALE_MODEL', type: 'UPSCALE_MODEL' } ] },
		ImageUpscaleWithModel: { pos: [ 2080, 130 ], size: [ 233.5689453125, 46 ], inputs: [ { name: 'upscale_model', type: 'UPSCALE_MODEL' }, { name: 'image', type: 'IMAGE' } ], outputs: [ { name: 'IMAGE', type: 'IMAGE' } ] },
		ImageScale: { pos: [ 2413.5689453125, 130 ], size: [ 270, 130 ], inputs: [ { name: 'image', type: 'IMAGE' }, { name: 'upscale_method', type: 'COMBO', widget: true }, { name: 'width', type: 'INT', widget: true }, { name: 'height', type: 'INT', widget: true }, { name: 'crop', type: 'COMBO', widget: true } ], outputs: [ { name: 'IMAGE', type: 'IMAGE' } ] },
		VAEEncodeTiled: { pos: [ 2783.5689453125, 130 ], size: [ 270, 150 ], inputs: [ { name: 'pixels', type: 'IMAGE' }, { name: 'vae', type: 'VAE' }, { name: 'tile_size', type: 'INT', widget: true }, { name: 'overlap', type: 'INT', widget: true }, { name: 'temporal_size', type: 'INT', widget: true }, { name: 'temporal_overlap', type: 'INT', widget: true } ], outputs: [ { name: 'LATENT', type: 'LATENT' } ] },
		LatentUpscale: { pos: [ 2413.5689453125, 130 ], size: [ 270, 130 ], inputs: [ { name: 'samples', type: 'LATENT' }, { name: 'upscale_method', type: 'COMBO', widget: true }, { name: 'width', type: 'INT', widget: true }, { name: 'height', type: 'INT', widget: true }, { name: 'crop', type: 'COMBO', widget: true } ], outputs: [ { name: 'LATENT', type: 'LATENT' } ] },
		LoraLoader: { pos: [ 580, 300 ], size: [ 270, 130 ], inputs: [ { name: 'model', type: 'MODEL' }, { name: 'clip', type: 'CLIP' }, { name: 'lora_name', type: 'COMBO', widget: true }, { name: 'strength_model', type: 'FLOAT', widget: true }, { name: 'strength_clip', type: 'FLOAT', widget: true } ], outputs: [ { name: 'MODEL', type: 'MODEL' }, { name: 'CLIP', type: 'CLIP' } ] }
	};

	return templates[ type ] || { pos: [ 100, 100 ], size: [ 270, 58 ], inputs: [], outputs: [] };
}

function createA1111WorkflowGraph( imageId ) {
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

function addA1111Node( graph, type, widgetsValues = [] ) {
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

function connectA1111Nodes( graph, fromNode, fromSlot, toNode, toSlot ) {
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

function popA1111Option( opts, name ) {
	const value = opts[ name ];
	delete opts[ name ];
	return value;
}

function normalizeSamplerForA1111Import( samplerRaw ) {
	let samplerName = String( samplerRaw || '' ).toLowerCase().replace( '++', 'pp' ).replaceAll( ' ', '_' );
	let scheduler = 'normal';

	if( samplerName.includes( 'karras' ) ) {
		samplerName = samplerName.replace( 'karras', '' ).replace( /_+$/, '' );
		scheduler = 'karras';
	}

	if( samplerName === 'euler_a' || samplerName === '' ) {
		samplerName = 'euler';
	}

	return { samplerName, scheduler };
}

function normalizeScheduleTypeForA1111Import( scheduleTypeRaw ) {
	const normalized = String( scheduleTypeRaw || '' ).trim().toLowerCase().replaceAll( ' ', '_' );
	if( normalized === '' ) {
		return '';
	}

	const scheduleAliases = {
		karras: 'karras',
		normal: 'normal',
		exponential: 'exponential',
		sgm_uniform: 'sgm_uniform',
		simple: 'simple',
		ddim_uniform: 'ddim_uniform',
		beta: 'beta',
		linear_quadratic: 'linear_quadratic'
	};

	return scheduleAliases[ normalized ] || normalized;
}

function normalizeSamplerForFluxImport( samplerRaw ) {
	let samplerName = String( samplerRaw || '' ).toLowerCase().replace( '++', 'pp' ).replaceAll( ' ', '_' );
	let scheduler = 'normal';

	if( samplerName.includes( 'karras' ) ) {
		samplerName = samplerName.replace( 'karras', '' ).replace( /_+$/, '' );
		scheduler = 'karras';
	}

	if( samplerName === 'euler_a' ) {
		samplerName = 'euler_ancestral';
	}

	if( samplerName === '' ) {
		samplerName = 'euler_ancestral';
	}

	return { samplerName, scheduler };
}

function extractLoraEntries( text ) {
	const loras = [];
	const cleaned = String( text || '' ).replace( /<lora:([^:]+:[^>]+)>/g, ( _m, capture ) => {
		const parts = String( capture || '' ).split( ':' );
		const weight = Number.parseFloat( parts[1] );
		if( parts[0] && Number.isFinite( weight ) ) {
			loras.push( { name: parts[0], weight } );
		}
		return '';
	} );

	return { cleanedText: cleaned.trim(), loras };
}

function createLoraNodeChain( graph, loras, startModelNode, startModelSlot, startClipNode, startClipSlot ) {
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

function buildFluxGGUFWorkflowFromParsed( parsed, imageId, modelFilename = '' ) {
	const opts = { ...parsed.opts };
	const graph = createA1111WorkflowGraph( imageId );

	popA1111Option( opts, 'model' );
	const unetName = modelFilename || 'flux.gguf';
	const modelNode = addA1111Node( graph, 'UnetLoaderGGUF', [ unetName ] );
	const vaeLoaderNode = addA1111Node( graph, 'VAELoader', [ 'ae.safetensors' ] );
	const dualClipNode = addA1111Node( graph, 'DualCLIPLoader', [ 't5xxl_fp16.safetensors', 'clip_l.safetensors', 'flux', 'default' ] );
	const positiveNode = addA1111Node( graph, 'CLIPTextEncode', [ '' ] );
	const negativeNode = addA1111Node( graph, 'CLIPTextEncode', [ '' ] );
	const latentNode = addA1111Node( graph, 'EmptySD3LatentImage', [ 1024, 1024, 1 ] );
	const samplerSelectNode = addA1111Node( graph, 'KSamplerSelect', [ 'euler_ancestral' ] );
	const schedulerNode = addA1111Node( graph, 'BasicScheduler', [ 'normal', 20, 1 ] );
	const noiseNode = addA1111Node( graph, 'RandomNoise', [ 0, 'fixed' ] );
	const fluxGuidanceNode = addA1111Node( graph, 'FluxGuidance', [ 7 ] );
	const guiderNode = addA1111Node( graph, 'BasicGuider', [] );
	const samplerAdvancedNode = addA1111Node( graph, 'SamplerCustomAdvanced', [] );
	const decodeNode = addA1111Node( graph, 'VAEDecode', [] );
	const previewNode = addA1111Node( graph, 'PreviewImage', [] );

	connectA1111Nodes( graph, positiveNode, 0, fluxGuidanceNode, 0 );
	connectA1111Nodes( graph, noiseNode, 0, samplerAdvancedNode, 0 );
	connectA1111Nodes( graph, guiderNode, 0, samplerAdvancedNode, 1 );
	connectA1111Nodes( graph, samplerSelectNode, 0, samplerAdvancedNode, 2 );
	connectA1111Nodes( graph, schedulerNode, 0, samplerAdvancedNode, 3 );
	connectA1111Nodes( graph, latentNode, 0, samplerAdvancedNode, 4 );
	connectA1111Nodes( graph, samplerAdvancedNode, 0, decodeNode, 0 );
	connectA1111Nodes( graph, vaeLoaderNode, 0, decodeNode, 1 );
	connectA1111Nodes( graph, decodeNode, 0, previewNode, 0 );

	const sizeValue = popA1111Option( opts, 'size' );
	if( sizeValue !== undefined ) {
		const size = parseSizeValue( sizeValue );
		latentNode.widgets_values[0] = ceilToMultiple( size.width, 64 );
		latentNode.widgets_values[1] = ceilToMultiple( size.height, 64 );
	}

	const stepsValue = popA1111Option( opts, 'steps' );
	if( stepsValue !== undefined ) {
		schedulerNode.widgets_values[1] = parseIntegerFromText( stepsValue, 20 );
	}

	const seedValue = popA1111Option( opts, 'seed' );
	if( seedValue !== undefined ) {
		noiseNode.widgets_values[0] = parseIntegerFromText( seedValue, 0 );
	}

	const cfgScale = popA1111Option( opts, 'cfg scale' );
	if( cfgScale !== undefined ) {
		fluxGuidanceNode.widgets_values[0] = parseFloatFromText( cfgScale, 7 );
	}

	const samplerText = popA1111Option( opts, 'sampler' );
	if( samplerText !== undefined ) {
		const normalizedSampler = normalizeSamplerForFluxImport( samplerText );
		samplerSelectNode.widgets_values[0] = normalizedSampler.samplerName;
		schedulerNode.widgets_values[0] = normalizedSampler.scheduler;
	}

	const scheduleType = popA1111Option( opts, 'schedule type' );
	if( scheduleType !== undefined ) {
		const normalizedSchedule = normalizeScheduleTypeForA1111Import( scheduleType );
		if( normalizedSchedule !== '' ) {
			schedulerNode.widgets_values[0] = normalizedSchedule;
		}
	}

	const denoiseValue = popA1111Option( opts, 'denoising strength' );
	if( denoiseValue !== undefined ) {
		schedulerNode.widgets_values[2] = parseFloatFromText( denoiseValue, 1 );
	}

	let positivePrompt = parsed.positivePrompt;
	let negativePrompt = parsed.negativePrompt;

	const positiveLoraParse = extractLoraEntries( positivePrompt );
	positivePrompt = positiveLoraParse.cleanedText;
	let modelChain = createLoraNodeChain( graph, positiveLoraParse.loras, modelNode, 0, dualClipNode, 0 );

	const negativeLoraParse = extractLoraEntries( negativePrompt );
	negativePrompt = negativeLoraParse.cleanedText;
	if( negativeLoraParse.loras.length > 0 ) {
		modelChain = createLoraNodeChain( graph, negativeLoraParse.loras, modelChain.modelNode, modelChain.modelSlot, modelChain.clipNode, modelChain.clipSlot );
	}

	connectA1111Nodes( graph, modelChain.clipNode, modelChain.clipSlot, positiveNode, 0 );
	connectA1111Nodes( graph, modelChain.clipNode, modelChain.clipSlot, negativeNode, 0 );
	connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, schedulerNode, 0 );
	connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, guiderNode, 0 );
	connectA1111Nodes( graph, fluxGuidanceNode, 0, guiderNode, 1 );

	positiveNode.widgets_values[0] = positivePrompt;
	negativeNode.widgets_values[0] = negativePrompt;

	const analysisData = buildWorkflowAnalysisData( graph );
	return {
		analysisData: {
			...analysisData,
			workflowId: 'Inferred from Parameters',
			workflowRevision: 'A1111 Flux/GGUF parity'
		},
		nodePortDefinitions: getDefaultPortDefinitionsForParameterWorkflow(),
		workflowGraph: graph
	};
}

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
	let positivePrompt = parsed.positivePrompt;
	let negativePrompt = parsed.negativePrompt;

	const graph = createA1111WorkflowGraph( imageId );

	const ckptNode = addA1111Node( graph, 'CheckpointLoaderSimple', [ 'from_parameters' ] );
	const clipSkipNode = addA1111Node( graph, 'CLIPSetLastLayer', [ -1 ] );
	const positiveNode = addA1111Node( graph, 'CLIPTextEncode', [ '' ] );
	const negativeNode = addA1111Node( graph, 'CLIPTextEncode', [ '' ] );
	const samplerNode = addA1111Node( graph, 'KSampler', [ 0, 'fixed', 20, 7, 'euler', 'normal', 1 ] );
	const imageNode = addA1111Node( graph, 'EmptyLatentImage', [ 512, 512, 1 ] );
	const vaeNode = addA1111Node( graph, 'VAEDecode', [] );
	const saveNode = addA1111Node( graph, 'SaveImage', [ 'ComfyUI' ] );

	connectA1111Nodes( graph, ckptNode, 1, clipSkipNode, 0 );
	connectA1111Nodes( graph, clipSkipNode, 0, positiveNode, 0 );
	connectA1111Nodes( graph, clipSkipNode, 0, negativeNode, 0 );
	connectA1111Nodes( graph, ckptNode, 0, samplerNode, 0 );
	connectA1111Nodes( graph, positiveNode, 0, samplerNode, 1 );
	connectA1111Nodes( graph, negativeNode, 0, samplerNode, 2 );
	connectA1111Nodes( graph, imageNode, 0, samplerNode, 3 );
	connectA1111Nodes( graph, samplerNode, 0, vaeNode, 0 );
	connectA1111Nodes( graph, ckptNode, 2, vaeNode, 1 );
	connectA1111Nodes( graph, vaeNode, 0, saveNode, 0 );

	let hrSamplerNode = null;
	let hrSteps = null;

	popA1111Option( opts, 'model' );
	if( modelFilename ) {
		ckptNode.widgets_values[0] = modelFilename;
	}

	const cfgScale = popA1111Option( opts, 'cfg scale' );
	if( cfgScale !== undefined ) {
		samplerNode.widgets_values[3] = parseFloatFromText( cfgScale, 7 );
	}

	const clipSkip = popA1111Option( opts, 'clip skip' );
	if( clipSkip !== undefined ) {
		clipSkipNode.widgets_values[0] = -Math.max( 1, parseIntegerFromText( clipSkip, 1 ) );
	}

	const samplerText = popA1111Option( opts, 'sampler' );
	if( samplerText !== undefined ) {
		const normalizedSampler = normalizeSamplerForA1111Import( samplerText );
		samplerNode.widgets_values[4] = normalizedSampler.samplerName;
		samplerNode.widgets_values[5] = normalizedSampler.scheduler;
	}

	const scheduleType = popA1111Option( opts, 'schedule type' );
	if( scheduleType !== undefined ) {
		const normalizedSchedule = normalizeScheduleTypeForA1111Import( scheduleType );
		if( normalizedSchedule !== '' ) {
			samplerNode.widgets_values[5] = normalizedSchedule;
		}
	}

	const sizeValue = popA1111Option( opts, 'size' );
	if( sizeValue !== undefined ) {
		const size = parseSizeValue( sizeValue );
		const width = ceilToMultiple( size.width, 64 );
		const height = ceilToMultiple( size.height, 64 );
		imageNode.widgets_values[0] = width;
		imageNode.widgets_values[1] = height;

		const hrUp = popA1111Option( opts, 'hires upscale' );
		const hrResize = popA1111Option( opts, 'hires resize' );
		hrSteps = popA1111Option( opts, 'hires steps' ) || null;
		let hrMethod = popA1111Option( opts, 'hires upscaler' );

		if( hrUp || hrResize ) {
			let upscaleWidth = width;
			let upscaleHeight = height;

			if( hrUp ) {
				upscaleWidth = ceilToMultiple( width * Number( hrUp ), 64 );
				upscaleHeight = ceilToMultiple( height * Number( hrUp ), 64 );
			} else if( hrResize ) {
				const resizeSize = parseSizeValue( hrResize );
				upscaleWidth = ceilToMultiple( resizeSize.width, 64 );
				upscaleHeight = ceilToMultiple( resizeSize.height, 64 );
			}

			let latentSourceNode = null;
			let latentSourceSlot = 0;

			if( String( hrMethod || '' ).startsWith( 'Latent' ) ) {
				const latentUpscaleNode = addA1111Node( graph, 'LatentUpscale', [ 'nearest-exact', upscaleWidth, upscaleHeight, 'disabled' ] );
				connectA1111Nodes( graph, samplerNode, 0, latentUpscaleNode, 0 );
				if( hrMethod === 'Latent (nearest-exact)' ) {
					latentUpscaleNode.widgets_values[0] = 'nearest-exact';
				}
				latentSourceNode = latentUpscaleNode;
				latentSourceSlot = 0;
			} else {
				const decodeTiledNode = addA1111Node( graph, 'VAEDecodeTiled', [ 512, 64, 64, 8 ] );
				connectA1111Nodes( graph, samplerNode, 0, decodeTiledNode, 0 );
				connectA1111Nodes( graph, ckptNode, 2, decodeTiledNode, 1 );

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
				connectA1111Nodes( graph, ckptNode, 2, encodeTiledNode, 1 );

				latentSourceNode = encodeTiledNode;
				latentSourceSlot = 0;
			}

			hrSamplerNode = addA1111Node( graph, 'KSampler', [ 0, 'fixed', 20, 7, 'euler', 'normal', 1 ] );
			connectA1111Nodes( graph, ckptNode, 0, hrSamplerNode, 0 );
			connectA1111Nodes( graph, positiveNode, 0, hrSamplerNode, 1 );
			connectA1111Nodes( graph, negativeNode, 0, hrSamplerNode, 2 );
			connectA1111Nodes( graph, latentSourceNode, latentSourceSlot, hrSamplerNode, 3 );

			const oldVaeSampleInput = vaeNode.inputs?.[0];
			if( oldVaeSampleInput?.link != null ) {
				const oldLinkId = oldVaeSampleInput.link;
				graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( oldLinkId ) );
				samplerNode.outputs[0].links = Array.isArray( samplerNode.outputs[0].links )
					? samplerNode.outputs[0].links.filter( linkId => Number( linkId ) !== Number( oldLinkId ) )
					: null;
				oldVaeSampleInput.link = null;
			}

			connectA1111Nodes( graph, hrSamplerNode, 0, vaeNode, 0 );
		}
	}

	const stepsValue = popA1111Option( opts, 'steps' );
	if( stepsValue !== undefined ) {
		samplerNode.widgets_values[2] = parseIntegerFromText( stepsValue, 20 );
	}

	const seedValue = popA1111Option( opts, 'seed' );
	if( seedValue !== undefined ) {
		samplerNode.widgets_values[0] = parseIntegerFromText( seedValue, 0 );
	}

	if( hrSamplerNode ) {
		hrSamplerNode.widgets_values[2] = hrSteps
			? parseIntegerFromText( hrSteps, parseIntegerFromText( samplerNode.widgets_values[2], 20 ) )
			: parseIntegerFromText( samplerNode.widgets_values[2], 20 );
		hrSamplerNode.widgets_values[3] = parseFloatFromText( samplerNode.widgets_values[3], 7 );
		hrSamplerNode.widgets_values[4] = samplerNode.widgets_values[4];
		hrSamplerNode.widgets_values[5] = samplerNode.widgets_values[5];
		hrSamplerNode.widgets_values[6] = parseFloatFromText( popA1111Option( opts, 'denoising strength' ) || '1', 1 );
	}

	const positiveLoraParse = extractLoraEntries( positivePrompt );
	positivePrompt = positiveLoraParse.cleanedText;
	let modelChain = { modelNode: ckptNode, modelSlot: 0, clipNode: clipSkipNode, clipSlot: 0 };
	if( positiveLoraParse.loras.length > 0 ) {
		modelChain = createLoraNodeChain( graph, positiveLoraParse.loras, modelChain.modelNode, modelChain.modelSlot, modelChain.clipNode, modelChain.clipSlot );
		if( positiveNode.inputs[0]?.link != null ) {
			graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( positiveNode.inputs[0].link ) );
			positiveNode.inputs[0].link = null;
		}
		if( samplerNode.inputs[0]?.link != null ) {
			graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( samplerNode.inputs[0].link ) );
			samplerNode.inputs[0].link = null;
		}
		if( hrSamplerNode && hrSamplerNode.inputs[0]?.link != null ) {
			graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( hrSamplerNode.inputs[0].link ) );
			hrSamplerNode.inputs[0].link = null;
		}
		connectA1111Nodes( graph, modelChain.clipNode, modelChain.clipSlot, positiveNode, 0 );
		connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, samplerNode, 0 );
		if( hrSamplerNode ) {
			connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, hrSamplerNode, 0 );
		}
	}

	const negativeLoraParse = extractLoraEntries( negativePrompt );
	negativePrompt = negativeLoraParse.cleanedText;
	if( negativeLoraParse.loras.length > 0 ) {
		modelChain = createLoraNodeChain( graph, negativeLoraParse.loras, modelChain.modelNode, modelChain.modelSlot, modelChain.clipNode, modelChain.clipSlot );
		if( negativeNode.inputs[0]?.link != null ) {
			graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( negativeNode.inputs[0].link ) );
			negativeNode.inputs[0].link = null;
		}
		if( samplerNode.inputs[0]?.link != null ) {
			graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( samplerNode.inputs[0].link ) );
			samplerNode.inputs[0].link = null;
		}
		if( hrSamplerNode && hrSamplerNode.inputs[0]?.link != null ) {
			graph.links = graph.links.filter( link => Number( link?.[0] ) !== Number( hrSamplerNode.inputs[0].link ) );
			hrSamplerNode.inputs[0].link = null;
		}
		connectA1111Nodes( graph, modelChain.clipNode, modelChain.clipSlot, negativeNode, 0 );
		connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, samplerNode, 0 );
		if( hrSamplerNode ) {
			connectA1111Nodes( graph, modelChain.modelNode, modelChain.modelSlot, hrSamplerNode, 0 );
		}
	}

	positiveNode.widgets_values[0] = positivePrompt;
	negativeNode.widgets_values[0] = negativePrompt;

	const analysisData = buildWorkflowAnalysisData( graph );
	return {
		analysisData: {
			...analysisData,
			workflowId: 'Inferred from Parameters',
			workflowRevision: 'A1111 importA1111 parity'
		},
		nodePortDefinitions: getDefaultPortDefinitionsForParameterWorkflow(),
		workflowGraph: graph
	};
}

export function buildInferredWorkflowJsonText( inferredWorkflow ) {
	if( !inferredWorkflow || !inferredWorkflow.workflowGraph ) {
		return '';
	}

	return JSON.stringify( inferredWorkflow.workflowGraph, null, 2 );
}