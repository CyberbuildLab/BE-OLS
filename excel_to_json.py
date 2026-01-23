# File: excel_to_json.py

import argparse
import json
import os
import sys
import pandas as pd
import numpy as np

# Column mapping: {original_name: new_name}
COLUMN_MAPPING = {
    "uri": "URI",
    "prefix_final": "Prefix",
    "title_final": "Title",
    "description_final": "Description",
    "cluster_final": "Cluster",
    "conforms_to_standards_final": "Conforms to Standard(s)",
    "primary_domain_final": "Primary Domain",
    "secondary_domain_final": "Secondary Domain",
    "reference_final": "Reference Source",
    "version_final": "Version",
    "created_final": "Created",
    "creator_final": "Creator",
    "publisher_final": "Publisher",
    "license_final": "License",
    "linked_aeco_final": "Linked-to AECO Ontologies",
    "linked_upper_final": "Linked-to Upper Ontologies",
    "linked_by_aeco_final": "linked-by AECO Ontologies",
    "serialization_final": "Has Serialization",
    "documentation_final": "Has Documentation",
    "conceptual_data_model_final": "Has Conceptual Model",
    "annotation_final": "Has Annotations",
    "annotation_coverage_percent": "Annotation Score",
    "FOOPs_final": "FOOPs Score",
    "classes_count_final": "Number of Classes",
    "data_properties_count_final": "Number of Data Properties",
    "object_properties_count_final": "Number of Object Properties",
    "score_alignment": "Alignment Score",
    "score_accessibility": "Accessibility Score",
    "score_quality": "Quality Score",
}

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

    # Filter to only the columns we want (that exist in the data)
    available_columns = [col for col in COLUMN_MAPPING.keys() if col in df.columns]
    missing_columns = [col for col in COLUMN_MAPPING.keys() if col not in df.columns]
    
    if missing_columns:
        print(f"Warning: The following columns from the mapping were not found in the data: {missing_columns}")
    
    # Select only the mapped columns
    df = df[available_columns]
    
    # Rename columns according to the mapping
    df = df.rename(columns=COLUMN_MAPPING)

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
        description="Convert an Excel sheet to JSON with column filtering and renaming."
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
