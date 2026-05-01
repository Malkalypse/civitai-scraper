<?php
/**
 * Minimal test to verify API endpoint is reachable
 */

require_once __DIR__ . '/../api_utils.php';

// This should always work
ApiResponse::setJsonHeader();
ApiResponse::sendJson([
  'success' => true,
  'message' => 'API endpoint is reachable',
  'time' => date('Y-m-d H:i:s'),
  'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
]);
