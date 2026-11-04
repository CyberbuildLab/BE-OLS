"""Rebuild evaluate.html for the BE-OLS repo.

Runs the characterisation notebook's functions over data/source to get each
catalogue ontology's namespace aliases and term names, then embeds them, the
evaluator engine and the example ontology into a single evaluate.html.

Usage (from the repo root):  python scripts/build_evaluator.py
Requires: rdflib, pandas, openpyxl, requests
"""
import io, json, re, sys, contextlib, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data' / 'source'
EV = ROOT / 'evaluator'
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
out = []
for o in ontos:
    p = o['prefix_manual']
    keys = sorted({key(u) for u in o['alias_uris_final'] if u})
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

cat = json.dumps({'generated': datetime.date.today().isoformat(), 'source': 'CyberbuildLab/BE-OLS', 'ontologies': out, 'xp': xp},
                 separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
page = (EV / 'page.template.html').read_text(encoding='utf-8')
page = (page.replace('__CATALOGUE__', cat)
            .replace('__SAMPLE__', (EV / 'sample.ttl').read_text(encoding='utf-8'))
            .replace('/*__ENGINE__*/', (EV / 'evaluator.js').read_text(encoding='utf-8')))
head = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n')
page = head + page.replace('<style>', '<style>\n[hidden]{display:none!important}', 1).replace('\n<main class="wrap">', '\n</head>\n<body>\n<main class="wrap">', 1) + '\n</body>\n</html>\n'
(ROOT / 'evaluate.html').write_text(page, encoding='utf-8')
print(f'evaluate.html written: {len(out)} ontologies, {len(page)//1024} KB')
