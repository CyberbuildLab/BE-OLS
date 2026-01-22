# File: excel_to_json.py

import argparse
import json
import os
import sys
import pandas as pd
import numpy as np

def excel_to_json(input_path, output_path, sheet_name='Data'):
    # Read the named sheet
    try:
        df = pd.read_excel(input_path, sheet_name=sheet_name)
    except ValueError as e:
        # Common when the sheet is missing
        with pd.ExcelFile(input_path) as xf:
            available = xf.sheet_names
        raise SystemExit(
            f"Sheet '{sheet_name}' not found. Available sheets: {available}"
        ) from e

    # Replace missing values with None
    df = df.replace({pd.NA: None, np.nan: None})

    # Ensure output directory exists
    out_dir = os.path.dirname(os.path.abspath(output_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    # Write JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(df.to_dict(orient='records'), f, ensure_ascii=False, indent=2)

def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert an Excel sheet to JSON."
    )

    # Flagged form
    parser.add_argument('--input', help='Path to input Excel file')
    parser.add_argument('--output', help='Path to output JSON file')
    parser.add_argument('--sheet', default='Data', help="Excel sheet name (default: 'Data')")

    # Positional fallback for backward compatibility
    parser.add_argument('positional', nargs='*',
                        help="Positional fallback: <input.xlsx> <output.json> [sheet]")

    args = parser.parse_args()

    # If flags provided, use them
    if args.input or args.output:
        if not args.input or not args.output:
            parser.error("When using flags, both --input and --output are required.")
        return args.input, args.output, args.sheet

    # Else try positional
    if len(args.positional) < 2:
        parser.error("Usage (positional): excel_to_json.py <input.xlsx> <output.json> [sheet]")
    inp = args.positional[0]
    out = args.positional[1]
    sheet = args.positional[2] if len(args.positional) > 2 else 'Data'
    return inp, out, sheet

if __name__ == '__main__':
    input_file, output_file, sheet = parse_args()

    if not os.path.exists(input_file):
        sys.exit(f"Input file not found: {input_file}")

    excel_to_json(input_file, output_file, sheet)
    print(f"Wrote JSON to {output_file}")

