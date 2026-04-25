<?php

/** Centralized project preferences.
 *
 * Edit the values in the two sections below to adapt the scraper to a
 * different site or a different local storage layout.  No other file
 * should contain a domain name, API path, or local filesystem root.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SECTION 1 — Local filesystem paths
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Build full models path for a configured model type key
 * @param string $key Model type key, e.g. 'lora', 'checkpoint', 'unet'
 * @return string Full path to the model type directory
 */
function web_model_path( string $key ): string {
	return web_models_root_path() . '/' . web_model_subdir( $key );
}

/** Get normalized models root path from prefs. */
function web_models_root_path(): string {
	$prefs	= web_get_prefs();
	$root		= isset( $prefs['modelsRootPath'] ) && is_string( $prefs['modelsRootPath'] ) && trim( $prefs['modelsRootPath'] ) !== ''
		? trim( $prefs['modelsRootPath'] )
		: 'D:/AI/models';

	return rtrim( $root, '/\\' );
}

/** Get configured subdirectory name for a model type key
 * @param string $key Model type key, e.g. 'lora', 'checkpoint', 'unet'
 * @return string Subdirectory name for the model type
*/
function web_model_subdir( string $key ): string {
	$prefs		= web_get_prefs();
	$subdirs	= isset( $prefs['modelSubdirs'] ) && is_array( $prefs['modelSubdirs'] )
		? $prefs['modelSubdirs']
		: [];

	$defaults = [
		'lora'				=> 'loras',
		'checkpoint'	=> 'checkpoints',
		'unet'				=> 'unet'
	];

	if( isset( $subdirs[$key] ) && is_string( $subdirs[$key] ) && trim( $subdirs[$key] ) !== '' ) {
		return trim( $subdirs[$key] );
	}

	return $defaults[$key] ?? $key;
}

/** Get all preferences as an associative array. */
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


/**
 * ────────────────────────────────────────────────────────────────────────────
 * SECTION 2 — Target site configuration
 *
 * Update these constants when the site moves to a new domain, renames its
 * API paths, or changes its image CDN layout.  To reuse this scraper for a
 * completely different site, replace all values below and nothing else.
 * ────────────────────────────────────────────────────────────────────────────
 */

// Primary site domain (no trailing slash)
define( 'SITE_BASE_URL', 'https://civitai.red' );

// Page path segments (leading slash, no trailing slash)
define( 'SITE_PATH_MODELS', '/models' );   // e.g. /models/12345
define( 'SITE_PATH_IMAGES', '/images' );   // e.g. /images/67890

// API base paths (leading slash, no trailing slash)
define( 'SITE_API_REST',  '/api/v1' );     // REST API, e.g. /api/v1/models/12345
define( 'SITE_API_TRPC',  '/api/trpc' );   // tRPC API, e.g. /api/trpc/image.get

// tRPC endpoint names
define( 'SITE_TRPC_IMAGE_GET',  'image.get' );
define( 'SITE_TRPC_IMAGE_GEN',  'image.getGenerationData' );
define( 'SITE_TRPC_GALLERY',    'image.getImagesAsPostsInfinite' );

// Image CDN — primary (used for thumbnails and display images)
// SITE_CDN_HASH is the account/organisation hash embedded in every image URL.
define( 'SITE_CDN_BASE',   'https://image.civitai.red' );
define( 'SITE_CDN_HASH',   'xG1nkqKTMzGDvpLrqFT7WA' );

// Image CDN — legacy domain still used for some images; kept for URL detection
define( 'SITE_CDN_LEGACY', 'https://image.civitai.com' );

// Image object storage — serves the original PNG files with embedded metadata
define( 'SITE_STORAGE_BASE', 'https://image-b2.civitai.com/file/civitai-media-cache' );

// ── Derived URL helpers ──────────────────────────────────────────────────────
// Computed from the values above; do not edit these lines.
define( 'SITE_URL_MODELS',   SITE_BASE_URL . SITE_PATH_MODELS );
define( 'SITE_URL_IMAGES',   SITE_BASE_URL . SITE_PATH_IMAGES );
define( 'SITE_URL_API_REST', SITE_BASE_URL . SITE_API_REST );
define( 'SITE_URL_API_TRPC', SITE_BASE_URL . SITE_API_TRPC );

// ── UI strings ───────────────────────────────────────────────────────────────
define( 'SITE_UI_MODEL_URL_PREFIX',  SITE_URL_MODELS . '/' );
define( 'SITE_UI_INPUT_PLACEHOLDER', 'Enter model ID (e.g., 43331)' );
