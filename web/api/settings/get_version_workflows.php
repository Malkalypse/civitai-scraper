<?php
/** Get workflow hashes for a model version from version_workflows */

require_once __DIR__ . '/../api_utils.php';
api_set_json_header();

$input      = api_read_json_input();
$versionId  = isset( $input['versionId'] ) ? ( int )$input['versionId'] : 0;

if( $versionId <= 0 ) {
  api_send_failure( 'Missing or invalid versionId' );
}

$conn = api_db_connect();
if( $conn->connect_error ) {
  api_send_failure( 'Database connection failed: ' . $conn->connect_error, 500 );
}

$conn->set_charset('utf8mb4');

$sql  = 'SELECT workflow_hash, COUNT(*) AS image_count FROM images WHERE model_version_id = ? AND workflow_hash IS NOT NULL AND workflow_hash <> "" AND workflow_hash <> "-1" GROUP BY workflow_hash ORDER BY image_count DESC, workflow_hash ASC';
$stmt = $conn->prepare($sql);
if( !$stmt ) {
  $conn->close();
  api_send_failure( 'Prepare failed: ' . $conn->error, 500 );
}

$stmt->bind_param('i', $versionId);
if( !$stmt->execute() ) {
  $error = $stmt->error;
  $stmt->close();
  $conn->close();
  api_send_failure( 'Execute failed: ' . $error, 500 );
}

$result     = $stmt->get_result();
$workflows  = [];
if( $result ) {
  while( $row = $result->fetch_assoc() ) {
    if( !is_array( $row ) ) {
      continue;
    }

    $workflowHash = isset( $row['workflow_hash'] ) ? trim( ( string )$row['workflow_hash'] ) : '';
    if( $workflowHash === '' ) {
      continue;
    }

    $workflows[] = [
      'workflowHash' => $workflowHash,
      'imageCount' => isset( $row['image_count'] ) ? ( int )$row['image_count'] : 0
    ];
  }
}

$stmt->close();
$conn->close();

api_send_json( [
  'success'   => true,
  'versionId' => $versionId,
  'workflows' => $workflows
] );
