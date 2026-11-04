"""Rebuild data/evaluator_catalogue.json, the data file used by evaluate.html.

Runs the characterisation notebook's functions over data/source to get each
catalogue ontology's namespace aliases and term names. Run it after the
catalogue changes. The page itself (evaluate.html/.css/.js) needs no build.

Usage (from the repo root):  python scripts/build_evaluator.py
Requires: rdflib, pandas, openpyxl, requests
"""
import io, json, re, sys, contextlib, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data' / 'source'
OUT = ROOT / 'data' / 'evaluator_catalogue.json'
NB = sorted(SRC.glob('ontology_characterisation_v*.ipynb'))[-1]

nb = json.load(open(NB, encoding='utf-8'))
code = [''.join(c['source']) for c in nb['cells'] if c['cell_type'] == 'code']
ns = {}
exec(code[1].replace('from tkinter import filedialog\n', ''), ns)   # imports
exec(code[3], ns)                                                   # function definitions
with contextlib.redirect_stdout(io.StringIO()):
    ontos = ns['process_ontologies'](str(SRC / 'ontologies_source.xlsx'), str(SRC / 'Ontologies_TTL'), cache_path=None)
xp = ns['build_extended_uri_prefix_mapping'](ontos)

from rdflib import Graph, RDF, OWL, URIRef
pub = {o['Prefix']: o for o in json.load(open(ROOT / 'data' / 'Ontologies_forRepo.json', encoding='utf-8'))}
key = ns['canonical_match_key']
BLANK_NODE = re.compile(r'^n[0-9a-f]{32}b\d+$')     # random per run, not a namespace
out = []
for o in ontos:
    p = o['prefix_manual']
    keys = sorted({key(u) for u in o['alias_uris_final'] if u} - {''})
    keys = [k for k in keys if not BLANK_NODE.match(k)]
    groups = {}
    f = SRC / 'Ontologies_TTL' / f'{p}.ttl'
    if f.exists():
        try:
            g = Graph(); g.parse(f, format='turtle')
            for t in (OWL.Class, OWL.ObjectProperty, OWL.DatatypeProperty):
                for s in g.subjects(RDF.type, t):
                    if not isinstance(s, URIRef) or not any(key(str(s)).startswith(k) for k in keys):
                        continue
                    m = re.match(r'^(.*[#/])([^#/]+)$', str(s))
                    if m:
                        gr = groups.setdefault(m.group(1), {'C': set(), 'P': set()})
                        gr['C' if t == OWL.Class else 'P'].add(m.group(2))
        except Exception as e:
            print('skip terms for', p, ':', e, file=sys.stderr)
    j = pub.get(p, {})
    out.append({'p': p, 't': o['title_final'], 'u': o['uri'], 'k': keys, 'd': o.get('primary_domain_final'),
                's': [j.get('Alignment Score'), j.get('Accessibility Score'), j.get('Quality Score'), j.get('Governance Score')],
                'lb': o.get('linked_by_aeco_auto') or [],
                'tg': [[n, '|'.join(sorted(v['C'])), '|'.join(sorted(v['P']))] for n, v in groups.items()]})

cat = {'generated': datetime.date.today().isoformat(), 'source': 'CyberbuildLab/BE-OLS', 'ontologies': out, 'xp': xp}
OUT.write_text(json.dumps(cat, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
print(f'{OUT.name} written: {len(out)} ontologies, {OUT.stat().st_size // 1024} KB')
