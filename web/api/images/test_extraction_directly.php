<?php
/**
 * Direct test of workflow extraction
 * Run from command line: php test_extraction_directly.php
 */

echo "=== Direct API Test ===\n\n";

// Simulate what the frontend sends
$testData = [
    'imageId' => 88012188,
    'imagePageUrl' => 'https://civitai.red/images/88012188',
    'fullImageUrl' => 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/cf54c0aa-3997-4675-877c-67ea80840f18/original=true/88012188.jpeg'
];

echo "Test data:\n";
print_r($testData);
echo "\n";

// Check if site.php is accessible
$configPath = __DIR__ . '/../../config/site.php';
echo "Checking for config file: $configPath\n";
echo "File exists: " . (file_exists($configPath) ? 'YES' : 'NO') . "\n";

if (file_exists($configPath)) {
    try {
        require_once $configPath;
        echo "Config loaded successfully\n";
        echo "SITE_STORAGE_BASE: " . (defined('SITE_STORAGE_BASE') ? SITE_STORAGE_BASE : 'NOT DEFINED') . "\n";
    } catch (Throwable $e) {
        echo "ERROR loading config: " . $e->getMessage() . "\n";
    }
}

echo "\n=== Now calling extract_image_workflow.php ===\n\n";

// Call the actual endpoint via file_get_contents with stream context
$url = 'http://localhost/civitai-scraper/web/api/images/extract_image_workflow.php';
$postData = json_encode($testData);

echo "Sending POST to: $url\n";
echo "Data: " . substr($postData, 0, 100) . "...\n";
echo "\n";

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nContent-Length: " . strlen($postData),
        'content' => $postData,
        'timeout' => 60
    ]
]);

$response = @file_get_contents($url, false, $context);

echo "Response status: " . ($http_response_header[0] ?? 'unknown') . "\n";
echo "Response length: " . strlen($response) . " bytes\n";
echo "Response (first 500 chars):\n";
echo substr($response, 0, 500) . "\n\n";

if ($response) {
    echo "Full response:\n";
    echo $response . "\n";
}
