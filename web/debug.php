<?php

$GLOBALS['__API_DEBUG_LINES'] = [];

function debug_api_to_console($msg) {
    $GLOBALS['__API_DEBUG_LINES'][] = print_r($msg, true);
}

function flush_api_debug_header() {
    $lines = $GLOBALS['__API_DEBUG_LINES'] ?? [];

    if (empty($lines)) {
        return;
    }

    if (headers_sent()) {
        return;
    }

    // Combine all debug messages into one header-safe string
    $payload = implode(" | ", array_map(
        fn($l) => preg_replace('/\s+/', ' ', trim($l)),
        $lines
    ));

    // Keep debug header safely under typical proxy/server limits.
    if (strlen($payload) > 7000) {
        $payload = substr($payload, 0, 7000) . '...';
    }

    // Add header without breaking JSON output
    header("X-API-Debug: $payload");
}

