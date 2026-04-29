<?php
/** Cache Manager
 * 
 * Handles cache size calculation and clearing
 */

require_once __DIR__ . '/../api_utils.php';

api_set_json_header();

// Input parameters
$input    = json_decode( file_get_contents( 'php://input' ), true );
$action   = $input['action'] ?? null;
$modelId  = $input['modelId'] ?? null;

// Cache directories
$cacheDir       = __DIR__ . '/../../cache/images';
$generationDir  = __DIR__ . '/../../cache/image_generation';

// Create cache directories if they don't exist
if( !file_exists( $cacheDir ) ) {
  mkdir( $cacheDir, 0755, true );
}
if( !file_exists( $generationDir ) ) {
  mkdir( $generationDir, 0755, true );
}


/** Load generation metadata by model
 * @param mixed $generationDir Path to generation metadata directory
 * @param mixed $targetModelId Optional model ID to filter results for
 * @return mixed Array with two elements:
 * - [0] => associative array of modelId => [filename => true]
 * - [1] => array of metadata entries for target model (if specified)
 */
function loadGenerationMetadataByModel( $generationDir, $targetModelId = null ) {
  $byModel      = [];
  $modelScoped  = [];

  $files = glob( $generationDir . '/*.json' );
  foreach( $files as $file) {
    if( !is_file( $file ) ) {
      continue;
    }

    $raw = @file_get_contents( $file );
    if( $raw === false ) {
      continue;
    }

    $row = json_decode( $raw, true );
    if( !is_array( $row ) ) {
      continue;
    }

    $filename       = isset( $row['imageFilename'] ) ? trim( ( string )$row['imageFilename'] ) : '';
    $storedModelId  = isset( $row['modelId'] ) ? ( string )$row['modelId'] : '';

    if( $filename !== '' && $storedModelId !== '' ) {
      if( !isset( $byModel[$storedModelId] ) ) {
        $byModel[$storedModelId] = [];
      }
      $byModel[$storedModelId][$filename] = true;
    }

    if( $targetModelId !== null && $targetModelId !== '' && $storedModelId === ( string )$targetModelId ) {
      $modelScoped[] = [
        'path'          => $file,
        'imageFilename' => $filename
      ];
    }
  }

  return [$byModel, $modelScoped];
}

/** Get file size in bytes, returning 0 for invalid paths
 * @param mixed $path File path to check
 * @return int File size in bytes (or 0 if invalid)
 */
function getFileSizeBytes( $path ) {
  if( !is_string( $path ) || !is_file( $path ) ) {
    return 0;
  }

  $size = @filesize( $path );
  return is_numeric( $size ) ? ( int )$size : 0;
}

switch( $action ) {
  
  case 'getSize': // calculate total cache size and size for the specified model

    $totalSize = 0;
    $modelSize = 0;
    $fileCount = 0;

    [$metadataByModel] = loadGenerationMetadataByModel( $generationDir, null );
    $modelFilenames = [];
    if( $modelId !== null && $modelId !== '' ) {
      $modelFilenames = isset( $metadataByModel[( string )$modelId] )
        ? $metadataByModel[( string )$modelId]
        : [];
    }
    
    $files = glob( $cacheDir . '/*' );
    foreach( $files as $file ) {
      if( is_file( $file ) && strtolower( pathinfo( $file, PATHINFO_EXTENSION ) ) !== 'json' ) {
        $fileSize = getFileSizeBytes( $file );
        $totalSize += $fileSize;
        $fileCount++;
        
        // Check if this file belongs to the current model
        $filename = basename( $file );
        if( $modelId && isset( $modelFilenames[$filename] ) ) {
          $modelSize += $fileSize;
        }
      }
    }
    
    api_send_json( [
      'totalSize'   => $totalSize,
      'totalSizeMB' => round( $totalSize / 1048576, 2 ),
      'modelSize'   => $modelSize,
      'modelSizeMB' => round( $modelSize / 1048576, 2 ),
      'fileCount'   => $fileCount
    ] );
    break;
    
  case 'clearModel': // delete cached images and metadata for the specified model
    if( !$modelId ) {
      api_send_error( 'No model ID provided' );
    }
    
    $deletedImageCount    = 0;
    $deletedImageSize     = 0;
    $deletedMetadataCount = 0;
    $deletedMetadataSize  = 0;

    [, $modelEntries] = loadGenerationMetadataByModel( $generationDir, $modelId );

    // Delete image files for this model from per-image metadata
    foreach( $modelEntries as $entry ) {
      $imageFilename = isset( $entry['imageFilename'] ) ? $entry['imageFilename'] : '';
      if( $imageFilename !== '' ) {
        $filepath = $cacheDir . '/' . $imageFilename;
        if( file_exists( $filepath ) ) {
          $deletedImageSize += getFileSizeBytes( $filepath );
          @unlink( $filepath );
          $deletedImageCount++;
        }
      }

      if( isset( $entry['path'] ) && is_file( $entry['path'] ) ) {
        $deletedMetadataSize += getFileSizeBytes( $entry['path'] );
        @unlink( $entry['path'] );
        $deletedMetadataCount++;
      }
    }

    $deletedCount = $deletedImageCount + $deletedMetadataCount;
    $deletedSize  = $deletedImageSize + $deletedMetadataSize;
    
    api_send_json( [
      'success' => true,
      'deletedCount'          => $deletedCount,
      'deletedSize'           => $deletedSize,
      'deletedSizeMB'         => round( $deletedSize / 1048576, 2 ),
      'deletedImageCount'     => $deletedImageCount,
      'deletedImageSize'      => $deletedImageSize,
      'deletedImageSizeMB'    => round( $deletedImageSize / 1048576, 2 ),
      'deletedMetadataCount'  => $deletedMetadataCount,
      'deletedMetadataSize'   => $deletedMetadataSize,
      'deletedMetadataSizeMB' => round( $deletedMetadataSize / 1048576, 2 )
    ] );
    break;
    
  case 'clearAll': // delete all cached images and metadata
    $deletedImageCount    = 0;
    $deletedImageSize     = 0;
    $deletedMetadataCount = 0;
    $deletedMetadataSize  = 0;
    
    $files = glob( $cacheDir . '/*' );
    foreach( $files as $file ) {
      if( is_file( $file ) && strtolower( pathinfo( $file, PATHINFO_EXTENSION ) ) !== 'json' ) {
        $deletedImageSize += getFileSizeBytes( $file );
        @unlink( $file );
        $deletedImageCount++;
      }
    }

    $generationFiles = glob( $generationDir . '/*.json' );
    foreach( $generationFiles as $file ) {
      if( is_file( $file ) ) {
        $deletedMetadataSize += getFileSizeBytes( $file );
        @unlink( $file );
        $deletedMetadataCount++;
      }
    }

    $deletedCount = $deletedImageCount + $deletedMetadataCount;
    $deletedSize  = $deletedImageSize + $deletedMetadataSize;
    
    api_send_json( [
      'success' => true,
      'deletedCount'          => $deletedCount,
      'deletedSize'           => $deletedSize,
      'deletedSizeMB'         => round( $deletedSize / 1048576, 2 ),
      'deletedImageCount'     => $deletedImageCount,
      'deletedImageSize'      => $deletedImageSize,
      'deletedImageSizeMB'    => round( $deletedImageSize / 1048576, 2 ),
      'deletedMetadataCount'  => $deletedMetadataCount,
      'deletedMetadataSize'   => $deletedMetadataSize,
      'deletedMetadataSizeMB' => round( $deletedMetadataSize / 1048576, 2 )
    ] );
    break;
    
  default:
    api_send_error( 'Invalid action' );
}
