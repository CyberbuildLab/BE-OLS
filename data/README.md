# Data Folder

This folder keeps  the source data and is the entry point for automated Excel-to-JSON conversion.

## Files and Folders

* **`submissions` folder** - the ontologies submitted by users to be added to the BE-OLS are first recorded here.

* **`source` folder** - the ontologies submitted by users to be added to the BE-OLS are first recorded here. This contains:
  * **`Ontologies.xlsx`** - the main Excel workbook where collaborators enter core information for all ontologies in the database as well as manual information for ontology without URI.
  * **`Ontology_characterisation.jpynb`** - the Jupyter Notebook used to process `Ontologies.xlsx` to generate `Ontologies\_forRepo.xlsx` in the parent folder. This must be run manually, locally on your computer.

* **`Ontologies\_forRepo.xlsx`** - the main Excel workbook containing the data used by front-end and other code. It must contain a sheet named **Data**.

* **`Ontologies\_forRepo.json`** - the live JSON file used by front-end and other code. It is regenerated automatically whenever the corresponding Excel file changes.

* **`..\output` folder** - contains timestamped JSON backups that are relevant to this conversion process. See `output/README.md` for details.

* **`Network Graph` folder** - depricated; to be removed eventually.

## Incremental Processing of `ontologies_source.xlsx`

Running `ontology_characterisation_v31.ipynb` used to reprocess every ontology from scratch on every run — re-parsing every TTL file and re-querying the external FOOPs API for all of them, even when only one or two rows had actually changed. The notebook now caches the expensive per-ontology work (TTL parsing and FOOPs scoring) in `data/source/.characterisation_cache.json`, keyed by content hashes:

* An ontology's TTL-derived data (title, description, references, class/property counts, annotation coverage) is only re-extracted if either the spreadsheet row's own fields **or** the TTL file's content have changed since the last run.
* An ontology's FOOPs score is only re-queried if its URI has changed since the last successful score.
* The corpus-wide cross-referencing (which ontologies link to/are linked by which) still recomputes fresh over the **full** ontology list on every run — that step is cheap and inherently needs to see every ontology (an unrelated edit elsewhere in the sheet can still change who links to whom).

The cache file is local-only (gitignored) and safe to delete at any time — the next run will simply rebuild it from scratch. Each run cell also exposes a force flag (`FORCE_REPROCESS_ALL` / `FORCE_REFRESH_FOOPS`) to bypass the cache entirely, e.g. after changing the extraction logic in the notebook.

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
* If you upload a new Excel file with a different base name, the converter will generate a JSON file with the same base name (this needs updated so that only the `Ontologies_forRepo.xlsx` is processed).


## Important Points (and Troubleshooting)

* **Correct JSON name** - The JSON output file must be named exactly `Ontologies_forRepo.json`, otherwise front-end code will not locate it.
* **Workflow failure** - Ensure the Excel workbook includes a sheet named **Data** and that it contains valid data.
* **Incorrect Excel name** - If you upload an Excel file with a different name, the converter will use that new name for the JSON file.
* **No JSON update** - Check the Actions tab for the workflow run and inspect the logs to identify errors.


