# Data Folder

This folder keeps the source data and is the entry point for automated Excel-to-JSON conversion.

## Files

* **Ontologies\_forRepo.xlsx** - the main Excel workbook where collaborators add or update data. It must contain a sheet named **Data**.
* **Ontologies\_forRepo.json** - the live JSON file used by front-end and other code. It is regenerated automatically whenever the Data sheet in Excel file changes.

## Automatic Conversion

A GitHub Actions workflow monitors this folder for modifications to `Ontologies_forRepo.xlsx`. It works automatially whenever changes are pushed:

1. **Trigger**: The workflow starts on a `push` event for `data/Ontologies_forRepo.xlsx` (or any `.xlsx` in this folder).
2. **Conversion**: The Python script `excel_to_json.py` in the main root reads the sheet **Data** by default and writes to `Ontologies_forRepo.json`.
3. **Commit**: The updated JSON file is committed back into the `data/` folder. It replaces the previous version.
4. **Time**: This process takes time. Wait 1-2 minutes.
5. **Manual Conversion**: If you go to the Actions in the top ribbon and run the workflow manually via Convert Excel to JSON.



## Important points (and troubleshooting)

* **Correct Json name** - The JSON output file must be named exactly `Ontologies_forRepo.json` so that all downstream code can locate it.
* **Workflow failure** - Ensure the Excel workbook includes a sheet named **Data** and that it contains the main data used for the ontologies.
* **Incorrect Excel name** - If the JSON filename is wrong, the front-end will not find it. If you upload a new Excel file with a different name, the converter will keep the new name for the json file.


