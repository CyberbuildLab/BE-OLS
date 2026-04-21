# EXPERIMENT
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

import requests

GITHUB_API = "https://api.github.com"

BUILT_ENV_TERMS = [
    # existing
    "built environment",
    "construction",
    "bim",
    "ifc",
    "buildingsmart",
    "digital twin",
    "asset management",
    "smart city",
    "infrastructure",
    "bridge",
    "road",
    "rail",
    "energy",
    "building",
    "facility",
    "real estate",
    "urban",
    "geospatial",
    "gis",
    "city",
    "product",
    "building product",
    "infrastructure product",
    "circular economy",
    "comfort",
    "cost",
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
    "planning permission",
    "production",
    "process",
    "quality",
    "resources",
    "safety",
    "weather",
    "climate"
]

ONTOLOGY_HINTS = [
    "ontology",
    "ontologies",
    "owl",
    "rdf",
    "rdfs",
    "turtle",
    "ttl",
    "knowledge graph",
]

FILE_EXT_HINTS = [".ttl", ".owl", ".rdf", ".nt", ".n3", ".jsonld"]

DEFAULT_LOOKBACK_DAYS = 7
DEFAULT_STATE_PATH = "data/state.json"
DEFAULT_OUTPUT_DIR = "data/reports"
DEFAULT_LATEST_PATH = "data/latest.md"

# GitHub code search: 10 requests/min unauthenticated, 30/min authenticated.
# We wait this many seconds between code-search calls to stay safe.
CODE_SEARCH_DELAY_SECONDS = 7


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_state(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {"seen_repo_ids": [], "last_run_utc": None}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(path: str, state: Dict[str, Any]) -> None:
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)


def github_headers() -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "be-ols-weekly-ontology-scan",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def looks_like_built_env(text: str) -> bool:
    t = (text or "").lower()
    return any(term in t for term in BUILT_ENV_TERMS)


def looks_like_ontology(text: str) -> bool:
    t = (text or "").lower()
    return any(hint in t for hint in ONTOLOGY_HINTS)


def has_ontology_files(code_items: List[Dict[str, Any]]) -> bool:
    for it in code_items:
        path = (it.get("path") or "").lower()
        if any(path.endswith(ext) for ext in FILE_EXT_HINTS):
            return True
    return False


def get_with_retry(
    url: str,
    params: Dict[str, Any] | None = None,
    timeout: int = 60,
    max_retries: int = 4,
) -> requests.Response:
    """GET with exponential backoff on 429 / 403 rate-limit responses."""
    delay = 15  # initial wait in seconds
    for attempt in range(max_retries):
        r = requests.get(url, headers=github_headers(), params=params, timeout=timeout)

        if r.status_code in (429, 403):
            # Honour Retry-After if present, otherwise use exponential backoff.
            retry_after = int(r.headers.get("Retry-After", delay))
            wait = max(retry_after, delay)
            print(f"Rate limited ({r.status_code}). Waiting {wait}s before retry {attempt + 1}/{max_retries}...")
            time.sleep(wait)
            delay *= 2
            continue

        return r

    # Final attempt — let raise_for_status surface the error.
    r = requests.get(url, headers=github_headers(), params=params, timeout=timeout)
    return r


def safe_get_json(url: str, params: Dict[str, Any] | None = None, timeout: int = 60) -> Dict[str, Any]:
    r = get_with_retry(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


def search_repositories(updated_since_date: str, per_page: int = 30, pages: int = 3) -> List[Dict[str, Any]]:
    """
    Repo search is broad. We filter aggressively afterwards.
    """
    query = f'(ontology OR OWL OR RDF OR Turtle OR SHACL) pushed:>={updated_since_date}'
    url = f"{GITHUB_API}/search/repositories"

    items: List[Dict[str, Any]] = []
    for page in range(1, pages + 1):
        data = safe_get_json(
            url,
            params={"q": query, "sort": "updated", "order": "desc", "per_page": per_page, "page": page},
        )
        items.extend(data.get("items", []))
    return items


def code_search_ontology_files(owner: str, repo: str) -> List[Dict[str, Any]]:
    """
    Code search is rate limited to ~10 req/min. We throttle between calls
    and retry on 429 with backoff.
    """
    url = f"{GITHUB_API}/search/code"
    hits: List[Dict[str, Any]] = []

    for ext in ["ttl", "owl", "rdf", "jsonld"]:
        # Throttle proactively before every code-search request.
        time.sleep(CODE_SEARCH_DELAY_SECONDS)

        q = f"repo:{owner}/{repo} extension:{ext}"
        r = get_with_retry(url, params={"q": q, "per_page": 10}, timeout=60)

        # 422 can happen if code search is temporarily restricted for the repo.
        if r.status_code == 422:
            continue

        r.raise_for_status()
        data = r.json()
        hits.extend(data.get("items", []))

    return hits


def build_report_lines(state: Dict[str, Any], findings: List[Dict[str, Any]], lookback_days: int) -> List[str]:
    lines: List[str] = []
    lines.append("# Weekly ontology scan")
    lines.append("")
    lines.append(f"- Run (UTC): {state.get('last_run_utc')}")
    lines.append(f"- Lookback days: {lookback_days}")
    lines.append("")

    if not findings:
        lines.append("No new candidates found this week.")
        lines.append("")
        return lines

    lines.append(f"Found {len(findings)} new candidate repositories:")
    lines.append("")

    for f in sorted(findings, key=lambda x: x.get("updated_at") or "", reverse=True):
        lines.append(f"## {f['full_name']}")
        lines.append(f"- URL: {f['html_url']}")
        lines.append(f"- Updated: {f['updated_at']}")
        lines.append(f"- Stars: {f.get('stars', 0)}")
        if f.get("description"):
            lines.append(f"- Description: {f['description']}")
        sample_files = f.get("ontology_files_sample") or []
        if sample_files:
            lines.append(f"- Sample ontology files: {', '.join(sample_files)}")
        lines.append("")

    return lines


def write_report_files(lines: List[str], output_dir: str, latest_path: str) -> str:
    run_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    os.makedirs(output_dir, exist_ok=True)

    dated_path = os.path.join(output_dir, f"ontology-scan_{run_date}.md")

    content = "\n".join(lines).strip() + "\n"

    with open(dated_path, "w", encoding="utf-8") as fp:
        fp.write(content)

    latest_folder = os.path.dirname(latest_path) or "."
    os.makedirs(latest_folder, exist_ok=True)
    with open(latest_path, "w", encoding="utf-8") as fp:
        fp.write(content)

    return dated_path


def main() -> int:
    lookback_days = int(os.getenv("LOOKBACK_DAYS", str(DEFAULT_LOOKBACK_DAYS)))
    state_path = os.getenv("STATE_PATH", DEFAULT_STATE_PATH)
    output_dir = os.getenv("OUTPUT_DIR", DEFAULT_OUTPUT_DIR)
    # Support both OUTPUT_PATH (workflow env var) and LATEST_PATH for backwards compat.
    latest_path = os.getenv("OUTPUT_PATH", os.getenv("LATEST_PATH", DEFAULT_LATEST_PATH))

    updated_since_date = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    state = load_state(state_path)
    seen_ids = set(state.get("seen_repo_ids", []))

    repos = search_repositories(updated_since_date)
    new_findings: List[Dict[str, Any]] = []

    for repo in repos:
        repo_id = repo.get("id")
        if repo_id in seen_ids:
            continue

        full_name = repo.get("full_name", "")
        description = repo.get("description") or ""
        combined_text = f"{full_name} {description}"

        # Fast filters to reduce noise.
        if not looks_like_ontology(combined_text):
            continue
        if not looks_like_built_env(combined_text):
            continue

        owner = repo["owner"]["login"]
        repo_name = repo["name"]

        code_hits = code_search_ontology_files(owner, repo_name)
        if not has_ontology_files(code_hits):
            continue

        new_findings.append(
            {
                "id": repo_id,
                "full_name": full_name,
                "html_url": repo.get("html_url"),
                "updated_at": repo.get("updated_at"),
                "description": description,
                "stars": repo.get("stargazers_count", 0),
                "ontology_files_sample": [h.get("path") for h in code_hits[:8] if h.get("path")],
            }
        )

        seen_ids.add(repo_id)

    state["seen_repo_ids"] = sorted(seen_ids)
    state["last_run_utc"] = utc_now_iso()
    save_state(state_path, state)

    report_lines = build_report_lines(state, new_findings, lookback_days)
    dated_path = write_report_files(report_lines, output_dir, latest_path)

    print(f"Wrote report to {dated_path} and updated {latest_path}. New findings: {len(new_findings)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
