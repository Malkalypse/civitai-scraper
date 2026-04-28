const PORT_DEFINITIONS = {
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

export function getPortDefinitions() {
	return PORT_DEFINITIONS;
}