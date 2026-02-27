from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any

import requests


GITHUB_API = "https://api.github.com"


BUILT_ENV_TERMS = [
    "built environment",
    "construction",
    "bim",
    "ifc",
    "buildingSMART",
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
]

ONTOLOGY_HINTS = [
    "ontology",
    "ontologies",
    "owl",
    "ttl",
    "turtle",
    "rdf",
    "rdfs",
    "shacl",
    "sparql",
    "knowledge graph",
]

FILE_EXT_HINTS = [
    ".ttl",
    ".owl",
    ".rdf",
    ".nt",
    ".n3",
    ".jsonld",
]

DEFAULT_LOOKBACK_DAYS = 7


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_state(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {"seen_repo_ids": [], "last_run_utc": None}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(path: str, state: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)


def github_headers() -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "built-env-ontology-finder",
    }
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def looks_like_built_env(text: str) -> bool:
    t = text.lower()
    return any(term in t for term in BUILT_ENV_TERMS)


def looks_like_ontology(text: str) -> bool:
    t = text.lower()
    return any(hint in t for hint in ONTOLOGY_HINTS)


def has_ontology_files(items: List[Dict[str, Any]]) -> bool:
    for it in items:
        path = (it.get("path") or "").lower()
        if any(path.endswith(ext) for ext in FILE_EXT_HINTS):
            return True
    return False


def search_repos(updated_since_utc: str, per_page: int = 30, pages: int = 3) -> List[Dict[str, Any]]:
    # GitHub Search query:
    # - recently updated
    # - likely ontology keywords in repo text
    # Note: GitHub search is not perfect. We filter further later.
    query = f'(ontology OR OWL OR RDF OR Turtle OR SHACL) pushed:>={updated_since_utc}'
    url = f"{GITHUB_API}/search/repositories"

    results: List[Dict[str, Any]] = []
    for page in range(1, pages + 1):
        r = requests.get(
            url,
            headers=github_headers(),
            params={"q": query, "sort": "updated", "order": "desc", "per_page": per_page, "page": page},
            timeout=60,
        )
        r.raise_for_status()
        data = r.json()
        results.extend(data.get("items", []))
    return results


def search_repo_code_for_ontology_files(owner: str, repo: str) -> List[Dict[str, Any]]:
    # Code search is rate limited. Keep it light.
    # We search for ontology file extensions.
    url = f"{GITHUB_API}/search/code"
    hits: List[Dict[str, Any]] = []

    for ext in ["ttl", "owl", "rdf", "jsonld"]:
        q = f"repo:{owner}/{repo} extension:{ext}"
        r = requests.get(url, headers=github_headers(), params={"q": q, "per_page": 10}, timeout=60)
        if r.status_code == 422:
            # sometimes code search is restricted, skip safely
            continue
        r.raise_for_status()
        data = r.json()
        hits.extend(data.get("items", []))

    return hits


def main() -> int:
    lookback_days = int(os.getenv("LOOKBACK_DAYS", str(DEFAULT_LOOKBACK_DAYS)))
    updated_since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    state_path = os.getenv("STATE_PATH", "data/state.json")
    out_path = os.getenv("OUTPUT_PATH", "data/latest.md")

    state = load_state(state_path)
    seen = set(state.get("seen_repo_ids", []))

    repos = search_repos(updated_since)
    new_findings: List[Dict[str, Any]] = []

    for repo in repos:
        repo_id = repo.get("id")
        if repo_id in seen:
            continue

        name = repo.get("full_name", "")
        desc = repo.get("description") or ""
        readme_hint = f"{name} {desc}"

        # quick filter: ontology + built environment hints
        if not looks_like_ontology(readme_hint):
            continue
        if not looks_like_built_env(readme_hint) and not looks_like_built_env(name):
            # allow some to pass, but keep it strict to reduce noise
            continue

        owner = repo["owner"]["login"]
        repo_name = repo["name"]

        code_hits = search_repo_code_for_ontology_files(owner, repo_name)
        if not has_ontology_files(code_hits):
            continue

        new_findings.append(
            {
                "id": repo_id,
                "full_name": name,
                "html_url": repo.get("html_url"),
                "updated_at": repo.get("updated_at"),
                "description": desc,
                "stars": repo.get("stargazers_count"),
                "ontology_files_sample": [h.get("path") for h in code_hits[:8] if h.get("path")],
            }
        )

    # update state
    for f in new_findings:
        seen.add(f["id"])
    state["seen_repo_ids"] = sorted(seen)
    state["last_run_utc"] = iso_now()
    save_state(state_path, state)

    # write markdown report
    lines: List[str] = []
    lines.append(f"# Weekly ontology scan")
    lines.append("")
    lines.append(f"- Run (UTC): {state['last_run_utc']}")
    lines.append(f"- Lookback days: {lookback_days}")
    lines.append("")

    if not new_findings:
        lines.append("No new candidates found this week.")
    else:
        lines.append(f"Found {len(new_findings)} new candidate repositories:")
        lines.append("")
        for f in sorted(new_findings, key=lambda x: x.get("updated_at") or "", reverse=True):
            lines.append(f"## {f['full_name']}")
            lines.append(f"- URL: {f['html_url']}")
            lines.append(f"- Updated: {f['updated_at']}")
            lines.append(f"- Stars: {f['stars']}")
            if f["description"]:
                lines.append(f"- Description: {f['description']}")
            if f["ontology_files_sample"]:
                lines.append(f"- Sample ontology files: {', '.join(f['ontology_files_sample'])}")
            lines.append("")

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fp:
        fp.write("\n".join(lines).strip() + "\n")

    print(f"Wrote report to {out_path}. New findings: {len(new_findings)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
