<?php

/**
 * Centralized project preferences.
 *
 * Update values here to change filesystem paths used by API endpoints.
 */
function web_get_prefs(): array {
	return [
		'modelsRootPath'  => 'D:/AI/models',
		'modelSubdirs'    => [
			'lora'        => 'loras',
			'checkpoint'  => 'checkpoints',
			'unet'        => 'unet'
		]
	];
}

/** Get normalized models root path from prefs. */
function web_models_root_path(): string {
	$prefs = web_get_prefs();
	$root = isset( $prefs['modelsRootPath'] ) && is_string( $prefs['modelsRootPath'] ) && trim( $prefs['modelsRootPath'] ) !== ''
		? trim( $prefs['modelsRootPath'] )
		: 'D:/AI/models';

	return rtrim( $root, '/\\' );
}

/** Get configured subdirectory name for a model type key. */
function web_model_subdir( string $key ): string {
	$prefs = web_get_prefs();
	$subdirs = isset( $prefs['modelSubdirs'] ) && is_array( $prefs['modelSubdirs'] )
		? $prefs['modelSubdirs']
		: [];

	$defaults = [
		'lora' => 'loras',
		'checkpoint' => 'checkpoints',
		'unet' => 'unet'
	];

	if( isset( $subdirs[$key] ) && is_string( $subdirs[$key] ) && trim( $subdirs[$key] ) !== '' ) {
		return trim( $subdirs[$key] );
	}

	return $defaults[$key] ?? $key;
}

/** Build full models path for a configured model type key. */
function web_model_path( string $key ): string {
	return web_models_root_path() . '/' . web_model_subdir( $key );
}
