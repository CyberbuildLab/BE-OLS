# corrected after Fred's comment

# Convert the Data sheet from an Excel file to a JSON file.

from __future__ import annotations
import argparse
import json
import os
import sys
import warnings
from typing import List, Dict

import pandas as pd

# Silence openpyxl data-validation warnings that do not affect I/O
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl.worksheet._reader")


def excel_to_json(input_file: str, output_file: str, sheet_name: str = "Data") -> int:
    """
    Reads an Excel sheet and writes its contents to a JSON file (list of objects).
    
    Returns the number of records written.
    """
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input Excel file not found: {os.path.abspath(input_file)}")
        
    print(f"Reading Excel file: '{input_file}' (Sheet: '{sheet_name}')")

    # The failing line (pd.read_excel) is now protected by correct argument parsing
    try:
        # Read the Excel sheet into a DataFrame, ensuring NA values are not converted to special strings
        df = pd.read_excel(input_file, sheet_name=sheet_name, keep_default_na=False)
    except Exception as e:
        raise RuntimeError(f"Could not read Excel file/sheet: {e}") from e

    # Convert DataFrame to a list of records (JSON format)
    records: List[Dict] = df.to_dict(orient='records')
    
    # Ensure the output directory exists
    os.makedirs(os.path.dirname(output_file) or '.', exist_ok=True)

    print(f"Writing {len(records)} records to JSON file: '{output_file}'")
    with open(output_file, 'w', encoding='utf-8') as f:
        # Dump the records to the output JSON file
        json.dump(records, f, indent=4)
    
    return len(records)


def parse_args() -> argparse.Namespace:
    """Parses the command-line arguments for the Excel-to-JSON conversion."""
    ap = argparse.ArgumentParser(
        description="Convert a specific sheet from an Excel file (--input) to a JSON file (--output)."
    )
    # Define the flags matching the failing job's call
    ap.add_argument('--input', required=True, help='Path to the input Excel file.')
    ap.add_argument('--output', required=True, help='Path to the output JSON file.')
    ap.add_argument('--sheet', default='Data', help='Worksheet name to read from (default: Data).')
    
    # This correctly separates the flag name from its value
    return ap.parse_args()


if __name__ == "__main__":
    try:
        # Get the correctly parsed arguments
        args = parse_args() 
        
        final_rows = excel_to_json(
            input_file=args.input, 
            output_file=args.output, 
            sheet_name=args.sheet
        )
        print(f"[excel_to_json] Successfully converted {final_rows} rows.")
        
    except Exception as e:
        print(f"[excel_to_json] Error: {e}", file=sys.stderr)
        print(f"[excel_to_json] CWD: {os.getcwd()}", file=sys.stderr)
        sys.exit(1)
