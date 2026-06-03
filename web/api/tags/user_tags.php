<?php
/** User Tags API
 *
 * Manages user-defined tags on models via u_tags / model_u_tags tables.
 *
 * Actions (POST JSON):
 *   add    { modelId, tag }         — upsert tag into u_tags, link to model
 *   remove { modelId, tagId }       — unlink tag from model in model_u_tags
 */

require_once __DIR__ . '/../api_utils.php';

ApiResponse::setJsonHeader();

$input   = ApiResponse::readJsonInput();
$action  = $input['action'] ?? '';
$modelId = isset( $input['modelId'] ) ? (int)$input['modelId'] : 0;

if( $modelId <= 0 ) {
	ApiResponse::sendJson( ['error' => 'Invalid model ID'] );
}

$db = api_db_connect();

if( $db->connect_error ) {
	ApiResponse::sendJson( ['error' => 'DB connection failed: ' . $db->connect_error] );
}

$db->set_charset( 'utf8mb4' );

switch( $action ) {

	case 'add':
		$tag = trim( $input['tag'] ?? '' );
		if( $tag === '' ) {
			$db->close();
			ApiResponse::sendJson( ['error' => 'Tag text is required'] );
		}

		// Insert tag if new; ignore if duplicate, then look up id
		$stmt = $db->prepare( 'INSERT IGNORE INTO u_tags (tag) VALUES (?)' );
		$stmt->bind_param( 's', $tag );
		$stmt->execute();
		$tagId = (int)$db->insert_id;
		$stmt->close();

		if( $tagId <= 0 ) {
			// Tag already existed — look up its id
			$stmt = $db->prepare( 'SELECT id FROM u_tags WHERE tag = ?' );
			$stmt->bind_param( 's', $tag );
			$stmt->execute();
			$res   = $stmt->get_result();
			$tagId = (int)( $res->fetch_assoc()['id'] ?? 0 );
			$stmt->close();
		}

		if( $tagId <= 0 ) {
			$db->close();
			ApiResponse::sendJson( ['error' => 'Failed to resolve tag ID'] );
		}

		// Link tag to model (ignore if already linked)
		$stmt = $db->prepare( 'INSERT IGNORE INTO model_u_tags (model_id, tag_id) VALUES (?, ?)' );
		$stmt->bind_param( 'ii', $modelId, $tagId );
		$stmt->execute();
		$stmt->close();
		$db->close();

		ApiResponse::sendJson( ['success' => true, 'tagId' => $tagId, 'tag' => $tag] );
		break;

	case 'remove':
		$tagId = isset( $input['tagId'] ) ? (int)$input['tagId'] : 0;
		if( $tagId <= 0 ) {
			$db->close();
			ApiResponse::sendJson( ['error' => 'Invalid tag ID'] );
		}

		$stmt = $db->prepare( 'DELETE FROM model_u_tags WHERE model_id = ? AND tag_id = ?' );
		$stmt->bind_param( 'ii', $modelId, $tagId );
		$stmt->execute();
		$removed = $stmt->affected_rows > 0;
		$stmt->close();
		$db->close();

		ApiResponse::sendJson( ['success' => true, 'removed' => $removed] );
		break;

	case 'get':
		$stmt = $db->prepare(
			'SELECT ut.id, ut.tag FROM u_tags ut ' .
			'JOIN model_u_tags mut ON mut.tag_id = ut.id ' .
			'WHERE mut.model_id = ? ORDER BY ut.tag ASC'
		);
		$stmt->bind_param( 'i', $modelId );
		$stmt->execute();
		$res  = $stmt->get_result();
		$tags = [];
		while( $row = $res->fetch_assoc() ) {
			$tags[] = ['id' => (int)$row['id'], 'tag' => $row['tag']];
		}
		$stmt->close();
		$db->close();

		ApiResponse::sendJson( ['success' => true, 'tags' => $tags] );
		break;

case 'filter':
                $tags = array_values( array_filter(
                        array_map( 'strval', $input['tags'] ?? [] ),
                        fn( $t ) => trim( $t ) !== ''
                ) );
                if( empty( $tags ) ) {
                        $db->close();
                        ApiResponse::sendJson( ['success' => true, 'matchingModels' => []] );
                        break;
                }

                $tagCount     = count( $tags );
                $placeholders = implode( ',', array_fill( 0, $tagCount, '?' ) );
                $stmt         = $db->prepare( "SELECT id FROM u_tags WHERE tag IN ($placeholders)" );
                $stmt->bind_param( str_repeat( 's', $tagCount ), ...$tags );
                $stmt->execute();
                $res    = $stmt->get_result();
                $tagIds = [];
                while( $row = $res->fetch_assoc() ) {
                        $tagIds[] = (int)$row['id'];
                }
                $stmt->close();

                if( empty( $tagIds ) ) {
                        $db->close();
                        ApiResponse::sendJson( ['success' => true, 'matchingModels' => []] );
                        break;
                }

                $tagIdPlaceholders = implode( ',', array_fill( 0, count( $tagIds ), '?' ) );
                $stmt = $db->prepare( "
                        SELECT m.model_id, m.version_id, COUNT(DISTINCT mut.tag_id) AS tag_count
                        FROM model_u_tags mut
                        INNER JOIN models m ON mut.model_id = m.model_id
                        WHERE mut.tag_id IN ($tagIdPlaceholders)
                        GROUP BY m.model_id, m.version_id
                        HAVING tag_count = ?
                " );
                $types  = str_repeat( 'i', count( $tagIds ) ) . 'i';
                $params = array_merge( $tagIds, [count( $tagIds )] );
                $stmt->bind_param( $types, ...$params );
                $stmt->execute();
                $res            = $stmt->get_result();
                $matchingModels = [];
                while( $row = $res->fetch_assoc() ) {
                        $matchingModels[] = ['model_id' => (int)$row['model_id'], 'version_id' => (int)$row['version_id']];
                }
                $stmt->close();
                $db->close();
                ApiResponse::sendJson( ['success' => true, 'matchingModels' => $matchingModels] );
                break;

        default:
		$db->close();
		ApiResponse::sendJson( ['error' => "Unknown action: $action"] );
}
