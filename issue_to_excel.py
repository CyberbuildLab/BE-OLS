# File: json_to_excel.py
# Append JSON record(s) to an Excel sheet, creating file/sheet if missing.
# - Accepts a single JSON object or a list of objects.
# - Keeps existing rows, appends new ones, and removes duplicates.
# - Lets you deduplicate on specific keys if desired.
# - Preserves existing column order and adds new columns at the end.

from __future__ import annotations
import argparse
import json
import os
import sys
import warnings
from typing import Iterable, List, Dict, Optional

import pandas as pd

# Silence openpyxl data-validation warnings that do not affect I/O
warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl.worksheet._reader")


def _load_json_records(json_path: str) -> List[Dict]:
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"JSON file not found: {os.path.abspath(json_path)}")
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        if all(isinstance(x, dict) for x in data):
            return data
        raise ValueError("JSON list must contain only objects")
    raise ValueError("JSON must be an object or a list of objects")


def _read_existing_excel(excel_path: str, sheet_name: str) -> pd.DataFrame:
    if not os.path.exists(excel_path):
        # New file scenario
        return pd.DataFrame()
    try:
        xls = pd.ExcelFile(excel_path, engine="openpyxl")
    except Exception as e:
        raise RuntimeError(f"Could not open Excel file '{excel_path}': {e}") from e

    if sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name, dtype=str, keep_default_na=False)
        # Drop filler columns like "Unnamed: 0"
        df = df.loc[:, ~pd.Series(df.columns, dtype=str).str.match(r"Unnamed:", na=False)]
        return df
    else:
        # File exists but sheet does not
        return pd.DataFrame()


def _align_columns(existing: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    if existing.empty:
        # Ensure string dtype and consistent empties
        return new.astype(str).fillna("")
    # Preserve existing order, then add any new columns at the end
    existing_cols = list(existing.columns)
    new_cols = [c for c in new.columns if c not in existing_cols]
    ordered = existing_cols + new_cols
    new_aligned = new.reindex(columns=ordered)
    # Cast to string and fill blanks for consistency
    return new_aligned.astype(str).fillna("")


def append_to_excel(
    json_path: str,
    excel_path: str,
    sheet_name: str = "Data",
    dedupe_keys: Optional[Iterable[str]] = None,
) -> int:
    """Append JSON record(s) to an Excel sheet and write back.

    Returns the number of rows in the final sheet.
    """
    records = _load_json_records(json_path)
    df_new_raw = pd.DataFrame.from_records(records)

    # Ensure all values are strings to avoid mixed types, use empty string for missing
    df_new = df_new_raw.astype(str).fillna("")

    df_existing = _read_existing_excel(excel_path, sheet_name)

    # Align columns so concat behaves nicely
    df_new = _align_columns(df_existing, df_new)
    if df_existing.empty:
        df_out = df_new.copy()
    else:
        # Also align existing to the union of columns to avoid NaNs on write
        union_cols = list(df_new.columns)
        for col in df_existing.columns:
            if col not in union_cols:
                union_cols.append(col)
        df_existing = df_existing.reindex(columns=union_cols).astype(str).fillna("")
        df_out = pd.concat([df_existing, df_new], ignore_index=True)

    # Drop duplicates
    if dedupe_keys:
        missing = [k for k in dedupe_keys if k not in df_out.columns]
        if missing:
            raise ValueError(f"Deduplication keys not in columns: {missing}")
        df_out = df_out.drop_duplicates(subset=list(dedupe_keys), keep="first")
    else:
        df_out = df_out.drop_duplicates(keep="first")

    # Write back. Use replace semantics for the target sheet.
    mode = "a" if os.path.exists(excel_path) else "w"
    with pd.ExcelWriter(excel_path, engine="openpyxl", mode=mode, if_sheet_exists="replace") as writer:
        df_out.to_excel(writer, sheet_name=sheet_name, index=False)

    return len(df_out)


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Append JSON object(s) to an Excel sheet. "
                    "Creates the file or sheet if missing."
    )
    ap.add_argument("--json", help="Path to input JSON file")
    ap.add_argument("--excel", help="Path to Excel workbook")
    ap.add_argument("--sheet", default="Data", help="Worksheet name to write to")
    ap.add_argument(
        "--dedupe-keys",
        default="",
        help="Comma separated column names to deduplicate on. "
             "Default is full row duplicate removal.",
    )

    # Backwards compatible positional usage: json_to_excel.py <input.json> <output.xlsx>
    args, pos = ap.parse_known_args()
    if not args.json and len(pos) >= 1:
        args.json = pos[0]
    if not args.excel and len(pos) >= 2:
        args.excel = pos[1]

    if not args.json or not args.excel:
        ap.error("Provide --json and --excel, or use positional: json_to_excel.py <input.json> <output.xlsx>")

    if args.dedupe_keys.strip():
        args.dedupe_keys = [s.strip() for s in args.dedupe_keys.split(",") if s.strip()]
    else:
        args.dedupe_keys = None

    return args


if __name__ == "__main__":
    ns = parse_args()
    try:
        final_rows = append_to_excel(
            json_path=ns.json,
            excel_path=ns.excel,
            sheet_name=ns.sheet,
            dedupe_keys=ns.dedupe_keys,
        )
        print(f"[json_to_excel] Wrote {final_rows} rows to '{ns.excel}' sheet '{ns.sheet}'")
    except Exception as e:
        print(f"[json_to_excel] Error: {e}", file=sys.stderr)
        print(f"[json_to_excel] CWD: {os.getcwd()}", file=sys.stderr)
        try:
            print(f"[json_to_excel] Contents: {os.listdir('.')}", file=sys.stderr)
        except Exception:
            pass
        sys.exit(1)
