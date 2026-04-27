import os
import sys
from PIL import Image
import argparse

def resize_image(input_path, output_dir):
    """
    Resizes an image to 16x16, 48x48, and 128x128 pixels and saves them.

    Args:
        input_path (str): Path to the input image file.
        output_dir (str): Directory to save the resized images.
    """
    target_sizes = [(16, 16), (48, 48), (128, 128)]
    base_name, ext = os.path.splitext(os.path.basename(input_path))

    try:
        img = Image.open(input_path)
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

        for size in target_sizes:
            width, height = size
            resized_img = img.resize(size, Image.Resampling.LANCZOS) # Use LANCZOS for better quality
            output_filename = f"{base_name}_{width}{ext}"
            output_path = os.path.join(output_dir, output_filename)
            resized_img.save(output_path)
            print(f"Saved resized image to: {output_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {input_path}", file=sys.stderr)
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Resize an image to 16x16, 48x48, and 128x128 pixels.")
    parser.add_argument("input_image", help="Path to the input image file.")
    parser.add_argument("-o", "--output-dir", default=".", help="Directory to save the resized images (default: current directory).")

    args = parser.parse_args()

    resize_image(args.input_image, args.output_dir)

# How to run:
# python big_img2small.py path/to/your/image.png
# Or specify an output directory:
# python big_img2small.py path/to/your/image.png -o path/to/output/folder
