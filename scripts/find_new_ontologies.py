from pathlib import Path
import py_compile

code = r'''# A script for automatically searching every week for updated repositories
# related to the built environment and containing ontology files.

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import requests

GITHUB_API = "https://api.github.com"

BUILT_ENV_TERMS = [
    "built environment*",
    "construction",
    "bim",
    "building information model*",
    "industry foundation classes",
    "ifc",
    "buildingsmart",
    "digital twin*",
    "asset management",
    "smart cit*",
    "infrastructure",
    "bridge*",
    "road*",
    "rail*",
    "energy",
    "building*",
    "facilit*",
    "real estate",
    "urban",
    "geospatial",
    "gis",
    "city",
    "cities",
    "product*",
    "building product*",
    "infrastructure product",
    "circular economy",
    "comfort",
    "cost",
    "carbon emission*",
    "facilities management",
    "facility management",
    "fire safety",
    "information management",
    "geographic information",
    "geometry",
    "iot",
    "iot sensors",
    "actuators",
    "materials",
    "mobility",
    "transport",
    "transportation",
    "planning",
    "production",
    "process*",
    "quality",
    "resource*",
    "safety",
    "weather",
    "climate",
    "architecture",
    "demolition",
    "maintenance",
    "retrofit*",
    "renovation*",
    "digital design",
    "esg",
    "airport*",
    "tunnel*",
    "life cycle assessment*",
    "lca*",
    "carbon footprint*",
    "urban development*",
    "sustainable construction",
    "construction management",
    "civil engineering*",
    "concrete",
    "steel",
    "wood",
    "building automation",
    "smart building*",

    # Additional terms for common ontology repository names.
    "bot",
    "ifcowl",
    "seas",
    "brick",
    "dogont",
    "saref",
    "props",
    "lbd",
    "linked building",
    "linked data",
    "linked building data",
    "building topology",
    "building energy",
]

ONTOLOGY_HINTS = [
    "ontology",
    "ontologies",
    "owl",
    "rdf",
    "rdfs",
    "turtle",
    "ttl",
    "knowledge graph*",
    "sparql",
    "shacl",
    "skos",
    "linked data",
    "semantic web",
    "w3c",
]

FILE_EXT_HINTS = [".ttl", ".owl", ".rdf", ".nt", ".n3", ".jsonld"]

DEFAULT_LOOKBACK_DAYS = 30
DEFAULT_STATE_PATH = "data/state.json"
DEFAULT_OUTPUT_DIR = "data/reports"
DEFAULT_LATEST_PATH = "data/latest.md"
DEFAULT_LOGBOOK_PATH = "data/logbook.md"

SEARCH_PAGE_DELAY_SECONDS = 2
SECONDARY_RATE_LIMIT_WAIT_SECONDS = 60
CODE_SEARCH_DELAY_SECONDS = 7


def utc_now_iso() -> str:
    """Return the current UTC date and time in ISO 8601 format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_state(path: str) -> Dict[str, Any]:
    """Load the scan state or return an empty initial state."""
    if not os.path.exists(path):
        return {"seen_repo_ids": [], "last_run_utc": None}

    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def save_state(path: str, state: Dict[str, Any]) -> None:
    """Save the scan state."""
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, exist_ok=True)

    with open(path, "w", encoding="utf-8") as file:
        json.dump(state, file, indent=2, sort_keys=True)


def github_headers() -> Dict[str, str]:
    """Build GitHub API request headers."""
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "be-ols-weekly-ontology-scan",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    return headers


def contains_term(text: str, terms: List[str]) -> bool:
    """
    Check whether text contains any configured term.

    A trailing asterisk is treated as a simple prefix wildcard.
    For example, "building*" matches "building" and "buildings".
    """
    normalised_text = (text or "").lower()

    for term in terms:
        normalised_term = term.lower().strip()

        if normalised_term.endswith("*"):
            normalised_term = normalised_term[:-1]

        if normalised_term and normalised_term in normalised_text:
            return True

    return False


def looks_like_built_env(text: str) -> bool:
    """Check whether repository metadata appears related to the built environment."""
    return contains_term(text, BUILT_ENV_TERMS)


def looks_like_ontology(text: str) -> bool:
    """Check whether repository metadata appears related to ontologies."""
    return contains_term(text, ONTOLOGY_HINTS)


def has_ontology_files(code_items: List[Dict[str, Any]]) -> bool:
    """Check whether GitHub code-search results contain ontology files."""
    for item in code_items:
        path = (item.get("path") or "").lower()
        if any(path.endswith(extension) for extension in FILE_EXT_HINTS):
            return True

    return False


def get_with_retry(
    url: str,
    params: Dict[str, Any] | None = None,
    timeout: int = 60,
    max_retries: int = 4,
) -> requests.Response:
    """Send a GET request with exponential backoff for rate-limit responses."""
    delay = 15

    for attempt in range(max_retries):
        response = requests.get(
            url,
            headers=github_headers(),
            params=params,
            timeout=timeout,
        )

        if response.status_code not in (403, 429):
            return response

        body_text = (response.text or "").lower()
        is_secondary = (
            "secondary rate limit" in body_text
            or "abuse" in body_text
        )

        retry_after_header = response.headers.get("Retry-After", "")
        try:
            retry_after = int(retry_after_header)
        except ValueError:
            retry_after = delay

        wait = max(retry_after, delay)

        if is_secondary:
            wait = max(wait, SECONDARY_RATE_LIMIT_WAIT_SECONDS)

        print(
            f"Rate limited ({response.status_code}"
            f"{', secondary' if is_secondary else ''}). "
            f"Waiting {wait} seconds before retry "
            f"{attempt + 1}/{max_retries}."
        )

        time.sleep(wait)
        delay *= 2

    return requests.get(
        url,
        headers=github_headers(),
        params=params,
        timeout=timeout,
    )


def safe_get_json(
    url: str,
    params: Dict[str, Any] | None = None,
    timeout: int = 60,
) -> Dict[str, Any]:
    """Request JSON data and raise an exception for HTTP errors."""
    response = get_with_retry(url, params=params, timeout=timeout)
    response.raise_for_status()
    return response.json()


def search_repositories(
    updated_since_date: str,
    per_page: int = 30,
    pages: int = 5,
) -> List[Dict[str, Any]]:
    """Search up to five pages, or 150 recently updated repositories."""
    query = (
        f"(ontology OR OWL OR RDF OR Turtle OR SHACL) "
        f"pushed:>={updated_since_date}"
    )
    url = f"{GITHUB_API}/search/repositories"
    items: List[Dict[str, Any]] = []

    for page in range(1, pages + 1):
        data = safe_get_json(
            url,
            params={
                "q": query,
                "sort": "updated",
                "order": "desc",
                "per_page": per_page,
                "page": page,
            },
        )

        page_items = data.get("items", [])
        items.extend(page_items)

        if len(page_items) < per_page:
            break

        if page < pages:
            time.sleep(SEARCH_PAGE_DELAY_SECONDS)

    return items


def code_search_ontology_files(
    owner: str,
    repo: str,
) -> List[Dict[str, Any]]:
    """Search a repository for files using ontology-related extensions."""
    url = f"{GITHUB_API}/search/code"
    hits: List[Dict[str, Any]] = []

    for extension in FILE_EXT_HINTS:
        time.sleep(CODE_SEARCH_DELAY_SECONDS)

        extension_without_dot = extension.lstrip(".")
        query = f"repo:{owner}/{repo} extension:{extension_without_dot}"

        response = get_with_retry(
            url,
            params={"q": query, "per_page": 10},
            timeout=60,
        )

        if response.status_code == 422:
            continue

        response.raise_for_status()
        data = response.json()
        hits.extend(data.get("items", []))

    return hits


def build_report_lines(
    state: Dict[str, Any],
    findings: List[Dict[str, Any]],
    lookback_days: int,
) -> List[str]:
    """Build the Markdown report."""
    lines: List[str] = [
        "# Weekly ontology scan",
        "",
        f"- Run (UTC): {state.get('last_run_utc')}",
        f"- Lookback days: {lookback_days}",
        "",
    ]

    if not findings:
        lines.extend([
            "No new candidates found this week.",
            "",
        ])
        return lines

    lines.extend([
        f"Found {len(findings)} new candidate repositories:",
        "",
    ])

    sorted_findings = sorted(
        findings,
        key=lambda item: item.get("updated_at") or "",
        reverse=True,
    )

    for finding in sorted_findings:
        lines.append(f"## {finding['full_name']}")
        lines.append(f"- URL: {finding['html_url']}")
        lines.append(f"- Updated: {finding['updated_at']}")
        lines.append(f"- Stars: {finding.get('stars', 0)}")

        if finding.get("description"):
            lines.append(f"- Description: {finding['description']}")

        if finding.get("topics"):
            lines.append(f"- Topics: {finding['topics']}")

        sample_files = finding.get("ontology_files_sample") or []
        if sample_files:
            lines.append(
                f"- Sample ontology files: {', '.join(sample_files)}"
            )

        lines.append("")

    return lines


def write_report_files(
    lines: List[str],
    output_dir: str,
    latest_path: str,
) -> str:
    """
    Write a timestamped report and replace latest.md with the newest report.

    Timestamped filenames prevent a second run on the same day from
    overwriting the earlier report.
    """
    run_timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")

    os.makedirs(output_dir, exist_ok=True)

    dated_path = os.path.join(
        output_dir,
        f"ontology-scan_{run_timestamp}.md",
    )

    content = "\n".join(lines).strip() + "\n"

    with open(dated_path, "w", encoding="utf-8") as file:
        file.write(content)

    latest_folder = os.path.dirname(latest_path) or "."
    os.makedirs(latest_folder, exist_ok=True)

    with open(latest_path, "w", encoding="utf-8") as file:
        file.write(content)

    return dated_path


def append_to_logbook(
    lines: List[str],
    logbook_path: str,
) -> None:
    """
    Add the newest report to the top of the cumulative logbook.

    Unlike latest.md, logbook.md retains all previous scan reports.
    """
    entry = "\n".join(lines).strip() + "\n"
    folder = os.path.dirname(logbook_path) or "."
    os.makedirs(folder, exist_ok=True)

    header = "# Ontology scan logbook\n\nMost recent run first.\n\n"
    previous = ""

    if os.path.exists(logbook_path):
        with open(logbook_path, "r", encoding="utf-8") as file:
            previous = file.read()

        if previous.startswith(header):
            previous = previous[len(header):]

    separator = "\n---\n\n"

    if previous.strip():
        combined = header + entry + separator + previous.lstrip("\n")
    else:
        combined = header + entry

    with open(logbook_path, "w", encoding="utf-8") as file:
        file.write(combined.strip() + "\n")


def main() -> int:
    """Run the weekly ontology repository scan."""
    lookback_days = int(
        os.getenv("LOOKBACK_DAYS", str(DEFAULT_LOOKBACK_DAYS))
    )
    state_path = os.getenv("STATE_PATH", DEFAULT_STATE_PATH)
    output_dir = os.getenv("OUTPUT_DIR", DEFAULT_OUTPUT_DIR)
    latest_path = os.getenv(
        "OUTPUT_PATH",
        os.getenv("LATEST_PATH", DEFAULT_LATEST_PATH),
    )
    logbook_path = os.getenv("LOGBOOK_PATH", DEFAULT_LOGBOOK_PATH)

    updated_since_date = (
        datetime.now(timezone.utc) - timedelta(days=lookback_days)
    ).strftime("%Y-%m-%d")

    state = load_state(state_path)
    seen_ids = set(state.get("seen_repo_ids", []))

    repositories = search_repositories(updated_since_date)
    new_findings: List[Dict[str, Any]] = []

    for repository in repositories:
        repo_id = repository.get("id")

        if repo_id is None or repo_id in seen_ids:
            continue

        full_name = repository.get("full_name", "")
        description = repository.get("description") or ""
        topics_list = repository.get("topics") or []
        topics_text = " ".join(topics_list)
        combined_text = f"{full_name} {description} {topics_text}"

        if (
            not looks_like_ontology(combined_text)
            and not looks_like_built_env(combined_text)
        ):
            continue

        owner = repository["owner"]["login"]
        repo_name = repository["name"]

        try:
            code_hits = code_search_ontology_files(owner, repo_name)
        except requests.exceptions.RequestException as exception:
            print(
                f"Skipping {full_name}: code search failed "
                f"({exception})."
            )
            continue

        if not has_ontology_files(code_hits):
            continue

        new_findings.append(
            {
                "id": repo_id,
                "full_name": full_name,
                "html_url": repository.get("html_url"),
                "updated_at": repository.get("updated_at"),
                "description": description,
                "topics": topics_text,
                "stars": repository.get("stargazers_count", 0),
                "ontology_files_sample": [
                    hit.get("path")
                    for hit in code_hits[:8]
                    if hit.get("path")
                ],
            }
        )

        seen_ids.add(repo_id)

    state["seen_repo_ids"] = sorted(seen_ids)
    state["last_run_utc"] = utc_now_iso()
    save_state(state_path, state)

    report_lines = build_report_lines(
        state,
        new_findings,
        lookback_days,
    )
    dated_path = write_report_files(
        report_lines,
        output_dir,
        latest_path,
    )
    append_to_logbook(report_lines, logbook_path)

    print(
        f"Wrote report to {dated_path}, updated {latest_path}, "
        f"and appended to {logbook_path}. "
        f"New findings: {len(new_findings)}"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
'''

output_path = Path("/mnt/data/weekly_ontology_scan.py")
output_path.write_text(code, encoding="utf-8", newline="\n")

# Validate that the generated file is syntactically correct.
py_compile.compile(str(output_path), doraise=True)

print(f"Created and syntax-checked: {output_path}")
