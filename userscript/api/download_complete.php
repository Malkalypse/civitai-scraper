<?php
/**
 * Handle download completion notifications from userscript
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'Only POST requests allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    echo json_encode(['error' => 'Invalid JSON input', 'success' => false]);
    exit;
}

// Log the download completion
$logFile = __DIR__ . '/../download_completions.log';
$logEntry = date('Y-m-d H:i:s') . ' | ' . json_encode($input) . "\n";
file_put_contents($logFile, $logEntry, FILE_APPEND);

// You can add additional processing here:
// - Trigger sync to database
// - Update file metadata
// - Send notifications
// - etc.

echo json_encode([
    'success' => true,
    'message' => 'Download completion recorded',
    'data' => $input
]);
