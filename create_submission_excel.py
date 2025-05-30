import json
import pandas as pd
import sys

# Desired column order
COLUMNS = [
    "Name",
    "Acronym",
    "Version",
    "Year published",
    "Short Description",
    "URI/Namespace",
    "Reference",
    "Linked-to ontologies AECO",
    "Linked-to ontologies UPPER",
    "Linked other professional domain ontologies"
]

def submission_to_excel(input_json, output_excel, sheet_name='Data'):
    # Load one submission from JSON
    with open(input_json, 'r', encoding='utf-8') as f:
        record = json.load(f)

    # Ensure every column exists, even if blank
    ordered = {col: record.get(col, "") for col in COLUMNS}

    df = pd.DataFrame([ordered], columns=COLUMNS)

    # Write to a new Excel file
    with pd.ExcelWriter(output_excel, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name=sheet_name, index=False)

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python create_submission_excel.py <input.json> <output.xlsx>")
        sys.exit(1)

    submission_to_excel(sys.argv[1], sys.argv[2])
