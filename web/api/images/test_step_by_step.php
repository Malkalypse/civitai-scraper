<?php
/**
 * Step-by-step test that isolates exactly where extract_image_workflow.php fails.
 * Access: http://localhost/civitai-scraper/web/api/images/test_step_by_step.php
 */
header('Content-Type: text/plain');
echo "Step 1: Basic PHP OK\n"; flush();

require_once __DIR__ . '/../../config/site.php';
echo "Step 2: Config loaded OK\n"; flush();

// Attempt to include extract_image_workflow.php logic by parsing it
// Check if it can be loaded at all
$extractFile = __DIR__ . '/extract_image_workflow.php';
echo "Step 3: extract_image_workflow.php path: $extractFile\n"; flush();
echo "Step 3b: File exists: " . (file_exists($extractFile) ? 'YES' : 'NO') . "\n"; flush();
echo "Step 3c: File size: " . filesize($extractFile) . " bytes\n"; flush();

// Try to check syntax using token_get_all (parses without executing)
$source = file_get_contents($extractFile);
$parseErrors = [];
try {
    $tokens = token_get_all($source, TOKEN_PARSE);
    echo "Step 4: token_get_all OK (" . count($tokens) . " tokens)\n"; flush();
} catch (ParseError $e) {
    echo "Step 4: PARSE ERROR: " . $e->getMessage() . " on line " . $e->getLine() . "\n"; flush();
}

// Test fetchImagePartial directly
echo "Step 5: Testing partial image fetch...\n"; flush();

$testUrl = 'https://image-b2.civitai.com/file/civitai-media-cache/cf54c0aa-3997-4675-877c-67ea80840f18/original';
$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL            => $testUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT      => 'Mozilla/5.0',
    CURLOPT_HTTPHEADER     => ['Accept: */*'],
    CURLOPT_RANGE          => '0-524287',
]);
$body = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

echo "Step 5b: HTTP $httpCode, " . strlen($body) . " bytes, error: " . ($curlErr ?: 'none') . "\n"; flush();
$isPng = strlen($body) >= 8 && substr($body, 0, 8) === "\x89PNG\r\n\x1a\n";
echo "Step 5c: Is PNG: " . ($isPng ? 'yes' : 'no') . "\n"; flush();

// Test parsePngTextChunks inline
echo "Step 6: Parsing PNG text chunks inline...\n"; flush();
$entries = [];
if ($isPng) {
    $offset = 8;
    $len = strlen($body);
    while ($offset + 8 <= $len) {
        $chunkLen  = unpack('N', substr($body, $offset, 4))[1];
        $chunkType = substr($body, $offset + 4, 4);
        if ($chunkType === 'tEXt') {
            $data    = substr($body, $offset + 8, $chunkLen);
            $nullPos = strpos($data, "\0");
            if ($nullPos !== false) {
                $entries[] = ['chunk' => 'tEXt', 'keyword' => substr($data, 0, $nullPos), 'text' => substr($data, $nullPos + 1)];
            }
        }
        if ($chunkType === 'IDAT' || $chunkType === 'IEND') break;
        $offset += 12 + $chunkLen;
        if ($chunkLen < 0 || $offset > $len) break;
    }
    echo "Step 6b: Found " . count($entries) . " text entries\n"; flush();
    foreach ($entries as $e) {
        echo "Step 6c:   keyword='" . $e['keyword'] . "' textLen=" . strlen($e['text']) . "\n"; flush();
    }
}

echo "Step 7: All steps complete.\n"; flush();
