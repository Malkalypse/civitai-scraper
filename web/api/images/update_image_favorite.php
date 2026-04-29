<?php
/** Update Image Favorite flag */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input          = api_read_json_input();
$imageId        = isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;
$favoriteInput  = $input['favorite'] ?? null;
$modelId        = isset( $input['modelId'] ) ? ( string )$input['modelId'] : '';
$modelVersionId = isset( $input['modelVersionId'] ) ? ( string )$input['modelVersionId'] : '';
$imageFilename  = isset( $input['imageFilename'] ) ? trim( ( string )$input['imageFilename'] ) : '';

if( $imageId <= 0 ) {
  api_send_failure( 'Missing or invalid imageId' );
}

/** Normalize various input types to a boolean favorite value
 * @param mixed $value Input value to normalize (bool, numeric, string)
 * @return bool Normalized boolean value (true for truthy inputs, false otherwise)
 */
function normalizeFavoriteValue( $value ): bool {
  if( is_bool( $value ) ) {
    return $value;
  }
  if( is_numeric( $value ) ) {
    return( ( int )$value ) === 1;
  }
  if( is_string( $value ) ) {
    $trimmed = strtolower( trim( $value ) );
    return in_array( $trimmed, ['1', 'true', 'yes', 'y', 'on'], true );
  }
  return false;
}

$favorited = normalizeFavoriteValue( $favoriteInput );

try {
  $cacheDir = __DIR__ . '/../../cache/image_generation';
  if( !is_dir( $cacheDir ) ) {
    @mkdir( $cacheDir, 0755, true );
  }

  $cacheFile  = $cacheDir . '/' . $imageId . '.json';
  $payload    = [];

  if( is_file( $cacheFile ) ) {
    $raw = @file_get_contents( $cacheFile );
    if( $raw !== false ) {
      $decoded = json_decode( $raw, true );
      if( is_array( $decoded ) ) {
        $payload = $decoded;
      }
    }
  }

  $payload['imageId'] = $imageId;
  if( $modelId !== '' ) {
    $payload['modelId'] = $modelId;
  }
  if( $modelVersionId !== '' ) {
    $payload['modelVersionId'] = $modelVersionId;
  }
  if( $imageFilename !== '' ) {
    $payload['imageFilename'] = $imageFilename;
  }
  if( isset( $payload['sourceUrl'] ) ) {
    unset( $payload['sourceUrl'] );
  }

  $payload['Favorite'] = $favorited;
  $payload['updatedAt'] = date('c');

  @file_put_contents( $cacheFile, json_encode( $payload ) );

  api_send_json( [
    'success'   => true,
    'imageId'   => $imageId,
    'favorite'  => $favorited
  ] );
} catch( Exception $e ) {
  api_send_failure( 'Exception: ' . $e->getMessage(), 500 );
}
