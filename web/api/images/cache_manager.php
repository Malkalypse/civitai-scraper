<?php
/** Cache Manager
 * 
 * Handles cache size calculation and clearing
 */

require_once __DIR__ . '/../api_utils.php';
require_once __DIR__ . '/image_cache_manager_utils.php';

ApiResponse::setJsonHeader();

// Input parameters
$input    = json_decode( file_get_contents( 'php://input' ), true );
$action   = $input['action'] ?? null;
$modelId  = $input['modelId'] ?? null;

// Cache directories
$cacheDir       = __DIR__ . '/../../cache/images';
$generationDir  = __DIR__ . '/../../cache/image_generation';

$cache = new ImageCacheManager( $cacheDir, $generationDir );
$cache->ensureDirectories();


switch( $action ) {
  
  case 'getSize': // calculate total cache size and size for the specified model

    $totalSize = 0;
    $modelSize = 0;
    $fileCount = 0;

    [$metadataByModel] = $cache->loadGenerationMetadataByModel();
    $modelFilenames = [];
    if( $modelId !== null && $modelId !== '' ) {
      $modelFilenames = isset( $metadataByModel[( string )$modelId] )
        ? $metadataByModel[( string )$modelId]
        : [];
    }
    
    $files = glob( $cacheDir . '/*' );
    foreach( $files as $file ) {
      if( is_file( $file ) && strtolower( pathinfo( $file, PATHINFO_EXTENSION ) ) !== 'json' ) {
        $fileSize = ImageCacheManager::getFileSizeBytes( $file );
        $totalSize += $fileSize;
        $fileCount++;
        
        // Check if this file belongs to the current model
        $filename = basename( $file );
        if( $modelId && isset( $modelFilenames[$filename] ) ) {
          $modelSize += $fileSize;
        }
      }
    }
    
    ApiResponse::sendJson( [
      'totalSize'   => $totalSize,
      'totalSizeMB' => round( $totalSize / 1048576, 2 ),
      'modelSize'   => $modelSize,
      'modelSizeMB' => round( $modelSize / 1048576, 2 ),
      'fileCount'   => $fileCount
    ] );
    break;
    
  case 'clearModel': // delete cached images and metadata for the specified model
    if( !$modelId ) {
      ApiResponse::sendError( 'No model ID provided' );
    }
    
    $deletedImageCount    = 0;
    $deletedImageSize     = 0;
    $deletedMetadataCount = 0;
    $deletedMetadataSize  = 0;

    [, $modelEntries] = $cache->loadGenerationMetadataByModel( $modelId );

    // Delete image files for this model using imageId-based canonical filename
    foreach( $modelEntries as $entry ) {
      $entryImageId = isset( $entry['imageId'] ) ? ( int )$entry['imageId'] : 0;
      if( $entryImageId > 0 ) {
        foreach( ['jpg', 'png', 'webp', 'gif'] as $ext ) {
          $filepath = $cacheDir . '/' . $entryImageId . '.' . $ext;
          if( file_exists( $filepath ) ) {
            $deletedImageSize += ImageCacheManager::getFileSizeBytes( $filepath );
            @unlink( $filepath );
            $deletedImageCount++;
            break;
          }
        }
      }

      if( isset( $entry['path'] ) && is_file( $entry['path'] ) ) {
        $deletedMetadataSize += ImageCacheManager::getFileSizeBytes( $entry['path'] );
        @unlink( $entry['path'] );
        $deletedMetadataCount++;
      }
    }

    $deletedCount = $deletedImageCount + $deletedMetadataCount;
    $deletedSize  = $deletedImageSize + $deletedMetadataSize;
    
    ApiResponse::sendJson( [
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
        $deletedImageSize += ImageCacheManager::getFileSizeBytes( $file );
        @unlink( $file );
        $deletedImageCount++;
      }
    }

    $generationFiles = glob( $generationDir . '/*.json' );
    foreach( $generationFiles as $file ) {
      if( is_file( $file ) ) {
        $deletedMetadataSize += ImageCacheManager::getFileSizeBytes( $file );
        @unlink( $file );
        $deletedMetadataCount++;
      }
    }

    $deletedCount = $deletedImageCount + $deletedMetadataCount;
    $deletedSize  = $deletedImageSize + $deletedMetadataSize;
    
    ApiResponse::sendJson( [
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
    ApiResponse::sendError( 'Invalid action' );
}
