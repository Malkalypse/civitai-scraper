<?php

/** Normalize filenames by removing any provided extension and resolving final extension
 * @param string      $oldFilename      Previous filename
 * @param string      $newFilename      New filename
 * @param string|null $originalFilename Source-of-origin filename (used to infer extension)
 * @return array Normalized base filenames and extension
 */
function normalizeFilenames( string $oldFilename, string $newFilename, ?string $originalFilename = null ) {
	$extension    = getExtension( $originalFilename ) ?? '.safetensors';
	$oldFilename  = stripExtension( $oldFilename );
	$newFilename  = stripExtension( $newFilename );

	return [
		'oldFilename' => $oldFilename,
		'newFilename' => $newFilename,
		'extension'   => $extension
	];
}

/** Detect file extension from last dot in filename
 * @param string $name Filename to analyze
 * @return string|null Detected extension with dot (or null)
 */
function getExtension( ?string $name ): ?string {

  // Validate input
	if( !is_string( $name ) || $name === '' ) {
		return null;
	}

	$lastDotPos = strrpos( $name, '.' );

	if( $lastDotPos === false || $lastDotPos === strlen( $name ) - 1 ) {
		return null;
	}

  // Return the extension in lowercase for consistency
	return strtolower( substr( $name, $lastDotPos ) );
}

/** Remove the detected extension from a filename, if present.
 * @param string $name Filename to process
 * @return string
 */
function stripExtension( string $name ): string {
	$extension = getExtension( $name );

	if( $extension === null ) {
		return $name;
	}

	return substr( $name, 0, -strlen( $extension ) );
}

/** Recursively search for a file by name under a directory
 * @param string $rootPath        Root directory of search
 * @param string $targetFilename  Filename to find
 * @return string|null Full path of the found file or null if not found
 */
function findFileRecursively( string $rootPath, string $targetFilename ): ?string {
	return findEntryRecursively( $rootPath, $targetFilename, false );
}

/** Recursively search for a directory by name under a directory tree
 * @param string $rootPath            Root directory of search
 * @param string $targetDirectoryName Directory name to find
 * @return string|null Full path of the found directory or null if not found
 */
function findDirectoryRecursively( string $rootPath, string $targetDirectoryName ): ?string {
	return findEntryRecursively( $rootPath, $targetDirectoryName, true );
}

/** Recursively search for a file-system entry by type and name under a directory tree
 * @param string  $rootPath       Root directory of search
 * @param string  $targetName     Name of file or directory to find
 * @param bool    $findDirectory  True to search for directories, false for files
 * @return string|null Full path of the found entry or null if not found
*/
function findEntryRecursively( string $rootPath, string $targetName, bool $findDirectory ): ?string {
	if( !is_dir( $rootPath ) ) {
		return null;
	}

	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $rootPath, RecursiveDirectoryIterator::SKIP_DOTS ),
		RecursiveIteratorIterator::SELF_FIRST
	);

	foreach( $iterator as $entry ) {
		$matchesType = $findDirectory ? $entry->isDir() : $entry->isFile();
		if( $matchesType && $entry->getFilename() === $targetName ) {
			return $entry->getPathname();
		}
	}

	return null;
}

/** Build a normalized rename-target result payload
 * @param string      $rootPath Root directory of search
 * @param string      $oldPath Full path of existing file/directory to rename
 * @param string      $newPath Full path of new file/directory name
 * @param string|null $relativeFolder Optional relative folder path for scoping
 * @return array Structured result with old/new paths and context
 */
function buildRenameTargetsResult(
	string  $rootPath,
	string  $oldPath,
	string  $newPath,
	?string $relativeFolder = null
): array {
  
  global $debug;
  $debug .= "\n  buildRenameTargetsResult()\n    oldPath=" . json_encode( $oldPath ) . "\n    newPath=" . json_encode( $newPath ) . "\n    relativeFolder=" . json_encode( $relativeFolder );

  if( $relativeFolder === null ) {
		$parentFolder   = dirname( $oldPath );
		$relativeFolder = str_replace( $rootPath . DIRECTORY_SEPARATOR, '', $parentFolder );
		$relativeFolder = str_replace( '\\', '/', $relativeFolder );
	}

	return [
		'oldPath'         => $oldPath,
		'newPath'         => $newPath,
		'relativeFolder'  => $relativeFolder,
		'rootPath'        => $rootPath
	];
}

/** Resolve rename targets using subdirectory-scoped search first, then root-wide fallback
 * @param $searchRoots  array       List of root directories to search for rename targets
 * @param $isFolderMode bool        True to search for directories, false for files
 * @param $oldFilename  string      Original filename (without extension)
 * @param $newFilename  string      Desired new filename (without extension)
 * @param $extension    string      Extension to use for file searches (including dot, e.g. ".safetensors")
 * @param $scopedSubdir string|null Optional subdirectory name to scope the initial search 
 * @return array|null Structured result with old/new paths and context, or null if no targets found
*/
function findRenameTargets(
	array   $searchRoots,
	bool    $isFolderMode,
	string  $oldFilename,
	string  $newFilename,
	string  $extension,
	?string $scopedSubdir = null
): ?array {

  global $debug;
  $debug .= "\n  findRenameTargets()\n    searchRoots=" . json_encode( $searchRoots ) . "\n    isFolderMode=" . json_encode( $isFolderMode ) . "\n    oldFilename=" . json_encode( $oldFilename ) . "\n    newFilename=" . json_encode( $newFilename ) . "\n    extension=" . json_encode( $extension ) . "\n    scopedSubdir=" . json_encode( $scopedSubdir );

	if( $scopedSubdir ) {
		foreach( $searchRoots as $rootPath ) {
			$scopedResult = findRenameTargetsInRoot(
				$rootPath,
				$isFolderMode,
				$oldFilename,
				$newFilename,
				$extension,
				$scopedSubdir,
				true
			);
      
      $debug .= "\n    scopedResult " . json_encode( $scopedResult );

      if( $scopedResult ) {
				return $scopedResult;
			}
		}
	}

	foreach( $searchRoots as $rootPath ) {
		$fallbackResult = findRenameTargetsInRoot(
			$rootPath,
			$isFolderMode,
			$oldFilename,
			$newFilename,
			$extension,
			$scopedSubdir,
			false
		);
		if( $fallbackResult ) {
			return $fallbackResult;
		}
	}

	return null;
}

/** Search for rename targets within one root, optionally scoped to a subdirectory
 * @param string      $rootPath         Root directory to search
 * @param bool        $isFolderMode     True to search for directories, false for files
 * @param string      $oldFilename      Original filename (without extension)
 * @param string      $newFilename      Desired new filename (without extension)
 * @param string      $extension        Extension to use for file searches (including dot, e.g. ".safetensors")
 * @param string|null $scopedSubdir     Optional subdirectory name to scope the initial search (relative to root)
 * @param bool        $restrictToScope  If true, only search within the scoped subdirectory; if false, search entire root with scoped search as a hint
 * @return array|null Structured result with old/new paths and context, or null if no targets
 */
function findRenameTargetsInRoot(
	string  $rootPath,
	bool    $isFolderMode,
	string  $oldFilename,
	string  $newFilename,
	string  $extension,
	?string $scopedSubdir,
	bool    $restrictToScope
): ?array {

	global $debug;
	$debug .= "\n  findRenameTargetsInRoot()\n    rootPath=" . json_encode( $rootPath ) . "\n    isFolderMode=" . json_encode( $isFolderMode ) . "\n    oldFilename=" . json_encode( $oldFilename ) . "\n    newFilename=" . json_encode( $newFilename ) . "\n    extension=" . json_encode( $extension ) . "\n    scopedSubdir=" . json_encode( $scopedSubdir ) . "\n    restrictToScope=" . json_encode( $restrictToScope );

	$oldFilenameWithExt = $oldFilename . $extension;
	$newFilenameWithExt = $newFilename . $extension;

	$searchFolder			  = $rootPath;
	$relativeFolderHint = null;

	if( $restrictToScope ) {
		if( !$scopedSubdir ) {
			return null;
		}

		$searchFolder = $rootPath . DIRECTORY_SEPARATOR . $scopedSubdir;
		if( !is_dir( $searchFolder ) ) {
			return null;
		}

		$relativeFolderHint = $scopedSubdir;
	}

	if( $isFolderMode ) {
		$directMatch = $searchFolder . DIRECTORY_SEPARATOR . $oldFilename;
		if( is_dir( $directMatch ) ) {
			return buildRenameTargetsResult(
				$rootPath,
				$directMatch,
				$searchFolder . DIRECTORY_SEPARATOR . $newFilename,
				$relativeFolderHint
			);
		}

		$foundDir = findDirectoryRecursively( $searchFolder, $oldFilename );
		if( $foundDir ) {
			$parentFolder = dirname( $foundDir );
			return buildRenameTargetsResult(
				$rootPath,
				$foundDir,
				$parentFolder . DIRECTORY_SEPARATOR . $newFilename
			);
		}

		return null;
	}

	$candidateFilePath = $searchFolder . DIRECTORY_SEPARATOR . $oldFilenameWithExt;
	if( is_dir( $searchFolder ) && file_exists( $candidateFilePath ) ) {
		return buildRenameTargetsResult(
			$rootPath,
			$candidateFilePath,
			$searchFolder . DIRECTORY_SEPARATOR . $newFilenameWithExt,
			$relativeFolderHint
		);
	}

	if( !is_dir( $searchFolder ) ) {
		return null;
	}

	$foundFile = findFileRecursively( $searchFolder, $oldFilenameWithExt );
	if( $foundFile ) {
		$folder = dirname( $foundFile );
		return buildRenameTargetsResult(
			$rootPath,
			$foundFile,
			$folder . DIRECTORY_SEPARATOR . $newFilenameWithExt
		);
	}

	return null;
}