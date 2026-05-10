<?php
/** Migrate image_generation JSON files to images database table.
 * 
 * Usage: Visit /civitai-scraper/web/api/utils/migrate_json_to_db.php in a browser
 * Or run from command line: php migrate_json_to_db.php
 */

require_once __DIR__ . '/../api_utils.php';

$db = api_db_connect();
if( $db->connect_error ) {
  die( 'Database connection failed: ' . $db->connect_error );
}
$db->set_charset( 'utf8mb4' );

$cacheDir = __DIR__ . '/../../cache/image_generation';
if( !is_dir( $cacheDir ) ) {
  die( 'Cache directory not found: ' . $cacheDir );
}

$migrated = 0;
$skipped  = 0;
$errors   = [];

// Process all JSON files in the cache directory
$files = @scandir( $cacheDir );
if( $files === false ) {
  die( 'Could not read cache directory' );
}

foreach( $files as $filename ) {
  if( !preg_match( '/^(\d+)\.json$/', $filename, $matches ) ) {
    continue;
  }

  $imageId = (int)$matches[1];
  if( $imageId <= 0 ) {
    continue;
  }

  $filepath = $cacheDir . '/' . $filename;
  $raw      = @file_get_contents( $filepath );
  if( $raw === false ) {
    $errors[] = "Could not read file: $filename";
    continue;
  }

  $payload = json_decode( $raw, true );
  if( !is_array( $payload ) ) {
    $errors[] = "Invalid JSON in: $filename";
    continue;
  }

  // Extract fields from JSON
  $modelId        = isset( $payload['modelId'] )        ? ( int )$payload['modelId'] : 0;
  $modelVersionId = isset( $payload['modelVersionId'] ) ? ( int )$payload['modelVersionId'] : 0;
  $imageFilename  = isset( $payload['imageFilename'] )  ? trim( (string )$payload['imageFilename'] ) : '';
  $copyAllText    = isset( $payload['copyAllText'] )    ? ( string )$payload['copyAllText'] : '';
  $favorite       = isset( $payload['Favorite'] )       ? ( int )$payload['Favorite'] : 0;
  $workflowHash   = null;
  
  if( isset( $payload['workflow'] ) ) {
    if( $payload['workflow'] === null ) {
      // JSON null means workflow was checked and missing.
      $workflowHash = '-1';
    } elseif( is_string( $payload['workflow'] ) && trim( $payload['workflow'] ) !== '' ) {
      $workflowHash = trim( $payload['workflow'] );
    }
  }

  // Check if image already in DB
  $checkSql   = 'SELECT 1 FROM images WHERE image_id = ? LIMIT 1';
  $checkStmt  = $db->prepare($checkSql);
  if( !$checkStmt ) {
    $errors[] = "Prepare failed for image $imageId: " . $db->error;
    continue;
  }

  $checkStmt->bind_param( 'i', $imageId );
  $checkStmt->execute();
  $checkResult  = $checkStmt->get_result();
  $exists       = $checkResult && $checkResult->fetch_assoc();
  $checkResult->free();
  $checkStmt->close();

  if( $exists ) {
    $skipped++;
    continue;
  }

  // Insert into images table
  $insertSql = 'INSERT INTO images ' .
               '(image_id, model_id, model_version_id, copy_all_text, workflow_hash, favorite) ' .
               'VALUES (?, ?, ?, ?, ?, ?)';

  $insertStmt = $db->prepare( $insertSql );
  if( !$insertStmt ) {
    $errors[] = "Prepare insert failed for image $imageId: " . $db->error;
    continue;
  }

  $insertStmt->bind_param( 'iiissi', $imageId, $modelId, $modelVersionId,
                          $copyAllText, $workflowHash, $favorite);
  
  if( !$insertStmt->execute() ) {
    $errors[] = "Execute failed for image $imageId: " . $insertStmt->error;
    $insertStmt->close();
    continue;
  }

  $insertStmt->close();
  $migrated++;
}

$db->close();

// Output results
echo "=== Migration Results ===\n";
echo "Migrated: $migrated\n";
echo "Skipped (already in DB): $skipped\n";
if( !empty( $errors ) ) {
  echo "\nErrors:\n";
  foreach( $errors as $error ) {
    echo "  - $error\n";
  }
}
echo "\nDone.\n";
