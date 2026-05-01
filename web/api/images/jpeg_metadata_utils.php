<?php

class JpegMetadataReader {

	/** Decode EXIF UserComment payloads that may be tagged as ASCII or UTF-16.
	 * @param string $raw Raw EXIF UserComment bytes
	 * @return string Decoded comment text, or empty string when unavailable
	 */
	public static function decodeExifUserComment( string $raw ): string {
		if( $raw === '' ) {
			return '';
		}

		if( strpos( $raw, "ASCII\0\0\0" ) === 0 ) {
			return trim( substr( $raw, 8 ), "\0 \t\r\n" );
		}

		if( strpos( $raw, "UNICODE\0" ) === 0 ) {
			$text = substr( $raw, 8 );
			if( $text === '' ) {
				return '';
			}

			if( substr( $text, 0, 2 ) === "\xFF\xFE" && function_exists( 'iconv' ) ) {
				$decoded = @iconv( 'UTF-16LE', 'UTF-8//IGNORE', substr( $text, 2 ) );
				return is_string( $decoded ) ? trim( $decoded ) : '';
			}

			if( substr( $text, 0, 2 ) === "\xFE\xFF" && function_exists( 'iconv' ) ) {
				$decoded = @iconv( 'UTF-16BE', 'UTF-8//IGNORE', substr( $text, 2 ) );
				return is_string( $decoded ) ? trim( $decoded ) : '';
			}

			if( function_exists( 'iconv' ) ) {
				$decodedLe = @iconv( 'UTF-16LE', 'UTF-8//IGNORE', $text );
				if( is_string( $decodedLe ) && trim( $decodedLe ) !== '' ) {
					return trim( $decodedLe );
				}
				$decodedBe = @iconv( 'UTF-16BE', 'UTF-8//IGNORE', $text );
				if( is_string( $decodedBe ) && trim( $decodedBe ) !== '' ) {
					return trim( $decodedBe );
				}
			}

			return trim( $text, "\0 \t\r\n" );
		}

		return trim( $raw, "\0 \t\r\n" );
	}

	/** Extract JPEG COM and APP1 segment payloads from a JPEG binary blob
	 * @param string $binary JPEG bytes
	 * @return array{comments: array, app1: array} Extracted segment payloads
	 */
	public static function extractSegments( string $binary ): array {
		$comments = [];
		$app1     = [];

		if( strlen( $binary ) < 4 || substr( $binary, 0, 2 ) !== "\xFF\xD8" ) {
			return ['comments' => $comments, 'app1' => $app1];
		}

		$len    = strlen( $binary );
		$offset = 2;

		while( $offset + 4 <= $len ) {
			if( ord( $binary[ $offset ] ) !== 0xFF ) {
				break;
			}

			while( $offset < $len && ord( $binary[ $offset ] ) === 0xFF ) {
				$offset++;
			}

			if( $offset >= $len ) {
				break;
			}

			$marker = ord( $binary[$offset] );
			$offset++;

			if( $marker === 0xDA || $marker === 0xD9 ) {
				break;
			}

			if( $offset + 2 > $len ) {
				break;
			}

			$segmentLength = unpack( 'n', substr( $binary, $offset, 2 ) )[1];
			if( $segmentLength < 2 || $offset + $segmentLength > $len ) {
				break;
			}

			$payload = substr( $binary, $offset + 2, $segmentLength - 2 );

			if( $marker === 0xFE ) {
				$comments[] = $payload;
			} elseif( $marker === 0xE1 ) {
				$app1[] = $payload;
			}

			$offset += $segmentLength;
		}

		return ['comments' => $comments, 'app1' => $app1];
	}

	/** Parse likely workflow/parameter-bearing metadata entries from JPEG bytes.
	 * @param string $binary JPEG bytes
	 * @return array<int, array{chunk: string, keyword: string, text: string}> Metadata entries
	 */
	public static function parseMetadataEntries( string $binary ): array {
	$entries = [];

	$segments = self::extractSegments( $binary );
	foreach( $segments['comments'] as $comment ) {
		$text = trim( ( string )$comment, "\0 \t\r\n" );
		if( $text !== '' ) {
			$entries[] = ['chunk' => 'JPEG_COM', 'keyword' => 'comment', 'text' => $text];
		}
	}

	foreach( $segments['app1'] as $app1Payload ) {
		if( strpos( $app1Payload, "http://ns.adobe.com/xap/1.0/\0" ) === 0 ) {
			$xmpText = substr( $app1Payload, strlen( "http://ns.adobe.com/xap/1.0/\0" ) );
			$xmpText = trim( ( string )$xmpText, "\0 \t\r\n" );
			if( $xmpText !== '' ) {
				$entries[] = ['chunk' => 'JPEG_APP1', 'keyword' => 'xmp', 'text' => $xmpText];
			}
		}
	}

	if( function_exists( 'exif_read_data' ) ) {
		$tempFile = @tempnam( sys_get_temp_dir(), 'wf_' );
		if( is_string( $tempFile ) && $tempFile !== '' ) {
			$writeOk = @file_put_contents( $tempFile, $binary );
			if( $writeOk !== false ) {
				$exif = @exif_read_data( $tempFile, null, true, false );

				if( is_array( $exif ) ) {
					$rawUserComment = '';

					if( isset( $exif['EXIF']['UserComment'] ) ) {
						$rawValue = $exif['EXIF']['UserComment'];
						if( is_array( $rawValue ) ) {
							$rawUserComment = ( string )reset( $rawValue );
						} else {
							$rawUserComment = ( string )$rawValue;
						}
					} elseif( isset( $exif['COMMENT'] ) ) {
						$commentValue = $exif['COMMENT'];
						if( is_array( $commentValue ) ) {
							foreach( $commentValue as $value ) {
								$text = trim( ( string )$value );
								if( $text !== '' ) {
									$entries[] = ['chunk' => 'JPEG_EXIF', 'keyword' => 'comment', 'text' => $text];
								}
							}
						} elseif( is_string( $commentValue ) && trim( $commentValue ) !== '' ) {
							$entries[] = ['chunk' => 'JPEG_EXIF', 'keyword' => 'comment', 'text' => trim( $commentValue )];
						}
					}

					$decodedUserComment = self::decodeExifUserComment( $rawUserComment );
					if( $decodedUserComment !== '' ) {
						$entries[] = ['chunk' => 'JPEG_EXIF', 'keyword' => 'workflow', 'text' => $decodedUserComment];
					}
				}
			}

			@unlink( $tempFile );
		}
	}

	return $entries;
	}
}
