# Builds a small, search-friendly index of each ontology's TTL vocabulary
# (class/property names + their descriptions), so the ontology card search
# box can match on the ontology's own content, not just its listed metadata.
#
# Reads data/Ontologies_forRepo.json for the current prefix/version list,
# parses each ontology's TTL file (if present) with rdflib, and writes:
#   - data/Ontologies_TTL_SearchIndex.json   (always current)
#   - output/Ontologies_TTL_SearchIndex_<UTC timestamp>.json  (dated copy,
#     so past versions of the index can always be looked back at)

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from rdflib import Graph, RDF
from rdflib.namespace import OWL, RDFS

# A handful of TTL files (e.g. th-building.ttl) contain deeply nested
# collections that exceed Python's default recursion limit while rdflib
# stringifies them.
sys.setrecursionlimit(10000)

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MAIN_JSON = REPO_ROOT / "data" / "Ontologies_forRepo.json"
DEFAULT_TTL_FOLDER = REPO_ROOT / "data" / "source" / "Ontologies_TTL"
DEFAULT_OUTPUT_JSON = REPO_ROOT / "data" / "Ontologies_TTL_SearchIndex.json"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "output"

# Elements whose local names + rdfs:label/rdfs:comment text are worth indexing.
INDEXABLE_TYPES = [OWL.Class, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty, OWL.NamedIndividual]

_SPLIT_LOCAL_NAME = re.compile(r"[#/]")


def local_name(uri: str) -> str:
    """Last path/fragment segment of a URI, e.g. '.../bot#Space' -> 'Space'."""
    parts = _SPLIT_LOCAL_NAME.split(uri.rstrip("#/"))
    return parts[-1] if parts else uri


def own_namespaces(graph: Graph) -> set:
    """Same approach used by calculate_annotation_coverage() in the notebook:
    the ontology's own declared URI (as base) plus any default (blank) prefix."""
    namespaces = set()
    for s in graph.subjects(RDF.type, OWL.Ontology):
        uri = str(s)
        if uri.startswith("http://") or uri.startswith("https://"):
            base = uri.rsplit("#", 1)[0] + "#" if "#" in uri else uri.rsplit("/", 1)[0] + "/"
            namespaces.add(base)
    for prefix, ns in graph.namespaces():
        if prefix in ("", None):
            namespaces.add(str(ns))
    return namespaces


def indexable_subjects(graph: Graph):
    for rdf_type in INDEXABLE_TYPES:
        yield from graph.subjects(RDF.type, rdf_type)


def most_common_namespace(graph: Graph):
    """Fallback for ontologies whose declared owl:Ontology URI doesn't match
    where their terms actually live (e.g. a versioned ontology IRI vs. an
    unversioned term namespace, as with Brick) -- use whichever namespace
    the indexable subjects themselves mostly share."""
    counts = {}
    for subject in indexable_subjects(graph):
        uri = str(subject)
        tail = local_name(uri)
        ns = uri[: -len(tail)] if tail and uri.endswith(tail) else None
        if ns:
            counts[ns] = counts.get(ns, 0) + 1
    if not counts:
        return None
    return max(counts, key=counts.get)


def collect_terms(graph: Graph, namespaces) -> set:
    def is_own(uri) -> bool:
        uri_str = str(uri)
        return any(uri_str.startswith(ns) for ns in namespaces)

    terms = set()
    for subject in indexable_subjects(graph):
        if not is_own(subject):
            continue
        terms.add(local_name(str(subject)))
        for label in graph.objects(subject, RDFS.label):
            terms.add(str(label).strip())
        for comment in graph.objects(subject, RDFS.comment):
            terms.add(str(comment).strip())
    return terms


def build_ontology_text(ttl_path: Path) -> str:
    graph = Graph()
    graph.parse(ttl_path, format="turtle")

    terms = collect_terms(graph, own_namespaces(graph))

    if not terms:
        # Declared ontology URI didn't match any actual term -- fall back to
        # whatever namespace the terms themselves mostly live under.
        fallback_ns = most_common_namespace(graph)
        if fallback_ns:
            terms = collect_terms(graph, {fallback_ns})

    # Collapse whitespace/newlines within each term, drop empties, keep order-stable via sorted().
    cleaned = sorted({" ".join(term.split()) for term in terms if term and term.strip()})
    return " ".join(cleaned)


def build_index(main_json: Path, ttl_folder: Path) -> dict:
    with open(main_json, encoding="utf-8") as f:
        ontologies = json.load(f)

    entries = {}
    for onto in ontologies:
        prefix = onto.get("Prefix")
        if not prefix:
            continue
        ttl_path = ttl_folder / f"{prefix}.ttl"
        if not ttl_path.exists():
            continue
        try:
            text = build_ontology_text(ttl_path)
        except Exception as e:
            print(f"Warning: failed to index {ttl_path.name}: {e}")
            continue
        entries[prefix] = {
            "version": onto.get("Version"),
            "text": text,
        }
        print(f"Indexed {prefix}: {len(text)} chars")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ontologies": entries,
    }


def main():
    parser = argparse.ArgumentParser(description="Build the TTL vocabulary search index.")
    parser.add_argument("--main-json", type=Path, default=DEFAULT_MAIN_JSON)
    parser.add_argument("--ttl-folder", type=Path, default=DEFAULT_TTL_FOLDER)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_JSON)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                         help="Where to also write a dated snapshot copy.")
    args = parser.parse_args()

    index = build_index(args.main_json, args.ttl_folder)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {args.output} ({len(index['ontologies'])} ontologies indexed)")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dated_copy = args.output_dir / f"Ontologies_TTL_SearchIndex_{ts}.json"
    with open(dated_copy, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"Wrote dated copy {dated_copy}")


if __name__ == "__main__":
    main()
