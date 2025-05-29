# Data Folder

This folder keeps  the source data and is the entry point for automated Excel-to-JSON conversion.

## Files

* **Ontologies\_forRepo.xlsx** - the main Excel workbook where collaborators add or update data. It must contain a sheet named **Data**.
* **Ontologies\_forRepo.json** - the live JSON file used by front-end and other code. It is regenerated automatically whenever the Excel file changes.
* **Output folder** - contains timestamped JSON backups that are relevant to this conversion process. See `output/README.md` for details.

## Automatic Conversion

A GitHub Actions workflow monitors this folder for modifications to `Ontologies_forRepo.xlsx`. Whenever changes are pushed:

1. **Trigger** - The workflow starts on a `push` event for `data/Ontologies_forRepo.xlsx` (or any `.xlsx` in this folder).
2. **Conversion** - The Python script `excel_to_json.py` in the repository root reads the sheet **Data** by default and writes to `Ontologies_forRepo.json`.
3. **Commit** - The updated JSON file is committed back into the `data/` folder, replacing the previous version.
4. **Timing** - The conversion process takes approximately 1–2 minutes. Please wait for the workflow to complete before relying on the updated JSON file.

### Manual Conversion

If you need to run the workflow on demand:

1. Go to the **Actions** tab in GitHub.
2. Select **Convert Excel to JSON**.
3. Click **Run workflow** and choose the branch.

## File Naming

* The JSON output file must be named exactly `Ontologies_forRepo.json` so that all downstream code can locate it.
* Do not rename this file manually. Always update the Excel workbook and let the workflow regenerate the JSON under the correct name.
* If you upload a new Excel file with a different base name, the converter will generate a JSON file with the same base name.


## Important Points (and Troubleshooting)

* **Correct JSON name** - The JSON output file must be named exactly `Ontologies_forRepo.json`, otherwise front-end code will not locate it.
* **Workflow failure** - Ensure the Excel workbook includes a sheet named **Data** and that it contains valid data.
* **Incorrect Excel name** - If you upload an Excel file with a different name, the converter will use that new name for the JSON file.
* **No JSON update** - Check the Actions tab for the workflow run and inspect the logs to identify errors.


