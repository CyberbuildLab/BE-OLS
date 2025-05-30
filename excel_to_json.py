# File: excel_to_json.py

import json
import pandas as pd
import numpy as np
import sys

def excel_to_json(input_path, output_path, sheet_name='Data'):
    # Read the named sheet (default: 'Data')
    df = pd.read_excel(input_path, sheet_name=sheet_name)

    # Replace all flavours of missing data with Python None
    df = df.replace({pd.NA: None, np.nan: None})

    # Convert to list of dicts
    data = df.to_dict(orient='records')

    # Write JSON (None → null)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python excel_to_json.py <input.xlsx> <output.json> [sheet_name]")
        sys.exit(1)

    input_file  = sys.argv[1]
    output_file = sys.argv[2]
    # Default sheet is 'Data'
    sheet = sys.argv[3] if len(sys.argv) > 3 else 'Data'

    excel_to_json(input_file, output_file, sheet)
