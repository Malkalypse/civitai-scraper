<?php
/**
 * Minimal test to verify API endpoint is reachable
 */

// This should always work
header('Content-Type: application/json');
echo json_encode([
  'success' => true,
  'message' => 'API endpoint is reachable',
  'time' => date('Y-m-d H:i:s'),
  'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
]);
