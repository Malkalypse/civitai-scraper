<?php
/**
 * One-time CLI script: resize all oversized cached thumbnails in web/cache/images/.
 *
 * Uses the same GD logic as AbstractImageCacheHandler::saveResized().
 * Skips files whose largest side is already within $maxSide.
 * Overwrites each file in-place.
 *
 * Usage:
 *   php temp/scripts/resize_cache_images.php
 *   php temp/scripts/resize_cache_images.php --dry-run
 */

const MAX_SIDE  = 450;
const QUALITY   = 75;       // JPEG / WebP quality
const PNG_LEVEL = 6;        // zlib compression level for PNG

$dryRun = in_array( '--dry-run', $argv ?? [], true );

ini_set( 'memory_limit', '2G' );
ini_set( 'max_execution_time', '0' );

$cacheDir = __DIR__ . '/../../web/cache/images';

if( !is_dir( $cacheDir ) ) {
	fwrite( STDERR, "Cache directory not found: $cacheDir\n" );
	exit( 1 );
}

$files = new RecursiveIteratorIterator(
	new RecursiveDirectoryIterator( $cacheDir, FilesystemIterator::SKIP_DOTS )
);

$checked   = 0;
$oversized = 0;
$resized   = 0;
$failed    = 0;
$skipped   = 0;

$imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

foreach( $files as $file ) {
	if( !$file->isFile() ) {
		continue;
	}

	$path = $file->getPathname();
	$ext  = strtolower( $file->getExtension() );

	if( !in_array( $ext, $imageExts, true ) ) {
		continue;
	}

	$checked++;

	$size = @getimagesize( $path );
	if( !is_array( $size ) || !isset( $size[0], $size[1] ) ) {
		// Not a valid image — skip without counting as a failure
		$skipped++;
		continue;
	}

	$srcW = (int)$size[0];
	$srcH = (int)$size[1];

	if( max( $srcW, $srcH ) <= MAX_SIDE ) {
		continue;
	}

	$oversized++;

	if( $dryRun ) {
		continue;   // just count; don't print per-file lines
	}

	// Images needing >1.5 GB uncompressed (src + dst RGBA buffers) — delete and re-fetch.
	$estimatedBytes = $srcW * $srcH * 4 * 2;
	if( $estimatedBytes > 1_500_000_000 ) {
		@unlink( $path );
		fwrite( STDERR, "Deleted ({$ext} {$srcW}x{$srcH}): $path\n" );
		$resized++;   // counts as "handled"
		continue;
	}

	$imageData = @file_get_contents( $path );
	if( $imageData === false || $imageData === '' ) {
		fwrite( STDERR, "Read failed: $path\n" );
		$failed++;
		continue;
	}

	// Detect WebP by magic bytes regardless of file extension:
	// RIFF????WEBP (bytes 0-3 = 'RIFF', bytes 8-11 = 'WEBP')
	// gd-webp throws an uncatchable E_ERROR — delete and let the site re-fetch.
	$header = substr( $imageData, 0, 12 );
	if( strlen( $header ) >= 12
		&& substr( $header, 0, 4 ) === 'RIFF'
		&& substr( $header, 8, 4 ) === 'WEBP'
	) {
		unset( $imageData );
		@unlink( $path );
		fwrite( STDERR, "Deleted (WebP content in .{$ext}): $path\n" );
		$resized++;
		continue;
	}

	try {
		$source = @imagecreatefromstring( $imageData );
	} catch ( \Throwable $e ) {
		unset( $imageData );
		@unlink( $path );
		fwrite( STDERR, "GD exception ({$e->getMessage()}), deleted: $path\n" );
		$resized++;
		continue;
	}
	unset( $imageData );   // free raw bytes before resampling

	if( !$source ) {
		fwrite( STDERR, "GD decode failed: $path\n" );
		$failed++;
		continue;
	}

	// Re-read actual dimensions from GD (authoritative)
	$srcW = imagesx( $source );
	$srcH = imagesy( $source );

	$scale  = (float)MAX_SIDE / (float)max( $srcW, $srcH );
	$tgtW   = max( 1, (int)round( $srcW * $scale ) );
	$tgtH   = max( 1, (int)round( $srcH * $scale ) );
	$target = imagecreatetruecolor( $tgtW, $tgtH );

	if( !$target ) {
		imagedestroy( $source );
		fwrite( STDERR, "GD create failed: $path\n" );
		$failed++;
		continue;
	}

	if( $ext === 'png' ) {
		imagealphablending( $target, false );
		imagesavealpha( $target, true );
	}

	$ok = imagecopyresampled( $target, $source, 0, 0, 0, 0, $tgtW, $tgtH, $srcW, $srcH );
	imagedestroy( $source );

	if( !$ok ) {
		imagedestroy( $target );
		fwrite( STDERR, "Resample failed: $path\n" );
		$failed++;
		continue;
	}

	if( $ext === 'png' ) {
		$saved = imagepng( $target, $path, PNG_LEVEL );
	} elseif( $ext === 'webp' && function_exists( 'imagewebp' ) ) {
		$saved = imagewebp( $target, $path, QUALITY );
	} elseif( $ext === 'gif' ) {
		$saved = imagegif( $target, $path );
	} else {
		$saved = imagejpeg( $target, $path, QUALITY );
	}

	imagedestroy( $target );

	if( $saved ) {
		$resized++;
		if( $resized % 1000 === 0 ) {
			echo "  ... resized $resized so far (checked $checked, failed $failed)\n";
			flush();
		}
	} else {
		fwrite( STDERR, "Save failed: $path\n" );
		$failed++;
	}
}

echo "\nDone.\n";
echo "  Checked:   $checked\n";
echo "  Oversized: $oversized\n";

if( $dryRun ) {
	echo "  (dry-run — no files modified)\n";
} else {
	echo "  Resized:   $resized\n";
	echo "  Failed:    $failed\n";
	echo "  Skipped:   $skipped  (unreadable / non-image)\n";
}
