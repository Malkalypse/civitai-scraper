<?php
/**
 * Diagnostic test for extract_image_workflow.php
 */

require_once __DIR__ . '/../api_utils.php';

ob_start();

// Simulate what extract_image_workflow.php does at startup
error_reporting( E_ALL );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '1' );

set_error_handler(static function( $errno, $errstr, $errfile, $errline ) {
  error_log( "PHP Error [$errno]: $errstr in $errfile:$errline" );
  return false;
});

set_exception_handler(static function( Throwable $e ) {
  error_log( 'Uncaught Exception: ' . $e->getMessage() );
  ob_end_clean();
  ApiResponse::setJsonHeader();
  http_response_code( 500 );
  ApiResponse::sendJson([
    'success' => false,
    'error' => 'Exception: ' . $e->getMessage()
  ]);
  exit;
});

register_shutdown_function(static function() {
  $error = error_get_last();
  if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
    error_log( 'Fatal Error: ' . $error['message'] );
    ob_end_clean();
    ApiResponse::setJsonHeader();
    http_response_code( 500 );
    ApiResponse::sendJson([
      'success' => false,
      'error' => 'Fatal error: ' . $error['message'],
      'file' => $error['file'],
      'line' => $error['line']
    ]);
  } else {
    ob_end_flush();
  }
});

ApiResponse::sendJson([
  'success' => true,
  'message' => 'Startup handlers OK',
  'php_version' => phpversion(),
  'php_error_log' => ini_get( 'error_log' ),
  'memory_limit' => ini_get( 'memory_limit' )
]);
