# File: create_submission_excel.py

import json
import pandas as pd
import sys

def submission_to_excel(input_json, output_excel, sheet_name='Data'):
    # Load the form data (one record)
    with open(input_json, 'r', encoding='utf-8') as f:
        record = json.load(f)
    # Turn into a DataFrame
    df = pd.DataFrame([record])
    # Write to a new Excel file
    with pd.ExcelWriter(output_excel, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python create_submission_excel.py <input.json> <output.xlsx>")
        sys.exit(1)
    submission_to_excel(sys.argv[1], sys.argv[2])
