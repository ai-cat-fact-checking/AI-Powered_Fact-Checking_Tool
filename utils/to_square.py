import os
import sys
from PIL import Image
import argparse

def crop_to_square(input_path, output_path):
    """
    Crops an image to a square by removing equal amounts from the longer dimension.

    Args:
        input_path (str): Path to the input image file.
        output_path (str): Path to save the cropped square image.
    """
    try:
        img = Image.open(input_path)
        width, height = img.size

        if width == height:
            print(f"Image is already square: {input_path}")
            img.save(output_path) # Save a copy anyway
            print(f"Saved square image to: {output_path}")
            return

        # Determine the shorter side
        min_dim = min(width, height)

        # Calculate coordinates for cropping
        if width > height:
            # Crop left and right sides
            left = (width - height) / 2
            right = width - left
            top = 0
            bottom = height
            box = (left, top, right, bottom)
        else: # height > width
            # Crop top and bottom sides
            top = (height - width) / 2
            bottom = height - top
            left = 0
            right = width
            box = (left, top, right, bottom)

        # Crop the image
        cropped_img = img.crop(box)
        cropped_img.save(output_path)
        print(f"Saved square image to: {output_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {input_path}", file=sys.stderr)
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crop an image into a square by trimming the longer dimension.")
    parser.add_argument("input_image", help="Path to the input image file.")
    parser.add_argument("-o", "--output", help="Path for the output square image. If not provided, saves as '<input_name>_square.<ext>' in the same directory.")

    args = parser.parse_args()

    output_file_path = args.output
    if not output_file_path:
        input_dir = os.path.dirname(args.input_image)
        base_name, ext = os.path.splitext(os.path.basename(args.input_image))
        output_file_path = os.path.join(input_dir, f"{base_name}_square{ext}")

    crop_to_square(args.input_image, output_file_path)

# How to run:
# python to_square.py path/to/your/image.png
# Or specify an output file:
# python to_square.py path/to/your/image.png -o path/to/output/square_image.png
