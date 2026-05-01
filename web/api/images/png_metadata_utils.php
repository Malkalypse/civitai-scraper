<?php
/** PNG metadata parsing utilities */

class PngMetadataReader {

	/** Parses tEXt, zTXt, and iTXt chunks from a PNG binary
	 * - Returning keyword/text entries suitable for workflow and parameter extraction
	 * @param string $binary Raw PNG binary data
	 * @return array List of entries with keys: chunk, keyword, text
	 */
	public static function parseTextChunks( string $binary ): array {
		$signature = "\x89PNG\r\n\x1a\n";
		if( strlen( $binary ) < 8 || substr( $binary, 0, 8 ) !== $signature ) {
			return [];
		}

		$entries	= [];
		$offset		= 8;
		$totalLen	= strlen( $binary );

		while( $offset + 8 <= $totalLen ) {
			$lenData  = substr( $binary, $offset, 4 );
			$type     = substr( $binary, $offset + 4, 4 );
			if( strlen( $lenData ) !== 4 || strlen( $type ) !== 4 ) {
				break;
			}

			$chunkLen   = unpack('N', $lenData)[1];
			$dataStart  = $offset + 8;
			$dataEnd    = $dataStart + $chunkLen;
			$crcEnd     = $dataEnd + 4;

			if( $chunkLen < 0 || $crcEnd > $totalLen ) {
				break;
			}

			$chunkData = substr( $binary, $dataStart, $chunkLen );

			if( $type === 'tEXt' ) {
				$nullPos = strpos( $chunkData, "\0" );
				if( $nullPos !== false ) {
					$keyword  = trim( substr( $chunkData, 0, $nullPos ) );
					$text     = substr( $chunkData, $nullPos + 1 );
					if( $keyword !== '' ) {
						$entries[] = ['chunk' => 'tEXt', 'keyword' => $keyword, 'text' => $text];
					}
				}
			} elseif( $type === 'zTXt' ) {
				$nullPos = strpos( $chunkData, "\0" );
				if( $nullPos !== false && $nullPos + 2 <= strlen( $chunkData ) ) {
					$keyword						= trim( substr( $chunkData, 0, $nullPos ) );
					$compressionMethod	= ord( $chunkData[$nullPos + 1] );
					$compressedText			= substr( $chunkData, $nullPos + 2 );

					$decodedText = '';
					if( $compressionMethod === 0 ) {
						$decodedText = @gzuncompress($compressedText);
						if( $decodedText === false ) {
							$decodedText = @zlib_decode($compressedText);
						}
						if( $decodedText === false || !is_string($decodedText) ) {
							$decodedText = '';
						}
					}

					if( $keyword !== '' && $decodedText !== '' ) {
						$entries[] = ['chunk' => 'zTXt', 'keyword' => $keyword, 'text' => $decodedText];
					}
				}
			} elseif( $type === 'iTXt' ) {
				$null1 = strpos( $chunkData, "\0" );
				if( $null1 !== false && $null1 + 2 < strlen( $chunkData ) ) {
					$keyword						= trim( substr( $chunkData, 0, $null1 ) );
					$compressionFlag		= ord( $chunkData[$null1 + 1] );
					$compressionMethod	= ord( $chunkData[$null1 + 2] );

					$cursor = $null1 + 3;
					$null2 = strpos( $chunkData, "\0", $cursor );
					if( $null2 !== false ) {
						$cursor = $null2 + 1;
						$null3 = strpos( $chunkData, "\0", $cursor );
						if( $null3 !== false ) {
							$cursor = $null3 + 1;
							$textData = substr( $chunkData, $cursor );

							$text = '';
							if( $compressionFlag === 1 && $compressionMethod === 0 ) {
								$text = @gzuncompress( $textData );
								if( $text === false ) {
									$text = @zlib_decode( $textData );
								}
								if( $text === false || !is_string( $text ) ) {
									$text = '';
								}
							} else {
								$text = $textData;
							}

							if( $keyword !== '' && $text !== '' ) {
								$entries[] = ['chunk' => 'iTXt', 'keyword' => $keyword, 'text' => $text];
							}
						}
					}
				}
			}

			$offset = $crcEnd;
			if( $type === 'IEND' ) {
				break;
			}
		}

		return $entries;
	}

}
