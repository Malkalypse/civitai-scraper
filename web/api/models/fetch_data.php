<?php
/** Civitai Data Fetcher
 * 
 * Fetches the __NEXT_DATA__ JSON from a Civitai model page
 * Extracts model versions and tags
 * Returns structured JSON response with model data
 * 
 * Called by frontend with a modelInput string (e.g. "12345?modelVersionId=678")
 */

require_once __DIR__ . '/../../config/site.php';

header( 'Content-Type: application/json' );

/** Respond with an error message and exit
 * @param string $message Error message to include in the response
 * @return void Outputs JSON error response and terminates script execution
 */
function respondError( string $message ): void {
  echo json_encode( ['error' => $message] );
  exit;
}

/** Get raw JSON input and decode it
 * - Expects input JSON like: { "modelInput": "12345?modelVersionId=678" }
 * @return string|null modelInput from input (or null)
 */
function getModelInput() {
  $input = json_decode( file_get_contents( 'php://input' ), true );
  global $debug;  
  $debug .= "\n  modelInput: " . json_encode( $input );
  return $input['modelInput'] ?? $input['modelData'] ?? null;
}

/** Extract modelId from input string
 * @param string $modelInput Raw modelInput input
 * @return string Extracted modelId (digits only), or original input if no match
 */
function getModelId( string $modelInput ): string {
  if ( preg_match( '/(?:models\/)?(\d+)/', $modelInput, $idMatch ) ) {
    global $debug;
    $debug .= "\n  modelId: " . json_encode( $idMatch[1] );
    return $idMatch[1];
  }
  return preg_replace( '/[?&].*$/', '', $modelInput );
}

/** Extract modelVersionId from input string if present
 * - Expects input like: "12345?modelVersionId=678"
 * @param string $modelInput Raw modelInput input which may contain query parameters
 * @return int|null Extracted modelVersionId as integer (or null)
 */
function getVersionId( string $modelInput ): ?int {
  global $debug;
  if( preg_match( '/[?&]modelVersionId=(\d+)/', $modelInput, $versionMatch ) ) {
    $debug .= "\n  versionId: " . json_encode( $versionMatch[1] );
    return ( int )$versionMatch[1];
  }
  return null;
}

/** Build URL to Civitai model page from modelInput
 * @param string $modelInput The model data input
 * @return string The constructed URL to the model page
 */
function buildModelUrl( string $modelInput ): string {
  return SITE_URL_MODELS . '/' . $modelInput;
}

/** Fetch the HTML content of a Civitai model page
 * @param string $url URL to fetch
 * @return array Array with 'success' (bool), 'html' (string), and 'error' (string) keys
 */
function fetchModelPageHtml( string $url ): array {
  $ch = curl_init();

  // Set cURL options for fetching the model page
  curl_setopt_array( $ch, [
    CURLOPT_URL             => $url,
    CURLOPT_RETURNTRANSFER  => true,
    CURLOPT_FOLLOWLOCATION  => true,
    CURLOPT_MAXREDIRS       => 5,
    CURLOPT_TIMEOUT         => 30,
    CURLOPT_SSL_VERIFYPEER  => false,
    CURLOPT_USERAGENT       => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    CURLOPT_HTTPHEADER      => [
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language: en-US,en;q=0.5',
      'Connection: keep-alive',
      'Upgrade-Insecure-Requests: 1'
    ],
    CURLOPT_ENCODING        => ''
  ] );

  // Execute the request and capture response, HTTP code, and any errors
  $html     = curl_exec( $ch ); // HTML content of the civitai page
  $httpCode = curl_getinfo( $ch, CURLINFO_HTTP_CODE );
  $error    = curl_error( $ch );

  // Handle error conditions
  if( $error ) {
    return ['success' => false, 'error' => "cURL error: {$error}"];
  }
  if( $httpCode !== 200 ) {
    return ['success' => false, 'error' => "HTTP error: {$httpCode}"];
  }
  if( !$html ) {
    return ['success' => false, 'error' => 'Empty response from server'];
  }

  return ['success' => true, 'html' => $html];
}

/** Extract the __NEXT_DATA__ JSON payload from HTML of Civitai model page
 * @param string $html HTML content of civitai model page
 * @return array Array with:
 * - 'success'   (bool),
 * - 'jsonData'  (string),
 * - 'decoded'   (array), and
 * - 'error'     (string) keys
 */
function extractNextData( string $html ): array {

  // Use regex to find <script id="__NEXT_DATA__" type="application/json">
  if( !preg_match(
    '/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s',
    $html,
    $matches
  ) ) {
    return [
      'success' => false,
      'error'   => 'Could not find __NEXT_DATA__ script tag in page'
    ];
  }

  // Extract and attempt to decode JSON data
  $jsonData = $matches[1];
  $decoded  = json_decode( $jsonData, true );

  // Check for JSON parsing errors
  if( json_last_error() !== JSON_ERROR_NONE ) {
    return [
      'success' => false,
      'error'   => 'Failed to parse JSON: ' . json_last_error_msg()
    ];
  }

  // Validate that expected structure exists in decoded data
  return [
    'success'   => true,
    'jsonData'  => $jsonData,
    'decoded'   => $decoded
  ];
}

/** Extract model versions from decoded __NEXT_DATA__ JSON
 * @param array $decoded Decoded JSON data from __NEXT_DATA__
 * @return array Array of model versions (or empty array)
 */
function getModelVersions( array $decoded ): array {
  return $decoded['props']['pageProps']['trpcState']['json']['queries'][2]['state']['data']['modelVersions'] ?? [];
}

/** Extract model tags from decoded __NEXT_DATA__ JSON
 * @param array $decoded Decoded JSON data from __NEXT_DATA__
 * @return array Array of model tags (or empty array)
 */
function getModelTags( array $decoded ): array {
  $modelTags    = [];
  $tagsOnModels = $decoded['props']['pageProps']['trpcState']['json']['queries'][2]['state']['data']['tagsOnModels'] ?? [];

  foreach ( $tagsOnModels as $tagEntry ) {
    if ( isset( $tagEntry['tag']['name'] ) ) {
      $modelTags[] = $tagEntry['tag']['name'];
    }
  }

  return $modelTags;
}

/** Select model version based on versionId (default to first version)
 * @param array     $modelVersions  Array of model versions
 * @param int|null  $versionId      Optional versionId to match against modelVersions
 * @return array Array with:
 * - `selectedVersion`         (array|null) and
 * - `versionSelectionMethod`  (string)
 */
function selectModelVersion( array $modelVersions, ?int $versionId ): array {
  $selectedVersion        = null;
  $versionSelectionMethod = null;

  // modelVersions not empty
  if( !empty( $modelVersions ) ) {

    // versionId provided
    if( $versionId !== null ) { 

      // Search for version with matching ID
      foreach( $modelVersions as $version ) {
        if( isset( $version['id'] ) && (int)$version['id'] === $versionId ) {
          $selectedVersion        = $version;
          $versionSelectionMethod = "Matched modelVersionId={$versionId} from URL";
          break;
        }
      }

      // No match found
      if( !$selectedVersion ) {
        $versionSelectionMethod = "modelVersionId={$versionId} not found in modelVersions array";
      }

    // No versionId provided, default to first version
    } else {
      $selectedVersion        = $modelVersions[0];
      $versionSelectionMethod = 'No modelVersionId in URL, using first version';
    }

  // modelVersions empty or not found
  } else {
    $versionSelectionMethod = 'modelVersions array is empty';
  }

  return [
    'selectedVersion'         => $selectedVersion,
    'versionSelectionMethod'  => $versionSelectionMethod
  ];
}

/** Build URL info for response
 * @param string    $modelInput Original model input string
 * @param string    $url        Constructed URL to model page
 * @param int|null  $versionId  Extracted versionId (if any)
 * @return array Array with URL info for response
 */
function buildUrlInfo( string $modelInput, string $url, ?int $versionId ): array {
  return [
    'step' => 1,
    'message'         => 'URL Construction',
    'modelInput'      => $modelInput,
    'constructedUrl'  => $url,
    'directLink'      => "<a href=\"{$url}\" target=\"_blank\">{$url}</a>",
    'versionId'       => $versionId
  ];
}

/** Build the success response array
 * @param string      $modelId                Extracted model ID
 * @param array       $urlInfo                Information about URL construction step
 * @param string      $jsonData               Raw JSON data extracted from __NEXT_DATA__
 * @param array|null  $selectedVersion        Selected model version (or null)
 * @param string|null $versionSelectionMethod Explanation of how version was selected
 * @param array       $modelTags              Array of model tags
 * @param array       $decoded                Decoded __NEXT_DATA__ as associative array
 * @return array The structured response to be returned as JSON
 */
function buildSuccessResponse(
  string  $modelId,
  array   $urlInfo,
  string  $jsonData,
  $selectedVersion,
  ?string $versionSelectionMethod,
  array   $modelTags,
  array   $decoded
): array {
  //global $debug;
  return [
    'success'   => true,
    'modelId'   => $modelId,
    'urlInfo'   => $urlInfo,
    'dataInfo'  => [
      'step'        => 2, // used by frontend to track progress
      'message'     => '__NEXT_DATA__ JSON Structure',
      'foundScript' => true,
      'jsonSize'    => strlen( $jsonData )
    ],
    'selectedVersion'         => $selectedVersion,
    'versionSelectionMethod'  => $versionSelectionMethod,
    'modelTags'               => $modelTags,
    'data'                    => $decoded,
    //'debug'                   => $debug
  ];
}

$debug = '';

$modelInput = getModelInput();

// Basic validation
if( !$modelInput ) {
  respondError( 'No model ID provided' );
}
if( !preg_match( '/\d+/', $modelInput ) ) {
  respondError( 'Invalid model ID format' );
}

// Main execution flow
try {
  $versionId  = getVersionId( $modelInput );
  $modelId    = getModelId( $modelInput );
  $url        = buildModelUrl( $modelId );

  $fetchResult = fetchModelPageHtml( $url );
  if( !$fetchResult['success'] ) {
    respondError( $fetchResult['error'] );
  }

  $nextDataResult = extractNextData( $fetchResult['html'] );
  if( !$nextDataResult['success'] ) {
    respondError( $nextDataResult['error'] );
  }

  $jsonData = $nextDataResult['jsonData'];
  $decoded  = $nextDataResult['decoded'];

  $modelVersions  = getModelVersions( $decoded );
  $modelTags      = getModelTags( $decoded );
  $selection      = selectModelVersion( $modelVersions, $versionId );
  $urlInfo        = buildUrlInfo( $modelInput, $url, $versionId );

  echo json_encode(
    buildSuccessResponse(
      $modelId,
      $urlInfo,
      $jsonData,
      $selection['selectedVersion'],
      $selection['versionSelectionMethod'],
      $modelTags,
      $decoded
    )
  );
} catch( Exception $e ) {
  echo json_encode( ['error' => 'Exception: ' . $e->getMessage()] );
}
