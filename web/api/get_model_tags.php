<?php
/** Get Model Tags - Find models that match ALL specified tags
 * - Returns models where ALL provided tags are present
 */

header('Content-Type: application/json');

// Database connection
$servername = "localhost";
$username = "root";
$password = "";
$dbname = "civitai_models";

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed: ' . $conn->connect_error]);
    exit;
}

// Get JSON data from request body
$json = file_get_contents('php://input');
$data = json_decode($json, true);

if (!isset($data['tags']) || !is_array($data['tags']) || count($data['tags']) === 0) {
    echo json_encode(['success' => true, 'matchingModels' => []]);
    exit;
}

$tags = $data['tags'];
$tagCount = count($tags);

// Build query to find models that have ALL specified tags
// First, get tag IDs for the tag names
$placeholders = implode(',', array_fill(0, $tagCount, '?'));
$sql = "SELECT id, tag FROM tags WHERE tag IN ($placeholders)";
$stmt = $conn->prepare($sql);

$types = str_repeat('s', $tagCount);
$stmt->bind_param($types, ...$tags);
$stmt->execute();
$result = $stmt->get_result();

$tagIds = [];
$tagMap = [];
while ($row = $result->fetch_assoc()) {
    $tagIds[] = $row['id'];
    $tagMap[$row['id']] = $row['tag'];
}

$stmt->close();

if (count($tagIds) === 0) {
    echo json_encode(['success' => true, 'matchingModels' => []]);
    exit;
}

// Now find models that have ALL of these tag IDs
// Join with models table to get version_id
$tagIdPlaceholders = implode(',', array_fill(0, count($tagIds), '?'));
$sql = "
    SELECT m.model_id, m.version_id, COUNT(DISTINCT mt.tag_id) as tag_count
    FROM model_tags mt
    INNER JOIN models m ON mt.model_id = m.model_id
    WHERE mt.tag_id IN ($tagIdPlaceholders)
    GROUP BY m.model_id, m.version_id
    HAVING tag_count = ?
";

$stmt = $conn->prepare($sql);
$types = str_repeat('i', count($tagIds)) . 'i';
$params = array_merge($tagIds, [count($tagIds)]);
$stmt->bind_param($types, ...$params);
$stmt->execute();
$result = $stmt->get_result();

$matchingModels = [];
while ($row = $result->fetch_assoc()) {
    $matchingModels[] = [
        'model_id' => intval($row['model_id']),
        'version_id' => intval($row['version_id'])
    ];
}

$stmt->close();
$conn->close();

echo json_encode([
    'success' => true,
    'matchingModels' => $matchingModels,
    'searchedTags' => $tags,
    'foundTagIds' => $tagIds,
    'matchCount' => count($matchingModels)
]);
