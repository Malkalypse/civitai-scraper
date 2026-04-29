<?php
/**
 * Minimal test to verify API endpoint is reachable
 */

require_once __DIR__ . '/../api_utils.php';

// This should always work
api_set_json_header();
api_send_json([
  'success' => true,
  'message' => 'API endpoint is reachable',
  'time' => date('Y-m-d H:i:s'),
  'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
]);
