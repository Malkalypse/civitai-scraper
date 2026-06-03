<?php
/** Update Image Favorite flag */

require_once __DIR__ . '/../api_utils.php';
ApiResponse::setJsonHeader();

$input          = ApiResponse::readJsonInput();
$imageId        = isset( $input['imageId'] ) ? ( int )$input['imageId'] : 0;
$displayInput   = $input['display'] ?? null;
$modelId        = isset( $input['modelId'] ) ? ( string )$input['modelId'] : '';
$modelVersionId = isset( $input['modelVersionId'] ) ? ( string )$input['modelVersionId'] : '';

if( $imageId <= 0 ) {
  ApiResponse::sendFailure( 'Missing or invalid imageId' );
}

/** Normalize various input types to an integer display value: -1 (dismissed), 0 (normal), or 1 (favorite)
 * @param mixed $value Input value to normalize
 * @return int -1, 0, or 1
 */
function normalizeDisplayInt( $value ): int {
  if( is_numeric( $value ) ) {
    $int = ( int )$value;
    if( $int === -1 ) return -1;
    return $int !== 0 ? 1 : 0;
  }
  if( is_bool( $value ) ) {
    return $value ? 1 : 0;
  }
  if( is_string( $value ) ) {
    $trimmed = strtolower( trim( $value ) );
    if( $trimmed === '-1' ) return -1;
    return in_array( $trimmed, ['1', 'true', 'yes', 'y', 'on'], true ) ? 1 : 0;
  }
  return 0;
}

$displayed = normalizeDisplayInt( $displayInput );

try {
  // Persist to database
  $db = api_db_connect();
  if( !$db->connect_error ) {
    $db->set_charset( 'utf8mb4' );
    $resolvedModelId        = $modelId !== '' ? ( int )$modelId : 0;
    $resolvedModelVersionId = $modelVersionId !== '' ? ( int )$modelVersionId : 0;
    $sql = 'INSERT INTO images (image_id, model_id, model_version_id, display) VALUES (?, ?, ?, ?) ' .
           'ON DUPLICATE KEY UPDATE display = ?, updated_at = CURRENT_TIMESTAMP';
    $stmt = $db->prepare( $sql );
    if( $stmt ) {
      $stmt->bind_param( 'iiiii', $imageId, $resolvedModelId, $resolvedModelVersionId, $displayed, $displayed );
      $stmt->execute();
      $stmt->close();
    }
    $db->close();
  }

  ApiResponse::sendJson( [
    'success'   => true,
    'imageId'   => $imageId,
    'display'   => $displayed
  ] );
} catch( Exception $e ) {
  ApiResponse::sendFailure( 'Exception: ' . $e->getMessage(), 500 );
}
