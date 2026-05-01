<?php
/** Get ComfyUI node port definitions by node type */

require_once __DIR__ . '/../api_utils.php';

ApiResponse::setJsonHeader();

$input          = json_decode( file_get_contents( 'php://input' ), true );
$nodeTypesInput = isset( $input['nodeTypes'] ) && is_array( $input['nodeTypes'] ) ? $input['nodeTypes'] : [];

$nodeTypes = [];
foreach ( $nodeTypesInput as $value ) {
  if( !is_string( $value ) ) {
    continue;
  }

  $type = trim( $value );
  if( $type === '' ) {
    continue;
  }

  $nodeTypes[$type] = true;
}

$nodeTypes = array_keys( $nodeTypes );

if( count( $nodeTypes ) === 0 ) {
  ApiResponse::sendJson( [
    'success' => true,
    'nodes'   => new stdClass()
  ] );
  exit;
}

$db = new mysqli( 'localhost', 'root', '', 'comfyui_nodes' );
if( $db->connect_error ) {
  ApiResponse::sendFailure( 'Database connection failed: ' . $db->connect_error );
}

$db->set_charset( 'utf8mb4' );

$placeholders = implode( ',', array_fill( 0, count( $nodeTypes ), '?' ) );
$sql = "
  SELECT
    n.type AS node_type,
    p.port_type,
    p.port_index,
    pl.label AS port_label
  FROM nodes n
  LEFT JOIN ports p ON p.node_id = n.id
  LEFT JOIN port_labels pl ON pl.id = p.label_id
  WHERE n.type IN ($placeholders)
  ORDER BY
    n.type ASC,
    FIELD(LOWER(p.port_type), 'input', 'widget', 'output'),
    p.port_index ASC,
    pl.label ASC
";

$stmt = $db->prepare( $sql );
if( !$stmt ) {
  ApiResponse::sendFailure( 'Database prepare failed: ' . $db->error );
  $db->close();
}

$types      = str_repeat( 's', count( $nodeTypes ) );
$bindParams = [$types];
foreach( $nodeTypes as $i => $type ) {
  $bindParams[] = &$nodeTypes[$i];
}

call_user_func_array( [$stmt, 'bind_param'], $bindParams );

if( !$stmt->execute() ) {
  ApiResponse::sendFailure( 'Database execute failed: ' . $stmt->error );
  $stmt->close();
  $db->close();
}

$result = $stmt->get_result();

$nodes = [];
foreach( $nodeTypes as $type) {
  $nodes[$type] = [
    'ports' => []
  ];
}

while( $row = $result->fetch_assoc() ) {
  $nodeType = isset( $row['node_type'] ) ? ( string )$row['node_type'] : '';
  $portType = isset( $row['port_type'] ) ? strtolower( trim( ( string )$row['port_type'] ) ) : '';

  if( $nodeType === '' || $portType === '' ) {
    continue;
  }

  if( !isset( $nodes[$nodeType] ) ) {
    $nodes[$nodeType] = ['ports' => []];
  }

  $nodes[$nodeType]['ports'][] = [
    'port_type'   => $portType,
    'port_index'  => isset( $row['port_index'] ) ? ( int )$row['port_index'] : 0,
    'label'       => isset( $row['port_label'] ) ? ( string )$row['port_label'] : ''
  ];
}

$stmt->close();
$db->close();

ApiResponse::sendJson( [
  'success' => true,
  'nodes'   => $nodes
] );
