// Default template for nodes with no specific template defined
const DEFAULT_PARAMETER_WORKFLOW_NODE_TEMPLATE = { 
	pos:			[ 100, 100 ],
	size:			[ 270, 58 ],
	inputs:		[],
	outputs:	[]
};

// Predefined templates for specific node types
const PARAMETER_WORKFLOW_NODE_TEMPLATES = {
	CheckpointLoaderSimple: {
		pos:	[ 100, 130 ],
		size:	[ 270, 98 ],
		inputs: [
			{ name: 'ckpt_name', type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'MODEL',	type: 'MODEL' },
			{ name: 'CLIP',		type: 'CLIP' },
			{ name: 'VAE',		type: 'VAE' }
		]
	},
	UnetLoaderGGUF: {
		pos:	[ 100, 130 ],
		size:	[ 270, 58 ],
		inputs: [
			{ name: 'unet_name', type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'MODEL', type: 'MODEL' }
		]
	},
	VAELoader: {
		pos:	[ 100, 318 ],
		size:	[ 270, 58 ],
		inputs: [
			{ name: 'vae_name', type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'VAE', type: 'VAE' }
		]
	},
	DualCLIPLoader: {
		pos:	[ 100, 506 ],
		size:	[ 270, 130 ],
		inputs: [
			{ name: 'clip_name1',	type: 'COMBO', widget: true },
			{ name: 'clip_name2',	type: 'COMBO', widget: true },
			{ name: 'type',				type: 'COMBO', widget: true },
			{ name: 'device',			type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'CLIP', type: 'CLIP' }
		]
	},
	CLIPSetLastLayer: {
		pos:	[ 470, 130 ],
		size:	[ 270, 58 ],
		inputs: [
			{ name: 'clip',								type: 'CLIP' },
			{ name: 'stop_at_clip_layer', type: 'INT', widget: true }
		],
		outputs: [
			{ name: 'CLIP', type: 'CLIP' }
		]
	},
	CLIPTextEncode: {
		pos: [ 840, 130 ],
		size: [ 400, 200 ],
		inputs: [
			{ name: 'clip', type: 'CLIP' },
			{ name: 'text', type: 'STRING', widget: true }
		],
		outputs: [
			{ name: 'CONDITIONING', type: 'CONDITIONING' }
		]
	},
	EmptySD3LatentImage: {
		pos: [ 100, 766 ],
		size: [ 270, 106 ],
		inputs: [
			{ name: 'width',			type: 'INT', widget: true },
			{ name: 'height',			type: 'INT', widget: true },
			{ name: 'batch_size',	type: 'INT', widget: true }
		],
		outputs: [
			{ name: 'LATENT', type: 'LATENT' }
		]
	},
	KSamplerSelect: {
		pos: [ 100, 1002 ],
		size: [ 270, 58 ],
		inputs: [
			{ name: 'sampler_name', type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'SAMPLER', type: 'SAMPLER' }
		]
	},
	BasicScheduler: {
		pos: [ 860.4380859375, 130 ],
		size: [ 270, 106 ],
		inputs: [
			{ name: 'model',			type: 'MODEL' },
			{ name: 'scheduler',	type: 'COMBO', widget: true },
			{ name: 'steps',			type: 'INT', widget: true },
			{ name: 'denoise',		type: 'FLOAT', widget: true }
		],
		outputs: [
			{ name: 'SIGMAS', type: 'SIGMAS' }
		]
	},
	RandomNoise: {
		pos: [ 100, 1190 ],
		size: [ 270, 82 ],
		inputs: [
			{ name: 'noise_seed',							type: 'INT', widget: true },
			{ name: 'control_after_generate',	type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'NOISE', type: 'NOISE' }
		]
	},
	FluxGuidance: {
		pos: [ 1360.4380859375, 130 ],
		size: [ 270, 58 ],
		inputs: [
			{ name: 'conditioning',	type: 'CONDITIONING' },
			{ name: 'guidance',			type: 'FLOAT', widget: true }
		],
		outputs: [
			{ name: 'CONDITIONING', type: 'CONDITIONING' }
		]
	},
	BasicGuider: {
		pos: [ 1730.4380859375, 130 ],
		size: [ 160, 46 ],
		inputs: [
			{ name: 'model',				type: 'MODEL' },
			{ name: 'conditioning',	type: 'CONDITIONING' }
		],
		outputs: [
			{ name: 'GUIDER', type: 'GUIDER' }
		]
	},
	SamplerCustomAdvanced: {
		pos: [ 1990.0064453125, 130 ],
		size: [ 212.3638671875, 106 ],
		inputs: [
			{ name: 'noise',				type: 'NOISE' },
			{ name: 'guider',				type: 'GUIDER' },
			{ name: 'sampler',			type: 'SAMPLER' },
			{ name: 'sigmas',				type: 'SIGMAS' },
			{ name: 'latent_image',	type: 'LATENT' }
		],
		outputs: [
			{ name: 'output',						type: 'LATENT' },
			{ name: 'denoised_output',	type: 'LATENT' }
		]
	},
	PreviewImage: {
		pos: [ 2542.3703125, 130 ],
		size: [ 140, 26 ],
		inputs: [
			{ name: 'images', type: 'IMAGE' }
		],
		outputs: []
	},
	KSampler: {
		pos: [ 1340, 130 ],
		size: [ 270, 262 ],
		inputs: [
			{ name: 'model',									type: 'MODEL' },
			{ name: 'positive',								type: 'CONDITIONING' },
			{ name: 'negative',								type: 'CONDITIONING' },
			{ name: 'latent_image',						type: 'LATENT' },
			{ name: 'seed',										type: 'INT',		widget: true },
			{ name: 'control_after_generate',	type: 'COMBO',	widget: true },
			{ name: 'steps',									type: 'INT',		widget: true },
			{ name: 'cfg',										type: 'FLOAT',	widget: true },
			{ name: 'sampler_name',						type: 'COMBO',	widget: true },
			{ name: 'scheduler',							type: 'COMBO',	widget: true },
			{ name: 'denoise',								type: 'FLOAT',	widget: true }
		],
		outputs: [ { name: 'LATENT', type: 'LATENT' } ]
	},
	EmptyLatentImage: {
		pos: [ 100, 358 ],
		size: [ 270, 106 ],
		inputs: [
			{ name: 'width',			type: 'INT', widget: true },
			{ name: 'height',			type: 'INT', widget: true },
			{ name: 'batch_size',	type: 'INT', widget: true }
		],
		outputs: [
			{ name: 'LATENT', type: 'LATENT' }
		]
	},
	VAEDecode: {
		pos: [ 3523.5689453125, 130 ],
		size: [ 140, 46 ],
		inputs: [
			{ name: 'samples',	type: 'LATENT' },
			{ name: 'vae',			type: 'VAE' }
		],
		outputs: [
			{ name: 'IMAGE', type: 'IMAGE' }
		]
	},
	SaveImage: {
		pos: [ 3763.5689453125, 130 ],
		size: [ 270, 58 ],
		inputs: [
			{ name: 'images',						type: 'IMAGE' },
			{ name: 'filename_prefix',	type: 'STRING', widget: true }
		],
		outputs: []
	},
	VAEDecodeTiled: {
		pos: [ 1710, 130 ],
		size: [ 270, 150 ],
		inputs: [
			{ name: 'samples',					type: 'LATENT' },
			{ name: 'vae',							type: 'VAE' },
			{ name: 'tile_size',				type: 'INT', widget: true },
			{ name: 'overlap',					type: 'INT', widget: true },
			{ name: 'temporal_size',		type: 'INT', widget: true },
			{ name: 'temporal_overlap',	type: 'INT', widget: true }
		],
		outputs: [
			{ name: 'IMAGE', type: 'IMAGE' }
		]
	},
	UpscaleModelLoader: {
		pos: [ 100, 594 ],
		size: [ 270, 58 ],
		inputs: [
			{ name: 'model_name', type: 'COMBO', widget: true }
		],
		outputs: [
			{ name: 'UPSCALE_MODEL', type: 'UPSCALE_MODEL' }
		]
	},
	ImageUpscaleWithModel: {
		pos: [ 2080, 130 ],
		size: [ 233.5689453125, 46 ],
		inputs: [
			{ name: 'upscale_model',	type: 'UPSCALE_MODEL' },
			{ name: 'image',					type: 'IMAGE' }
		],
		outputs: [
			{ name: 'IMAGE', type: 'IMAGE' }
		]
	},
	ImageScale: {
		pos: [ 2413.5689453125, 130 ],
		size: [ 270, 130 ],
		inputs: [
			{ name: 'image',					type: 'IMAGE' },
			{ name: 'upscale_method',	type: 'COMBO',	widget: true },
			{ name: 'width',					type: 'INT',		widget: true },
			{ name: 'height',					type: 'INT',		widget: true },
			{ name: 'crop',						type: 'COMBO',	widget: true }
		],
		outputs: [
			{ name: 'IMAGE', type: 'IMAGE' }
		]
	},
	VAEEncodeTiled: {
		pos: [ 2783.5689453125, 130 ],
		size: [ 270, 150 ],
		inputs: [
			{ name: 'pixels',						type: 'IMAGE' },
			{ name: 'vae',							type: 'VAE' },
			{ name: 'tile_size',				type: 'INT', widget: true },
			{ name: 'overlap',					type: 'INT', widget: true },
			{ name: 'temporal_size',		type: 'INT', widget: true },
			{ name: 'temporal_overlap',	type: 'INT', widget: true }
		],
		outputs: [
			{ name: 'LATENT', type: 'LATENT' }
		]
	},
	LatentUpscale: {
		pos: [ 2413.5689453125, 130 ],
		size: [ 270, 130 ],
		inputs: [
			{ name: 'samples',				type: 'LATENT' },
			{ name: 'upscale_method',	type: 'COMBO',	widget: true },
			{ name: 'width',					type: 'INT',		widget: true },
			{ name: 'height',					type: 'INT',		widget: true },
			{ name: 'crop',						type: 'COMBO',	widget: true }
		],
		outputs: [
			{ name: 'LATENT', type: 'LATENT' }
		]
	},
	LoraLoader: {
		pos: [ 580, 300 ],
		size: [ 270, 130 ],
		inputs: [
			{ name: 'model',					type: 'MODEL' },
			{ name: 'clip',						type: 'CLIP' },
			{ name: 'lora_name',			type: 'COMBO', widget: true },
			{ name: 'strength_model',	type: 'FLOAT', widget: true },
			{ name: 'strength_clip',	type: 'FLOAT', widget: true }
		],
		outputs: [
			{ name: 'MODEL',	type: 'MODEL' },
			{ name: 'CLIP',		type: 'CLIP' }
		]
	}
};

/** Fetch available node types from server
 * @param {string} type						node type to get template for
 * @param {number} instanceIndex	instance index to determine position
 * @returns {object} node template object
 */
export function getGraphNodeTemplate( type, instanceIndex = 1 ) {
	if( type === 'CLIPTextEncode' ) {
		return {
			...PARAMETER_WORKFLOW_NODE_TEMPLATES.CLIPTextEncode,
			pos: instanceIndex === 2 ? [ 840, 460 ] : [ 840, 130 ]
		};
	}

	if( type === 'KSampler' ) {
		return {
			...PARAMETER_WORKFLOW_NODE_TEMPLATES.KSampler,
			pos: instanceIndex === 2 ? [ 3153.5689453125, 130 ] : [ 1340, 130 ]
		};
	}

	return PARAMETER_WORKFLOW_NODE_TEMPLATES[ type ] || DEFAULT_PARAMETER_WORKFLOW_NODE_TEMPLATE;
}