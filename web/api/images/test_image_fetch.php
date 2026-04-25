<?php
/**
 * Diagnostic: test fetching a specific image URL and detecting format
 * Access: http://localhost/civitai-scraper/web/api/images/test_image_fetch.php
 */

header('Content-Type: text/plain');

$testUrl = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/cf54c0aa-3997-4675-877c-67ea80840f18/original=true/88012188.jpeg';
$b2Url   = 'https://image-b2.civitai.com/file/civitai-media-cache/cf54c0aa-3997-4675-877c-67ea80840f18/original';

$urls = [$testUrl, $b2Url];

foreach ($urls as $url) {
    echo "Fetching: $url\n";

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        CURLOPT_HTTPHEADER     => ['Accept: */*'],
        // Only download the first 512KB — enough for PNG header chunks
        CURLOPT_RANGE          => '0-524287',
    ]);

    $body     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $error    = curl_error($ch);
    curl_close($ch);

    echo "  HTTP code:   $httpCode\n";
    echo "  Final URL:   $finalUrl\n";
    echo "  Body length: " . strlen($body) . " bytes\n";
    echo "  cURL error:  " . ($error ?: '(none)') . "\n";

    if (is_string($body) && strlen($body) >= 8) {
        $isPng  = substr($body, 0, 8) === "\x89PNG\r\n\x1a\n";
        $isJpeg = !$isPng && substr($body, 0, 2) === "\xFF\xD8";
        echo "  Format:      " . ($isPng ? 'PNG' : ($isJpeg ? 'JPEG' : 'Unknown (hex: ' . bin2hex(substr($body, 0, 4)) . ')')) . "\n";

        if ($isPng) {
            // Count tEXt chunks
            $textChunks = 0;
            $offset = 8;
            $len = strlen($body);
            while ($offset + 8 <= $len) {
                $chunkLen  = unpack('N', substr($body, $offset, 4))[1];
                $chunkType = substr($body, $offset + 4, 4);
                if (in_array($chunkType, ['tEXt', 'zTXt', 'iTXt'])) {
                    $textChunks++;
                    $keyword = '';
                    $data = substr($body, $offset + 8, min($chunkLen, 50));
                    $nullPos = strpos($data, "\0");
                    if ($nullPos !== false) {
                        $keyword = substr($data, 0, $nullPos);
                    }
                    echo "    Chunk $chunkType: keyword='$keyword'\n";
                }
                if ($chunkType === 'IDAT' || $chunkType === 'IEND') {
                    echo "  (stopped at $chunkType)\n";
                    break;
                }
                $offset += 12 + $chunkLen;
                if ($chunkLen < 0 || $offset > $len) break;
            }
            echo "  Text chunks: $textChunks\n";
        }
    }
    echo "\n";
}

echo "Done.\n";
