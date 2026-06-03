<?php
/** Get Models Folder Structure
 * - Returns folder and file structure for models, optionally filtered by type.
 */

require_once __DIR__ . '/../../prefs.php';
require_once __DIR__ . '/../api_utils.php';

ApiResponse::setJsonHeader();

/** Collect existing file and folder names in a directory.
 * Returns an associative array mapping lowercase names to their relative directory
 * path within $basePath (empty string = directly inside $basePath).
 * @param string $basePath The base directory to scan
 * @return array Associative array: lowercase name => relative directory path
 */
function collectExistingFileNames( $basePath ) {
	$names = [];

	if( !is_dir( $basePath ) ) {
		return $names;
	}

	$normalizedBase = rtrim( str_replace( '\\', '/', $basePath ), '/' );

	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $basePath, RecursiveDirectoryIterator::SKIP_DOTS ),
		RecursiveIteratorIterator::SELF_FIRST
	);

	foreach( $iterator as $entry ) {
		if( $entry->isDir() ) {
			$dirName         = $entry->getFilename();
			$dirNameLower    = strtolower( $dirName );
			$dirNameNoExtLow = strtolower( pathinfo( $dirName, PATHINFO_FILENAME ) );
			$entryPath       = str_replace( '\\', '/', $entry->getPathname() );
			$relativeDir     = ltrim( str_replace( $normalizedBase, '', $entryPath ), '/' );

			$names[$dirNameLower]    = $relativeDir;
			$names[$dirNameNoExtLow] = $relativeDir;
			continue;
		}

		if( !$entry->isFile() ) {
			continue;
		}

		$fileName           = $entry->getFilename();
		$fileNameLower      = strtolower( $fileName );
		$fileNameNoExtLower = strtolower( pathinfo( $fileName, PATHINFO_FILENAME ) );
		$fileDir            = str_replace( '\\', '/', $entry->getPath() );
		$relativeDir        = ltrim( str_replace( $normalizedBase, '', $fileDir ), '/' );

		$names[$fileNameLower]      = $relativeDir;
		$names[$fileNameNoExtLower] = $relativeDir;
	}

	return $names;
}

// Database connection
$host		= 'localhost';
$user		= 'root';
$pass		= '';
$dbname	= 'civitai_models';
$conn		= new mysqli( $host, $user, $pass, $dbname );

// Check connection
if( $conn->connect_error ) {
	ApiResponse::sendError( 'Database connection failed: ' . $conn->connect_error );
}

try {

	// Get and validate 'type' parameter
	$type = isset( $_GET['type'] ) ? trim( $_GET['type'] ) : '';

	// Initialize variables for query construction
	$whereSql				= '';
	$params					= [];
	$paramTypes			= '';
	$typeFolderPath	= null;
	$typeFolderPaths = [];

	// Define valid types and their corresponding folder paths
	if( $type !== '' ) {
		$normalizedType = strtoupper( $type );

		// Define type aliases and corresponding database values and folder paths
		$typeAliases = [
			'LORA' => [
				'dbType' => 'LORA',
				'folderPath' => web_model_path( 'lora' ),
				'folderPaths' => [
					'lora' => web_model_path( 'lora' )
				]
			],
			'CHECKPOINT' => [
				'dbType' => 'CHECKPOINT',
				'folderPath' => web_model_path( 'checkpoint' ),
				'folderPaths' => [
					'checkpoint' => web_model_path( 'checkpoint' ),
					'unet' => web_model_path( 'unet' )
				]
			]
		];

		// Validate provided type against defined aliases
		if( !isset( $typeAliases[$normalizedType] ) ) {
			$conn->close();
			ApiResponse::sendError( 'Invalid model type' );
		}

		// Get database type and folder path for provided type
		$dbType					= $typeAliases[$normalizedType]['dbType'];
		$typeFolderPath	= $typeAliases[$normalizedType]['folderPath'];
		$typeFolderPaths = $typeAliases[$normalizedType]['folderPaths'] ?? [];

		// Construct WHERE clause and parameters for query
		$whereSql				= 'WHERE UPPER(type) = ?';
		$paramTypes			= 's';
		$params[]				= $dbType;
	}

	// Collect existing file names in target folder for existence checking
	$existingFileNamesByPath = [];
	if( !empty( $typeFolderPaths ) ) {
		foreach( $typeFolderPaths as $key => $path ) {
			$existingFileNamesByPath[$key] = collectExistingFileNames( $path );
		}
	} else {
		$existingFileNamesByPath['default'] = $typeFolderPath
			? collectExistingFileNames( $typeFolderPath )
			: [];
	}

	// Prepare and execute query to fetch models based on type filter
	$query = "SELECT model_id, version_id, base_model, filename, original_filename
						FROM models
						{$whereSql}
						ORDER BY filename";

	// Prepare statement and check for success
	$stmt = $conn->prepare( $query );
	if( !$stmt ) {
		throw new Exception( 'Database prepare failed: ' . $conn->error );
	}

	// Bind parameters if needed
	if( $paramTypes !== '' ) {
		$stmt->bind_param( $paramTypes, ...$params );
	}

	// Execute query and check for success
	if( !$stmt->execute() ) {
		throw new Exception( 'Database query failed: ' . $stmt->error );
	}

	// Get result set
	$result = $stmt->get_result();


	// Organize by folder (using base_model as folder name)
	
	$folderMap = [];

	while( $row = $result->fetch_assoc() ) {
		$folderName				= $row['base_model'] ?: 'Unknown';
		$rawFileName			= ( string )$row['filename'];
		$originalFileName = isset( $row['original_filename'] ) ? ( string )$row['original_filename'] : '';
		$fileName					= pathinfo( $rawFileName, PATHINFO_FILENAME );

		$exists = true;
		if( $typeFolderPath ) {
			$rawFileExt				= strtolower( pathinfo( $rawFileName, PATHINFO_EXTENSION ) );
			$originalFileExt	= strtolower( pathinfo( $originalFileName, PATHINFO_EXTENSION ) );
			$effectiveExt			= $rawFileExt !== '' ? $rawFileExt : $originalFileExt;
			$lookupBucket			= 'checkpoint';
			if( strtoupper( $type ) === 'LORA' ) {
				$lookupBucket = 'lora';
			} elseif( strtoupper( $type ) === 'CHECKPOINT' && $effectiveExt === 'gguf' ) {
				$lookupBucket = 'unet';
			}

			$existingFileNames = $existingFileNamesByPath[$lookupBucket]
				?? $existingFileNamesByPath['default']
				?? [];

			$candidateKeys = [
				strtolower( $rawFileName ),
				strtolower( pathinfo( $rawFileName, PATHINFO_FILENAME ) ),
				strtolower( $fileName ),
				strtolower( $fileName . '.gguf' ),
				strtolower( $fileName . '.safetensors' ),
				strtolower( $fileName . '.zip' )
			];

			if( $originalFileName !== '' ) {
				$candidateKeys[] = strtolower( $originalFileName );
				$candidateKeys[] = strtolower( pathinfo( $originalFileName, PATHINFO_FILENAME ) );
			}

		$exists   = false;
		$subfolder = null;
				foreach( $candidateKeys as $key ) {
					if( $key !== '' && isset( $existingFileNames[$key] ) ) {
						// Extract first-level subfolder within the base_model folder
						$relativeDir = $existingFileNames[$key];
						$firstSlash  = strpos( $relativeDir, '/' );
						if( $firstSlash !== false ) {
							$afterFirst = substr( $relativeDir, $firstSlash + 1 );
						$subfolder  = $afterFirst !== '' ? $afterFirst : null;
						}
					$exists = true;
					break;
				}
			}
		}

		if( !isset( $folderMap[$folderName] ) ) {
			$folderMap[$folderName] = [];
		}

		$folderMap[$folderName][] = [
			'name'      => $fileName,
			'modelId'   => $row['model_id'],
			'versionId' => $row['version_id'],
			'exists'    => $exists,
			'subfolder' => $subfolder
		];
	}

	// Convert to structure format and sort
	$structure = [];
	foreach( $folderMap as $folderName => $files ) {
		usort( $files, function( $a, $b ) {
			return strcasecmp( $a['name'], $b['name'] );
		} );

		$structure[] = [
			'folder'	=> $folderName,
			'files'		=> $files
		];
	}

	usort( $structure, function( $a, $b ) {
		return strcmp( $a['folder'], $b['folder'] );
	} );

	ApiResponse::sendJson( [
		'success'	=> true,
		'data'		=> $structure
	] );

	$stmt->close();
	$conn->close();
} catch( Exception $e ) {
	if( isset( $stmt ) && $stmt instanceof mysqli_stmt ) {
		$stmt->close();
	}
	if( isset( $conn ) ) {
		$conn->close();
	}
	ApiResponse::sendError( 'Exception: ' . $e->getMessage() );
}
