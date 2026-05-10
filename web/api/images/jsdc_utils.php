<?php
/** JSDC compression utilities — PHP port of compress.py steps 2–4.
 *
 * Stores workflow files as compressed JSDC artifacts under cache/workflows/:
 *   <hash>.dict   — key abbreviation map (JSON object)
 *   <hash>.json   — group template (abbreviated keys, shared values or "?")
 *   <image_id>.jsdc — per-file delta (abbreviated keys, variable values only)
 *   index.txt     — tab-separated <image_id>.json → <hash> entries
 *
 * When a group template already exists for a given hash, the new file is
 * merged into it so the template reflects all known values across the group.
 */

const JSDC_PLACEHOLDER = '?';

// ---------------------------------------------------------------------------
// Abbreviation codec
// ---------------------------------------------------------------------------

/** Generate the next abbreviation in the sequence a, b, …, z, aa, ab, … */
function jsdc_abbreviation_sequence(): Generator {
	$chars = range( 'a', 'z' );
	for( $length = 1; ; $length++ ) {
		yield from _jsdc_product( $chars, $length );
	}
}

function _jsdc_product( array $chars, int $length ): Generator {
	if( $length === 1 ) {
		foreach( $chars as $c ) {
			yield $c;
		}
		return;
	}
	foreach( $chars as $c ) {
		foreach( _jsdc_product( $chars, $length - 1 ) as $suffix ) {
			yield $c . $suffix;
		}
	}
}

/** Build a map of original key → abbreviation, preserving supplied order. */
function jsdc_build_abbreviation_map( array $keysByFrequency ): array {
	$gen    = jsdc_abbreviation_sequence();
	$map    = [];
	foreach( $keysByFrequency as $key ) {
		$map[ $key ] = $gen->current();
		$gen->next();
	}
	return $map;
}

// ---------------------------------------------------------------------------
// Key counting
// ---------------------------------------------------------------------------

/** Recursively count every key occurrence in a decoded JSON structure. */
function jsdc_count_keys( mixed $data, array &$counter ): void {
	if( is_array( $data ) ) {
		foreach( $data as $k => $v ) {
			if( is_string( $k ) ) {
				$counter[ $k ] = ( $counter[ $k ] ?? 0 ) + 1;
				jsdc_count_keys( $v, $counter );
			} else {
				jsdc_count_keys( $v, $counter );
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Key abbreviation application
// ---------------------------------------------------------------------------

function jsdc_abbreviate_keys( mixed $data, array $abbrev ): mixed {
	if( is_array( $data ) && array_is_list( $data ) ) {
		return array_map( static fn( $item ) => jsdc_abbreviate_keys( $item, $abbrev ), $data );
	}
	if( is_array( $data ) ) {
		$result = [];
		foreach( $data as $k => $v ) {
			$result[ $abbrev[ $k ] ?? $k ] = jsdc_abbreviate_keys( $v, $abbrev );
		}
		return $result;
	}
	return $data;
}

// ---------------------------------------------------------------------------
// Step 2 — Build / update per-group key dictionary
// ---------------------------------------------------------------------------

/** Build or update the .dict file for a group.
 *
 * If a .dict already exists, the new workflow's keys are merged in: any keys
 * not yet in the map receive new abbreviations appended after existing ones.
 *
 * @param string $cacheDir   Absolute path to cache/workflows/
 * @param string $groupHash  Shape hash for this group
 * @param array  $workflow   Decoded workflow array (original keys)
 * @return array Original-key → abbreviation map
 */
function jsdc_build_or_update_dict( string $cacheDir, string $groupHash, array $workflow ): array {
	$dictPath = $cacheDir . '/' . $groupHash . '.dict';
	$abbrev   = [];

	if( is_file( $dictPath ) ) {
		$abbrev = json_decode( file_get_contents( $dictPath ), true ) ?: [];
	}

	// Count keys in this new workflow and add any that are missing from the map
	$counter = [];
	jsdc_count_keys( $workflow, $counter );

	$newKeys = array_diff_key( $counter, $abbrev );
	if( !empty( $newKeys ) ) {
		// Determine how many abbreviations have already been used
		$existingCount  = count( $abbrev );
		$gen            = jsdc_abbreviation_sequence();
		for( $i = 0; $i < $existingCount; $i++ ) {
			$gen->next();
		}
		foreach( array_keys( $newKeys ) as $key ) {
			$abbrev[ $key ] = $gen->current();
			$gen->next();
		}
		file_put_contents( $dictPath, json_encode( $abbrev, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
	}

	return $abbrev;
}

// ---------------------------------------------------------------------------
// Step 3 — Build / update per-group template
// ---------------------------------------------------------------------------

/** Merge two values according to JSDC template rules. */
function jsdc_merge_values( mixed $existing, mixed $incoming ): mixed {
	// Already a placeholder — stays placeholder
	if( $existing === JSDC_PLACEHOLDER ) {
		return JSDC_PLACEHOLDER;
	}

	// Identical — keep as-is
	if( $existing === $incoming ) {
		return $existing;
	}

	// Both associative arrays — recurse
	if( is_array( $existing ) && !array_is_list( $existing ) &&
	    is_array( $incoming ) && !array_is_list( $incoming ) ) {
		$allKeys = array_unique( array_merge( array_keys( $existing ), array_keys( $incoming ) ) );
		$result  = [];
		foreach( $allKeys as $k ) {
			$eVal = $existing[ $k ] ?? JSDC_PLACEHOLDER;
			$iVal = $incoming[ $k ] ?? JSDC_PLACEHOLDER;
			$result[ $k ] = jsdc_merge_values( $eVal, $iVal );
		}
		return $result;
	}

	// Both lists of the same length — element-level merge
	if( is_array( $existing ) && array_is_list( $existing ) &&
	    is_array( $incoming ) && array_is_list( $incoming ) &&
	    count( $existing ) === count( $incoming ) ) {
		$result = [];
		foreach( $existing as $i => $eVal ) {
			$result[] = jsdc_merge_values( $eVal, $incoming[ $i ] );
		}
		return $result;
	}

	// Anything else — values differ
	return JSDC_PLACEHOLDER;
}

/** Build or update the <hash>.json template file for a group.
 *
 * Merges the incoming (abbreviated) workflow into the existing template,
 * replacing positions that now differ with "?".
 *
 * @param string $cacheDir       Absolute path to cache/workflows/
 * @param string $groupHash      Shape hash for this group
 * @param array  $abbrevWorkflow Workflow decoded and key-abbreviated
 * @return array The updated abbreviated template
 */
function jsdc_build_or_update_template( string $cacheDir, string $groupHash, array $abbrevWorkflow ): array {
	$templatePath = $cacheDir . '/' . $groupHash . '.json';

	if( !is_file( $templatePath ) ) {
		// First file in this group — the workflow IS the template
		file_put_contents( $templatePath, json_encode( $abbrevWorkflow, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
		return $abbrevWorkflow;
	}

	$existing = json_decode( file_get_contents( $templatePath ), true ) ?: [];
	$merged   = jsdc_merge_values( $existing, $abbrevWorkflow );

	file_put_contents( $templatePath, json_encode( $merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
	return $merged;
}

// ---------------------------------------------------------------------------
// Step 4 — Generate per-file delta (.jsdc)
// ---------------------------------------------------------------------------

function _jsdc_extract_delta( mixed $templateNode, mixed $actualNode ): mixed {
	if( $templateNode === JSDC_PLACEHOLDER ) {
		return $actualNode;
	}

	if( is_array( $templateNode ) && !array_is_list( $templateNode ) &&
	    is_array( $actualNode )   && !array_is_list( $actualNode ) ) {
		$delta = [];
		foreach( $templateNode as $k => $tVal ) {
			$aVal = $actualNode[ $k ] ?? JSDC_PLACEHOLDER;
			$sub  = _jsdc_extract_delta( $tVal, $aVal );
			if( $sub !== null ) {
				$delta[ $k ] = $sub;
			}
		}
		return $delta !== [] ? $delta : null;
	}

	if( is_array( $templateNode ) && array_is_list( $templateNode ) &&
	    is_array( $actualNode )   && array_is_list( $actualNode ) ) {
		$sparse = [];
		foreach( $templateNode as $i => $tElem ) {
			if( $tElem === JSDC_PLACEHOLDER ) {
				$sparse[] = [ $i, $actualNode[ $i ] ?? JSDC_PLACEHOLDER ];
			} else {
				$sub = _jsdc_extract_delta( $tElem, $actualNode[ $i ] ?? JSDC_PLACEHOLDER );
				if( $sub !== null ) {
					$sparse[] = [ $i, $sub ];
				}
			}
		}
		return $sparse !== [] ? $sparse : null;
	}

	return null;
}

/** Compute the delta between an abbreviated template and an abbreviated workflow. */
function jsdc_build_delta( array $template, array $abbrevWorkflow ): array {
	$delta = [];
	foreach( $template as $k => $tVal ) {
		$aVal = $abbrevWorkflow[ $k ] ?? JSDC_PLACEHOLDER;
		$sub  = _jsdc_extract_delta( $tVal, $aVal );
		if( $sub !== null ) {
			$delta[ $k ] = $sub;
		}
	}
	return $delta;
}

// ---------------------------------------------------------------------------
// Index management
// ---------------------------------------------------------------------------

/** Append a line to index.txt.  Does not check for duplicates — call only once per image. */
function jsdc_append_index( string $cacheDir, int $imageId, string $groupHash ): void {
	$indexPath = $cacheDir . '/index.txt';
	$line      = $imageId . '.json' . "\t" . $groupHash . "\n";
	file_put_contents( $indexPath, $line, FILE_APPEND | LOCK_EX );
}

/** Return true if index.txt already has an entry for this image ID. */
function jsdc_index_has_entry( string $cacheDir, int $imageId ): bool {
	$indexPath = $cacheDir . '/index.txt';
	if( !is_file( $indexPath ) ) {
		return false;
	}
	$needle = $imageId . '.json' . "\t";
	foreach( file( $indexPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES ) as $line ) {
		if( str_starts_with( $line, $needle ) ) {
			return true;
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Compress and store one workflow file into the JSDC cache.
 *
 * @param string $cacheDir   Absolute path to cache/workflows/
 * @param string $groupHash  Shape hash (the workflow_hash already stored in the DB)
 * @param int    $imageId    Civitai image ID (used as the .jsdc filename stem)
 * @param array  $workflow   Decoded workflow array (original keys, already rounded)
 */
function jsdc_store_workflow( string $cacheDir, string $groupHash, int $imageId, array $workflow ): void {
	if( !is_dir( $cacheDir ) ) {
		mkdir( $cacheDir, 0755, true );
	}

	// Detect whether this is the first image in the group (before building the template)
	$isFirstInGroup = !is_file( $cacheDir . '/' . $groupHash . '.json' );

	// Steps 2 & 3: build/update dict and template, get abbreviated workflow
	$abbrevMap      = jsdc_build_or_update_dict( $cacheDir, $groupHash, $workflow );
	$abbrevWorkflow = jsdc_abbreviate_keys( $workflow, $abbrevMap );
	$template       = jsdc_build_or_update_template( $cacheDir, $groupHash, $abbrevWorkflow );

	// Step 4: write delta
	$delta    = jsdc_build_delta( $template, $abbrevWorkflow );
	$jsdcPath = $cacheDir . '/' . $imageId . '.jsdc';
	file_put_contents( $jsdcPath, json_encode( $delta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );

	// The first image in a group initialises the template with its own values, so its
	// delta is always empty. If later images cause ? placeholders to appear in the template,
	// the seed's delta can no longer fill them. Save the original so restoration always works.
	if( $isFirstInGroup ) {
		$originalsDir = $cacheDir . '/originals';
		if( !is_dir( $originalsDir ) ) {
			mkdir( $originalsDir, 0755, true );
		}
		file_put_contents(
			$originalsDir . '/' . $imageId . '.json',
			json_encode( $workflow, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE )
		);
	}

	// Index entry (skip if already present, e.g. on re-scan)
	if( !jsdc_index_has_entry( $cacheDir, $imageId ) ) {
		jsdc_append_index( $cacheDir, $imageId, $groupHash );
	}
}

// ---------------------------------------------------------------------------
// Restore: apply delta + expand keys (port of restore.py)
// ---------------------------------------------------------------------------

/** Look up which group hash an image belongs to via index.txt.
 *
 * @param string $cacheDir Absolute path to cache/workflows/
 * @param int    $imageId  Civitai image ID
 * @return string|null Group hash, or null if not found
 */
function jsdc_lookup_index( string $cacheDir, int $imageId ): ?string {
	$indexPath = $cacheDir . '/index.txt';
	if( !is_file( $indexPath ) ) {
		return null;
	}
	$needle = $imageId . '.json' . "\t";
	foreach( file( $indexPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES ) as $line ) {
		if( str_starts_with( $line, $needle ) ) {
			$parts = explode( "\t", $line, 2 );
			return isset( $parts[1] ) ? trim( $parts[1] ) : null;
		}
	}
	return null;
}

/** Recursively fill template JSDC_PLACEHOLDER values using a delta.
 *
 * - Scalars: if template === '?' return delta value, otherwise keep template value.
 * - Dicts: recurse per key; delta supplies overrides for '?' leaf positions.
 * - Lists: delta is a sparse array of [index, value] pairs covering only '?' positions.
 *
 * @param mixed $templateNode Node from the group template
 * @param mixed $deltaNode    Corresponding node from the per-file delta (may be null)
 * @return mixed Filled node
 */
function _jsdc_apply_delta( mixed $templateNode, mixed $deltaNode ): mixed {
	if( $templateNode === JSDC_PLACEHOLDER ) {
		return $deltaNode;
	}

	if( is_array( $templateNode ) && !array_is_list( $templateNode ) ) {
		$result = [];
		foreach( $templateNode as $k => $tVal ) {
			$dVal     = is_array( $deltaNode ) ? ( $deltaNode[ $k ] ?? null ) : null;
			$result[ $k ] = _jsdc_apply_delta( $tVal, $dVal );
		}
		return $result;
	}

	if( is_array( $templateNode ) && array_is_list( $templateNode ) ) {
		// Delta is sparse: [[index, value], ...]
		$overrides = [];
		if( is_array( $deltaNode ) ) {
			foreach( $deltaNode as $entry ) {
				if( is_array( $entry ) && count( $entry ) === 2 ) {
					$overrides[ (int)$entry[0] ] = $entry[1];
				}
			}
		}
		$result = [];
		foreach( $templateNode as $i => $tElem ) {
			if( $tElem === JSDC_PLACEHOLDER ) {
				$result[] = $overrides[ $i ] ?? JSDC_PLACEHOLDER;
			} else {
				$result[] = _jsdc_apply_delta( $tElem, $overrides[ $i ] ?? null );
			}
		}
		return $result;
	}

	return $templateNode;
}

/** Recursively expand abbreviated dict keys back to their original names.
 *
 * @param mixed $data      Data with abbreviated keys
 * @param array $invAbbrev Inverted abbreviation map: abbrev → original key
 * @return mixed Data with original keys restored
 */
function _jsdc_expand_keys( mixed $data, array $invAbbrev ): mixed {
	if( is_array( $data ) && !array_is_list( $data ) ) {
		$result = [];
		foreach( $data as $k => $v ) {
			$origKey          = $invAbbrev[ $k ] ?? $k;
			$result[ $origKey ] = _jsdc_expand_keys( $v, $invAbbrev );
		}
		return $result;
	}
	if( is_array( $data ) ) {
		return array_map( static fn( $item ) => _jsdc_expand_keys( $item, $invAbbrev ), $data );
	}
	return $data;
}

/** Return true if $data contains any '?' placeholder values anywhere in its structure. */
function _jsdc_has_placeholder( mixed $data ): bool {
	if( $data === JSDC_PLACEHOLDER ) {
		return true;
	}
	if( is_array( $data ) ) {
		foreach( $data as $v ) {
			if( _jsdc_has_placeholder( $v ) ) {
				return true;
			}
		}
	}
	return false;
}

/** Restore the original workflow array from JSDC cache files.
 *
 * Reads index.txt to find the group hash, then loads <hash>.dict,
 * <hash>.json, and <imageId>.jsdc to reconstruct the original workflow.
 *
 * Returns null if the image is not in the cache or if the stored delta
 * is incomplete (e.g. compressed before the list-recursion bug was fixed).
 *
 * @param string $cacheDir Absolute path to cache/workflows/
 * @param int    $imageId  Civitai image ID
 * @return array|null Restored workflow as a PHP array, or null if not cached
 */
function jsdc_restore_workflow( string $cacheDir, int $imageId ): ?array {
	// 1. Check for original file (written when keepOriginals was used)
	$originalPath = $cacheDir . '/originals/' . $imageId . '.json';
	if( is_file( $originalPath ) ) {
		$decoded = json_decode( file_get_contents( $originalPath ), true );
		if( is_array( $decoded ) ) {
			return $decoded;
		}
	}

	// 2. Look up group hash in index
	$groupHash = jsdc_lookup_index( $cacheDir, $imageId );
	if( $groupHash === null ) {
		return null;
	}

	$dictPath     = $cacheDir . '/' . $groupHash . '.dict';
	$templatePath = $cacheDir . '/' . $groupHash . '.json';
	$deltaPath    = $cacheDir . '/' . $imageId . '.jsdc';

	if( !is_file( $dictPath ) || !is_file( $templatePath ) || !is_file( $deltaPath ) ) {
		return null;
	}

	// 3. Load artifacts
	$abbrevMap = json_decode( file_get_contents( $dictPath ), true );
	$template  = json_decode( file_get_contents( $templatePath ), true );
	$delta     = json_decode( file_get_contents( $deltaPath ), true );

	if( !is_array( $abbrevMap ) || !is_array( $template ) || !is_array( $delta ) ) {
		return null;
	}

	// 4. Fill '?' placeholders from the delta
	$filled = _jsdc_apply_delta( $template, $delta );

	// 5. Expand abbreviated keys back to original names
	$invAbbrev = array_flip( $abbrevMap );
	$restored  = _jsdc_expand_keys( $filled, $invAbbrev );

	// 6. Validate: any remaining '?' means the delta was incomplete (compression bug
	//    present when the file was stored). Fall back to Civitai rather than return
	//    a broken workflow.
	if( _jsdc_has_placeholder( $restored ) ) {
		return null;
	}

	return $restored;
}
