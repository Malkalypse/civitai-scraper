#!/usr/bin/env python3
"""
Image Optimization Script
Resizes and compresses images to reduce file size
"""

import sys
import os
from PIL import Image

def optimize_image(input_path, output_path, max_dimension=450, quality=50):
    """
    Optimize an image by resizing and compressing
    
    Args:
        input_path: Path to input image
        output_path: Path to save optimized image
        max_dimension: Maximum width or height in pixels
        quality: JPEG quality (1-100)
    
    Returns:
        True if successful, False otherwise
    """
    try:
        # Open the image
        with Image.open(input_path) as img:
            # Get original dimensions
            width, height = img.size
            
            # Calculate new dimensions
            if width > max_dimension or height > max_dimension:
                if width > height:
                    new_width = max_dimension
                    new_height = int(height * (max_dimension / width))
                else:
                    new_height = max_dimension
                    new_width = int(width * (max_dimension / height))
            else:
                # Image is already small enough, just compress
                new_width = width
                new_height = height
            
            # Resize if needed
            if new_width != width or new_height != height:
                img = img.resize((new_width, new_height), Image.LANCZOS)
            
            # Convert RGBA to RGB if saving as JPEG
            if img.mode == 'RGBA' and output_path.lower().endswith(('.jpg', '.jpeg')):
                # Create white background
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])  # Use alpha channel as mask
                img = background
            elif img.mode not in ('RGB', 'L'):
                # Convert other modes to RGB
                img = img.convert('RGB')
            
            # Determine save parameters based on format
            save_kwargs = {}
            if output_path.lower().endswith(('.jpg', '.jpeg')):
                save_kwargs = {'quality': quality, 'optimize': True}
            elif output_path.lower().endswith('.png'):
                save_kwargs = {'optimize': True, 'compress_level': 6}
            elif output_path.lower().endswith('.webp'):
                save_kwargs = {'quality': quality, 'method': 6}
            
            # Save optimized image
            img.save(output_path, **save_kwargs)
            
            return True
            
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python optimize_image.py <input_path> <output_path> [max_dimension] [quality]", file=sys.stderr)
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    max_dimension = int(sys.argv[3]) if len(sys.argv) > 3 else 450
    quality = int(sys.argv[4]) if len(sys.argv) > 4 else 50
    
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    
    success = optimize_image(input_path, output_path, max_dimension, quality)
    
    if success:
        print("SUCCESS")
        sys.exit(0)
    else:
        print("FAILED", file=sys.stderr)
        sys.exit(1)
