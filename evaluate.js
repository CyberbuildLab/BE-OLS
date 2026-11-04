
(function (root) {
  'use strict';

  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const DC = 'http://purl.org/dc/elements/1.1/';
  const DCT = 'http://purl.org/dc/terms/';
  const VANN = 'http://purl.org/vocab/vann/';
  const FOAF = 'http://xmlns.com/foaf/0.1/';
  const SKOS = 'http://www.w3.org/2004/02/skos/core#';
  const SCHEMA = 'http://schema.org/';
  const SCHEMA_S = 'https://schema.org/';
  const CC = 'http://creativecommons.org/ns#';
  const DCAT = 'http://www.w3.org/ns/dcat#';

  const TYPE = RDF + 'type';

  // Same lists as the notebook
  const EXCLUDED_PREFIXES = new Set(['owl', 'rdf', 'xml', 'xsd', 'rdfs']);
  const META_LIST = ['ph', 'brick', 'rec', 'bot', 'saref4bldg', 'sosa', 'ssn', 'db'];
  const BLANK_TOKENS = new Set(['', 'none', 'null', 'nan', 'n/d', 'n/a', 'na', 'unknown', 'n.a', 'n.a.']);
  const DEFAULT_MANUAL_ALIASES = {
    beo: ['https://w3id.org/beo#'],
    brot: ['https://wisib.de/ontologie/brot#'],
    bpo: ['https://www.projekt-scope.de/ontologies/bpo/#'],
    saref4city: ['https://w3id.org/def/saref4city#'],
  };

  // Well-known upper/generic vocabularies, used to name a namespace the file
  // uses without declaring a prefix for it (the notebook does this through the
  // corpus-wide "extended" prefix map).
  const KNOWN_NS = {
    'http://purl.org/dc/terms': 'dcterms', 'http://purl.org/dc/elements/1.1': 'dc',
    'http://www.w3.org/2004/02/skos/core': 'skos', 'http://www.w3.org/ns/prov': 'prov',
    'http://xmlns.com/foaf/0.1': 'foaf', 'http://schema.org': 'schema',
    'http://purl.org/vocab/vann': 'vann', 'http://creativecommons.org/ns': 'cc',
    'http://qudt.org/schema/qudt': 'qudt', 'http://qudt.org/vocab/unit': 'unit',
    'http://qudt.org/vocab/quantitykind': 'quantitykind', 'http://www.w3.org/2006/time': 'time',
    'http://www.opengis.net/ont/geosparql': 'geo', 'http://www.w3.org/2003/01/geo/wgs84_pos': 'wgs',
    'http://www.w3.org/ns/shacl': 'sh', 'http://www.w3.org/ns/dcat': 'dcat',
    'http://www.w3.org/ns/org': 'org', 'http://purl.org/ontology/bibo': 'bibo',
    'http://www.w3.org/2003/06/sw-vocab-status/ns': 'vs', 'http://w3id.org/fno/ontology': 'fno',
    'http://www.ontologydesignpatterns.org/ont/dul/DUL.owl': 'dul', 'http://www.w3.org/ns/odrl/2': 'odrl',
    'http://purl.org/goodrelations/v1': 'gr', 'http://www.w3.org/ns/locn': 'locn',
    'http://www.w3.org/2000/01/rdf-schema': 'rdfs', 'http://www.w3.org/1999/02/22-rdf-syntax-ns': 'rdf',
    'http://www.w3.org/2002/07/owl': 'owl', 'http://www.w3.org/2001/XMLSchema': 'xsd',
    'http://www.w3.org/XML/1998/namespace': 'xml',
  };

  const LICENSE_PREDS = [DCT + 'license', DC + 'rights', DCT + 'rights', CC + 'license', SCHEMA + 'license', SCHEMA_S + 'license'];
  const VERSION_PREDS = [OWL + 'versionInfo', DCT + 'hasVersion'];
  const CREATOR_PREDS = [DCT + 'creator', DC + 'creator'];
  const TITLE_PREDS = [DCT + 'title', DC + 'title', RDFS + 'label'];
  const DESC_PREDS = [DCT + 'description', DC + 'description', RDFS + 'comment'];
  const DOC_PREDS = [RDFS + 'seeAlso', FOAF + 'homepage', FOAF + 'page', DCT + 'source', DCT + 'references',
    DCT + 'isReferencedBy', DCAT + 'landingPage', SCHEMA + 'url', SCHEMA_S + 'url', SCHEMA + 'citation', DCT + 'bibliographicCitation'];
  const PERSISTENT_HOSTS = ['w3id.org', 'purl.org', 'doi.org', 'www.w3.org', 'purl.obolibrary.org', 'saref.etsi.org', 'schema.org'];

  // ---------- URI helpers (identical semantics to the notebook) ----------
  function normalizeUri(uri) {
    if (!uri) return uri;
    if (uri.startsWith('https://')) uri = 'http://' + uri.slice(8);
    return uri.replace(/[/#]+$/, '');
  }
  function canonicalKey(uri) {
    let k = normalizeUri(uri);
    if (k && k.startsWith('http://www.w3id.org/')) k = 'http://w3id.org/' + k.slice('http://www.w3id.org/'.length);
    return k;
  }
  const isHttp = (u) => typeof u === 'string' && (u.startsWith('http://') || u.startsWith('https://'));
  function splitIri(u) {
    const m = /^(.*[#/])([^#/]+)$/.exec(u);
    return m ? [m[1], m[2]] : [u, ''];
  }
  function isMeaningful(v) {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.some(isMeaningful);
    if (typeof v === 'number') return !Number.isNaN(v);
    return !BLANK_TOKENS.has(String(v).trim().toLowerCase());
  }
  function isPrefixUsed(prefixUri, allUris) {
    const sep = prefixUri.endsWith('#') ? '#' : (prefixUri.endsWith('/') ? '/' : '');
    const np = normalizeUri(prefixUri);
    for (const u of allUris) {
      const nu = normalizeUri(u);
      if (nu === np) return true;
      if (sep && nu.startsWith(np + sep)) return true;
    }
    return false;
  }
  const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ---------- Graph index ----------
  function indexGraph(g) {
    const bySubj = new Map();
    const byType = new Map();
    for (const q of g.quads) {
      const sk = q.s.v;
      if (!bySubj.has(sk)) bySubj.set(sk, []);
      bySubj.get(sk).push(q);
      if (q.p === TYPE && q.o.t === 'N') {
        if (!byType.has(q.o.v)) byType.set(q.o.v, new Set());
        byType.get(q.o.v).add(q.s.t === 'N' ? q.s.v : '_:' + q.s.v);
      }
    }
    const objs = (s, preds) => {
      const out = [];
      for (const q of bySubj.get(s) || []) if (preds.includes(q.p)) out.push(q.o);
      return out;
    };
    const typed = (t) => [...(byType.get(t) || [])].filter((x) => !x.startsWith('_:'));
    return { bySubj, byType, objs, typed };
  }

  // ---------- Catalogue map (build_uri_prefix_mapping) ----------
  function buildCatalogueMap(catalogue) {
    const map = new Map();
    for (const c of catalogue) if (c.u) map.set(canonicalKey(c.u), c.p);
    for (const c of catalogue) {
      const extra = (c.k || []).concat((DEFAULT_MANUAL_ALIASES[c.p] || []).map(canonicalKey));
      for (const k of extra) if (!map.has(k)) map.set(k, c.p);
    }
    return map;
  }

  // ---------- Main evaluation ----------
  function evaluate(graph, catalogueData, userInput) {
    userInput = userInput || {};
    const catalogue = Array.isArray(catalogueData) ? catalogueData : catalogueData.ontologies;
    const xp = (catalogueData && catalogueData.xp) || {};
    const idx = indexGraph(graph);
    const prefixes = graph.prefixes || {};
    const catMap = buildCatalogueMap(catalogue);
    const catByPrefix = new Map(catalogue.map((c) => [c.p, c]));

    // 1. ontology declaration
    const ontoNodes = idx.typed(OWL + 'Ontology').filter(isHttp);
    const ontologyIri = ontoNodes[0] || null;
    const anyOntoDecl = (idx.byType.get(OWL + 'Ontology') || new Set()).size > 0;
    const hdr = (preds) => (ontologyIri ? idx.objs(ontologyIri, preds) : []);
    const hdrVal = (preds) => { const o = hdr(preds)[0]; return o ? o.v : null; };
    const hdrAll = (preds) => { const a = hdr(preds).map((o) => o.v); return a.length ? a : null; };

    // 2. own namespace keys (extract_ontology_uris)
    const ownKeys = new Set();
    const ownPrefixes = new Set();
    if ('' in prefixes) { ownKeys.add(normalizeUri(prefixes[''])); ownPrefixes.add(''); }
    for (const iri of ontoNodes) {
      ownKeys.add(normalizeUri(iri));
      for (const [p, u] of Object.entries(prefixes)) if (normalizeUri(u) === normalizeUri(iri)) ownPrefixes.add(p);
    }

    // 3. collect URIs and namespace bases
    const allUris = new Set();
    const bases = new Set();
    const reg = (u) => {
      if (!isHttp(u)) return;
      allUris.add(u);
      if (ownKeys.has(normalizeUri(u))) return;
      bases.add(u.includes('#') ? u.slice(0, u.lastIndexOf('#') + 1) : u.slice(0, u.lastIndexOf('/') + 1));
    };
    for (const q of graph.quads) {
      if (q.s.t === 'N') reg(q.s.v);
      reg(q.p);
      if (q.o.t === 'N') reg(q.o.v);
    }
    const extBases = [...bases].filter((b) => !ownKeys.has(normalizeUri(b)));

    const refs = [];
    const added = new Set();
    const unusedPrefixes = [];
    for (const [p, u] of Object.entries(prefixes)) {
      if (ownPrefixes.has(p)) continue;
      const used = isPrefixUsed(u, allUris);
      const n = normalizeUri(u);
      if (used && !added.has(n)) { refs.push({ prefix: p, base: u }); added.add(n); }
      if (!used && !EXCLUDED_PREFIXES.has(p)) unusedPrefixes.push(p);
    }
    for (const b of extBases.sort()) {
      const n = normalizeUri(b);
      if (!added.has(n)) { refs.push({ prefix: xp[n] || KNOWN_NS[n] || null, base: b }); added.add(n); }
    }

    // 4. self namespaces (extract_ontology_metadata) and catalogue identity
    const selfNs = [];
    if (ontologyIri) selfNs.push(ontologyIri);
    if (prefixes['']) selfNs.push(prefixes['']);
    if (ontologyIri) for (const o of idx.objs(ontologyIri, [OWL + 'versionIRI', OWL + 'priorVersion', OWL + 'sameAs'])) selfNs.push(o.v);
    const selfKeys = new Set(selfNs.filter(Boolean).map(canonicalKey));
    let catalogueMatch = null;
    for (const k of selfKeys) if (catMap.has(k)) { catalogueMatch = catMap.get(k); break; }
    if (catalogueMatch) {
      const c = catByPrefix.get(catalogueMatch);
      for (const k of (c.k || [])) selfKeys.add(k);
      if (c.u) selfKeys.add(canonicalKey(c.u));
    }

    // 5. linked AECO / upper (create_linked_ontology_lists)
    const linkedAeco = [];
    const linkedUpper = [];
    const external = [];
    for (const r of refs) {
      const key = canonicalKey(r.base);
      if (selfKeys.has(key)) continue;
      if (catMap.has(key)) { if (!linkedAeco.includes(catMap.get(key))) linkedAeco.push(catMap.get(key)); }
      else if (r.prefix && !EXCLUDED_PREFIXES.has(r.prefix)) linkedUpper.push(r.prefix);
      else if (!r.prefix) external.push(r.base);
    }
    const linkedMeta = linkedAeco.filter((p) => META_LIST.includes(p));

    // 6. own terms
    const ownStems = new Set();
    if (prefixes['']) ownStems.add(prefixes['']);
    for (const iri of ontoNodes) ownStems.add(iri);
    const vannNs = hdrVal([VANN + 'preferredNamespaceUri']);
    if (vannNs && isHttp(vannNs)) ownStems.add(vannNs);
    // A stem ending in '#' or '/' is a namespace; a bare IRI (e.g. https://w3id.org/cto)
    // owns only itself plus its '#' and '/' children. This avoids the notebook's
    // habit of chopping .../cto to .../ and claiming every w3id.org term.
    const isOwn = (u) => {
      for (const s of ownStems) {
        if (/[#/]$/.test(s)) { if (u.startsWith(s)) return true; }
        else if (u === s || u.startsWith(s + '#') || u.startsWith(s + '/')) return true;
      }
      return false;
    };

    const kinds = [
      ['Class', OWL + 'Class'], ['ObjectProperty', OWL + 'ObjectProperty'],
      ['DatatypeProperty', OWL + 'DatatypeProperty'], ['AnnotationProperty', OWL + 'AnnotationProperty'],
    ];
    const elements = [];
    const termKind = new Map();
    for (const [k, t] of kinds) for (const s of idx.typed(t)) if (isOwn(s)) { elements.push(s); if (!termKind.has(s)) termKind.set(s, k); }
    // also rdfs:Class and rdf:Property in own namespace (counted for advisory only)
    for (const s of idx.typed(RDFS + 'Class')) if (isOwn(s) && !termKind.has(s)) termKind.set(s, 'Class');
    for (const s of idx.typed(RDF + 'Property')) if (isOwn(s) && !termKind.has(s)) termKind.set(s, 'Property');

    const hasComment = (s) => idx.objs(s, [RDFS + 'comment']).length > 0;
    const hasLabel = (s) => idx.objs(s, [RDFS + 'label', SKOS + 'prefLabel']).length > 0;
    const annotated = elements.filter(hasComment).length;
    const coverage = elements.length ? Math.round((annotated / elements.length) * 1000) / 10 : 0;

    const uniqTerms = [...termKind.keys()];
    const missingComment = uniqTerms.filter((s) => !hasComment(s));
    const missingLabel = uniqTerms.filter((s) => !hasLabel(s));
    const props = uniqTerms.filter((s) => /Property$/.test(termKind.get(s)) && termKind.get(s) !== 'AnnotationProperty');
    const missingDomain = props.filter((s) => idx.objs(s, [RDFS + 'domain', SCHEMA + 'domainIncludes', SCHEMA_S + 'domainIncludes']).length === 0);
    const missingRange = props.filter((s) => idx.objs(s, [RDFS + 'range', SCHEMA + 'rangeIncludes', SCHEMA_S + 'rangeIncludes']).length === 0);

    // terms used in own namespace that are never declared (often typos)
    const declared = new Set(uniqTerms);
    for (const s of idx.bySubj.keys()) if (idx.objs(s, [TYPE]).length) declared.add(s);
    const undeclared = new Set();
    for (const q of graph.quads) {
      for (const u of [q.s.t === 'N' ? q.s.v : null, q.p, q.o.t === 'N' ? q.o.v : null]) {
        if (u && isHttp(u) && isOwn(u) && !declared.has(u) && !ownKeys.has(normalizeUri(u)) && !selfKeys.has(canonicalKey(u))) undeclared.add(u);
      }
    }

    // classes aligned to an external term
    const classes = uniqTerms.filter((s) => termKind.get(s) === 'Class');
    const alignPreds = [RDFS + 'subClassOf', OWL + 'equivalentClass', SKOS + 'exactMatch', SKOS + 'closeMatch', SKOS + 'broadMatch', SKOS + 'relatedMatch'];
    const alignedClasses = classes.filter((s) => idx.objs(s, alignPreds).some((o) => o.t === 'N' && !isOwn(o.v) && !o.v.startsWith(OWL)));

    // language tags on labels/comments
    let litNoLang = 0; let litTotal = 0;
    for (const s of uniqTerms) for (const o of idx.objs(s, [RDFS + 'label', RDFS + 'comment'])) { if (o.t === 'L') { litTotal++; if (!o.lang) litNoLang++; } }

    // 7. metadata
    const meta = {
      ontologyIri,
      title: hdrVal(TITLE_PREDS), description: hdrVal(DESC_PREDS),
      created: hdrVal([DCT + 'created']), issued: hdrVal([DCT + 'issued']), modified: hdrVal([DCT + 'modified']),
      creator: hdrAll(CREATOR_PREDS), contributor: hdrAll([DCT + 'contributor', DC + 'contributor']),
      license: hdrVal(LICENSE_PREDS), licensePredicate: (hdr(LICENSE_PREDS)[0] ? (idx.bySubj.get(ontologyIri) || []).find((q) => LICENSE_PREDS.includes(q.p)).p : null),
      publisher: hdrVal([DCT + 'publisher', DC + 'publisher']),
      version: hdrVal(VERSION_PREDS), versionIri: hdrVal([OWL + 'versionIRI']),
      preferredPrefix: hdrVal([VANN + 'preferredNamespacePrefix']), preferredNamespace: vannNs,
      docLinks: hdr(DOC_PREDS).filter((o) => o.t === 'N' || (o.t === 'L' && isHttp(o.v))).map((o) => o.v),
      counts: {
        classes: idx.typed(OWL + 'Class').length,
        objectProperties: idx.typed(OWL + 'ObjectProperty').length,
        dataProperties: idx.typed(OWL + 'DatatypeProperty').length,
        annotationProperties: idx.typed(OWL + 'AnnotationProperty').length,
        individuals: idx.typed(OWL + 'NamedIndividual').length,
        triples: graph.quads.length,
      },
    };

    // 8. scores
    const docProvided = userInput.documentation !== undefined ? !!userInput.documentation : meta.docLinks.length > 0;
    const modelProvided = !!userInput.conceptualModel || hdr([FOAF + 'depiction']).length > 0;
    const crit = {
      upper: linkedUpper.length > 0,
      aeco: linkedAeco.length > 0,
      meta: linkedMeta.length > 0,
      model: modelProvided,
      serialization: graph.quads.length > 0,
      uri: !!ontologyIri,
      documentation: docProvided,
      annotations: coverage,
      license: isMeaningful(meta.license),
      version: isMeaningful(meta.version),
      creator: isMeaningful(meta.creator),
    };
    const scores = {
      connectivity: (+crit.upper) + (+crit.aeco) + (+crit.meta),
      accessibility: (+crit.model) + (+crit.serialization) + (+crit.uri),
      documentation: Math.round(((+crit.documentation) + (coverage ? Math.round(coverage / 10) / 10 : 0)) * 10) / 10,
      governance: (+crit.license) + (+crit.version) + (+crit.creator),
    };
    scores.total = Math.round((scores.connectivity + scores.accessibility + scores.documentation + scores.governance) * 10) / 10;

    // reuse (informational; mirrors the detail page's "Reused/Extended" row)
    const reusedBy = catalogueMatch ? (catByPrefix.get(catalogueMatch).lb || []) : [];

    // 9. alignment suggestions from catalogue term names
    const suggestions = suggestAlignments(uniqTerms.map((u) => [u, termKind.get(u)]), catalogue, new Set([catalogueMatch, ...linkedAeco]));

    // 10. benchmark against the catalogue
    const bench = benchmark(catalogue, scores);

    const ctx = {
      ontologyIri, prefixes, meta, crit, linkedAeco, linkedUpper, linkedMeta, external, unusedPrefixes,
      coverage, elementsCount: elements.length, annotated, missingComment, missingLabel, missingDomain, missingRange,
      undeclared: [...undeclared], classes, alignedClasses, litNoLang, litTotal, suggestions, anyOntoDecl,
      ownPrefix: pickOwnPrefix(prefixes, ontologyIri, meta.preferredPrefix),
      termKind, catalogueMatch,
    };
    const findings = buildFindings(ctx);

    return {
      meta, crit, scores, coverage, elementsCount: elements.length, annotated,
      linkedAeco, linkedUpper, linkedMeta, external, refs, unusedPrefixes,
      catalogueMatch, catalogueEntry: catalogueMatch ? catByPrefix.get(catalogueMatch) : null, reusedBy,
      classesAligned: alignedClasses.length, classesOwn: classes.length,
      termsOwn: uniqTerms.length, suggestions, bench, findings, ownPrefix: ctx.ownPrefix,
    };
  }

  function pickOwnPrefix(prefixes, iri, preferred) {
    if (preferred) return preferred;
    if (iri) for (const [p, u] of Object.entries(prefixes)) if (p && normalizeUri(u) === normalizeUri(iri)) return p;
    if ('' in prefixes) return '';
    return 'ex';
  }

  function suggestAlignments(ownTerms, catalogue, skip) {
    if (!ownTerms.length) return [];
    const byName = new Map();
    for (const [u, k] of ownTerms) {
      const [, loc] = splitIri(u);
      const n = normName(loc);
      if (n.length < 3) continue;
      const kk = k === 'Class' ? 'C' : 'P';
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push({ u, kk });
    }
    const results = [];
    for (const c of catalogue) {
      if (skip.has(c.p)) continue;
      const matches = [];
      for (const [ns, cs, ps] of c.tg || []) {
        for (const [kk, list] of [['C', cs], ['P', ps]]) {
          if (!list) continue;
          for (const loc of list.split('|')) {
            const own = byName.get(normName(loc));
            if (own) for (const o of own) if (o.kk === kk) matches.push({ own: o.u, target: ns + loc, kind: kk });
          }
        }
      }
      if (matches.length) {
        const uniq = [...new Map(matches.map((m) => [m.own + '>' + m.target, m])).values()];
        const isMeta = META_LIST.includes(c.p);
        results.push({ prefix: c.p, title: c.t, domain: c.d, isMeta, matches: uniq, score: uniq.length + (isMeta ? 2 : 0) });
      }
    }
    results.sort((a, b) => b.score - a.score || a.prefix.localeCompare(b.prefix));
    return results.slice(0, 6);
  }

  function benchmark(catalogue, scores) {
    const axes = ['connectivity', 'accessibility', 'documentation', 'governance'];
    const vals = axes.map(() => []);
    const totals = [];
    for (const c of catalogue) {
      if (!c.s || c.s.some((x) => x === null || x === undefined)) continue;
      c.s.forEach((v, i) => vals[i].push(v));
      totals.push(c.s.reduce((a, b) => a + b, 0));
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const pctBelow = (a, v) => Math.round((a.filter((x) => x < v).length + 0.5 * a.filter((x) => x === v).length) / (a.length || 1) * 100);
    return {
      n: totals.length,
      mean: Object.fromEntries(axes.map((a, i) => [a, Math.round(mean(vals[i]) * 100) / 100])),
      totalMean: Math.round(mean(totals) * 10) / 10,
      percentile: pctBelow(totals, scores.total),
    };
  }

  // ---------- Findings: shortcomings and fixes ----------
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  function buildFindings(c) {
    const F = [];
    const iri = c.ontologyIri ? '<' + c.ontologyIri + '>' : '<https://w3id.org/your-ontology#>';
    const pfx = c.ownPrefix;
    const P = pfx == null ? 'ex' : pfx;  // CURIE prefix for new own terms ('' is the default prefix)
    const PREF = pfx || ((c.ontologyIri || '').replace(/[#/]+$/, '').split(/[#/]/).pop() || 'ex').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const curie = (u) => {
      for (const [p, ns] of Object.entries(c.prefixes)) if (u.startsWith(ns) && /^[A-Za-z_][\w.-]*$/.test(u.slice(ns.length))) return (p + ':' + u.slice(ns.length));
      return '<' + u + '>';
    };
    const pfxDecl = (need) => need.map((p) => ({
      dcterms: '@prefix dcterms: <http://purl.org/dc/terms/> .', owl: '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
      rdfs: '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', vann: '@prefix vann: <http://purl.org/vocab/vann/> .',
      xsd: '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .', skos: '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
      foaf: '@prefix foaf: <http://xmlns.com/foaf/0.1/> .', prov: '@prefix prov: <http://www.w3.org/ns/prov#> .',
      bot: '@prefix bot: <https://w3id.org/bot#> .',
    })[p]).join('\n');
    const list = (arr, n) => arr.slice(0, n || 8).map(curie);
    const today = new Date().toISOString().slice(0, 10);
    const add = (f) => F.push(f);

    // --- Accessibility ---
    if (!c.crit.uri) add({
      id: 'uri', axis: 'accessibility', scored: true, severity: 'high',
      title: c.anyOntoDecl ? 'Ontology IRI is a blank node or not an HTTP(S) IRI' : 'No owl:Ontology declaration',
      why: 'Other ontologies cannot import or cite it, and FOOPs cannot assess it.',
      fix: 'Declare a persistent HTTP(S) IRI, ideally on w3id.org, that resolves to the file.',
      snippet: pfxDecl(['owl']) + '\n\n<https://w3id.org/your-ontology#> a owl:Ontology .',
    });
    if (!c.crit.model) add({
      id: 'model', axis: 'accessibility', scored: true, severity: 'medium',
      title: 'No conceptual data model found',
      why: 'No foaf:depiction on the ontology header.',
      fix: 'Publish a class diagram (Chowlk, Graffoo or WebVOWL) and link it from the header.',
      snippet: pfxDecl(['foaf']) + '\n\n' + iri + ' foaf:depiction <https://example.org/your-ontology/diagram.png> .',
    });

    // --- Connectivity ---
    if (!c.crit.upper) add({
      id: 'upper', axis: 'connectivity', scored: true, severity: 'high',
      title: 'No link to upper or generic vocabularies',
      why: 'The file uses nothing beyond OWL, RDF, RDFS and XSD.',
      fix: 'Reuse DCTERMS, VANN, SKOS, PROV or QUDT.',
      snippet: pfxDecl(['dcterms', 'vann', 'prov', 'rdfs']) + '\n\n' + iri + '\n    dcterms:title "Your ontology title"@en ;\n    vann:preferredNamespacePrefix "' + PREF + '" .\n\n# example class alignment\n' + (c.classes[0] ? curie(c.classes[0]) : P + ':YourClass') + ' rdfs:subClassOf prov:Entity .',
    });
    if (!c.crit.aeco) {
      const top = c.suggestions[0];
      add({
        id: 'aeco', axis: 'connectivity', scored: true, severity: 'high',
        title: 'No link to other built environment (AECO) ontologies in BE-OLS',
        why: 'No namespace in the file belongs to a BE-OLS ontology.',
        fix: top ? 'Closest by term name: ' + c.suggestions.slice(0, 3).map((s) => s.prefix).join(', ') + '.' : 'Relate your classes to BE-OLS ontologies with rdfs:subClassOf or owl:equivalentClass.',
        snippet: top ? '@prefix ' + top.prefix + ': <' + splitIri(top.matches[0].target)[0] + '> .\n\n' + top.matches.slice(0, 3).map((m) => curie(m.own) + (m.kind === 'C' ? ' rdfs:subClassOf ' : ' rdfs:subPropertyOf ') + top.prefix + ':' + splitIri(m.target)[1] + ' .').join('\n') : null,
      });
    }
    if (!c.crit.meta) add({
      id: 'meta', axis: 'connectivity', scored: true, severity: 'medium',
      title: 'No link to a meta schema ontology',
      why: 'Meta schemas: ' + META_LIST.join(', ') + '.',
      fix: 'Buildings and spaces: BOT. Systems: Brick or SAREF4BLDG. Sensors: SOSA/SSN.',
      snippet: pfxDecl(['bot', 'rdfs']) + '\n\n' + (c.classes[0] ? curie(c.classes[0]) : P + ':YourElement') + ' rdfs:subClassOf bot:Element .',
    });

    // --- Documentation ---
    if (!c.crit.documentation) add({
      id: 'doc', axis: 'documentation', scored: true, severity: 'high',
      title: 'No human-readable documentation found',
      why: 'No link in the ontology header.',
      fix: 'Generate a page with WIDOCO or pyLODE and link it from the header.',
      snippet: pfxDecl(['rdfs', 'foaf']) + '\n\n' + iri + '\n    foaf:homepage <https://example.org/your-ontology/> ;\n    rdfs:seeAlso <https://doi.org/10.xxxx/your-paper> .',
    });
    if (c.coverage < 100 && c.elementsCount > 0) add({
      id: 'comment', axis: 'documentation', scored: true, severity: c.coverage < 50 ? 'high' : 'low',
      title: plural(c.missingComment.length, 'term') + ' without rdfs:comment (coverage ' + c.coverage + '%)',
      why: 'Each missing definition lowers the Documentation score.',
      fix: 'Start with: ' + list(c.missingComment, 6).join(', ') + (c.missingComment.length > 6 ? ' and ' + (c.missingComment.length - 6) + ' more.' : '.'),
      snippet: pfxDecl(['rdfs']) + '\n\n' + list(c.missingComment, 3).map((t) => t + ' rdfs:comment "TODO: definition of this term."@en .').join('\n'),
      terms: c.missingComment.map(curie),
    });
    if (c.elementsCount === 0 && c.crit.uri) add({
      id: 'noterms', axis: 'documentation', scored: true, severity: 'medium',
      title: 'No classes or properties found in your own namespace',
      why: 'No OWL-typed terms under your ontology IRI or default namespace, so coverage is 0%.',
      fix: 'Type your terms with OWL and keep them under the ontology IRI, or set vann:preferredNamespaceUri.',
      snippet: null,
    });

    // --- Governance ---
    if (!c.crit.license) add({
      id: 'license', axis: 'governance', scored: true, severity: 'high',
      title: 'No license',
      why: 'Nobody can legally reuse it without one.',
      fix: 'Add an open license. CC BY 4.0 is common.',
      snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:license <https://creativecommons.org/licenses/by/4.0/> .',
    });
    if (!c.crit.version) add({
      id: 'version', axis: 'governance', scored: true, severity: 'high',
      title: 'No version information',
      why: 'Users cannot tell which release they depend on.',
      fix: 'Add owl:versionInfo, ideally with a versionIRI.',
      snippet: pfxDecl(['owl']) + '\n\n' + iri + '\n    owl:versionInfo "1.0.0" ;\n    owl:versionIRI <' + (c.ontologyIri ? c.ontologyIri.replace(/[#/]$/, '') : 'https://w3id.org/your-ontology') + '/1.0.0> .',
    });
    if (!c.crit.creator) add({
      id: 'creator', axis: 'governance', scored: true, severity: 'high',
      title: 'No creator identified',
      why: 'No dcterms:creator or dc:creator on the header.',
      fix: 'Add one dcterms:creator per author, preferably an ORCID IRI.',
      snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:creator <https://orcid.org/0000-0000-0000-0000> .',
    });
    if (c.crit.license && c.meta.licensePredicate && c.meta.licensePredicate !== DCT + 'license') add({
      id: 'licpred', axis: 'governance', scored: false, severity: 'low',
      title: 'License uses ' + curie(c.meta.licensePredicate) + ' instead of dcterms:license',
      why: 'FOOPs and most catalogues look for dcterms:license.',
      fix: 'Add dcterms:license with the license IRI.',
      snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:license <https://creativecommons.org/licenses/by/4.0/> .',
    });
    if (c.crit.license && c.meta.license && !isHttp(c.meta.license)) add({
      id: 'liciri', axis: 'governance', scored: false, severity: 'low',
      title: 'License is a text string, not an IRI',
      why: 'Tools cannot recognise free text.',
      fix: 'Use a license IRI from creativecommons.org or spdx.org.',
      snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:license <https://creativecommons.org/licenses/by/4.0/> .',
    });

    // --- Best practice, not scored by BE-OLS ---
    if (c.ontologyIri) {
      const host = (() => { try { return new URL(c.ontologyIri).host; } catch (e) { return ''; } })();
      if (!PERSISTENT_HOSTS.some((h) => host === h || host.endsWith('.' + h))) add({
        id: 'persist', axis: 'accessibility', scored: false, severity: 'medium',
        title: 'Ontology IRI is not on a persistent identifier service (' + host + ')',
        why: 'Project domains can disappear when funding ends.',
        fix: 'Register a redirect at w3id.org.',
        snippet: null,
      });
    }
    if (!c.meta.title) add({ id: 'title', axis: 'documentation', scored: false, severity: 'medium', title: 'No title on the ontology header', why: 'BE-OLS and FOOPs read it to name your ontology.', fix: 'Add dcterms:title.', snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:title "Your Ontology Name"@en .' });
    if (!c.meta.description) add({ id: 'desc', axis: 'documentation', scored: false, severity: 'medium', title: 'No description on the ontology header', why: 'Helps people judge relevance in BE-OLS.', fix: 'Add dcterms:description.', snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:description "This ontology describes ... to support ..."@en .' });
    if (!c.meta.preferredPrefix || !c.meta.preferredNamespace) add({ id: 'vann', axis: 'documentation', scored: false, severity: 'low', title: 'Missing preferred namespace prefix or URI (VANN)', why: 'BE-OLS reads the prefix and FOOPs checks both.', fix: 'Declare both VANN properties.', snippet: pfxDecl(['vann']) + '\n\n' + iri + '\n    vann:preferredNamespacePrefix "' + PREF + '" ;\n    vann:preferredNamespaceUri "' + (c.prefixes[pfx] || (c.ontologyIri || 'https://w3id.org/your-ontology#')) + '" .' });
    if (!c.meta.created && !c.meta.issued && !c.meta.modified) add({ id: 'dates', axis: 'governance', scored: false, severity: 'low', title: 'No creation or modification date', why: 'BE-OLS shows a Created date from these fields.', fix: 'Add dcterms:created and update dcterms:modified on each release.', snippet: pfxDecl(['dcterms', 'xsd']) + '\n\n' + iri + '\n    dcterms:created "' + today + '"^^xsd:date ;\n    dcterms:modified "' + today + '"^^xsd:date .' });
    if (!c.meta.publisher) add({ id: 'publisher', axis: 'governance', scored: false, severity: 'low', title: 'No publisher', why: 'Helps users judge maintenance and trust.', fix: 'Add dcterms:publisher, ideally a ROR IRI.', snippet: pfxDecl(['dcterms']) + '\n\n' + iri + ' dcterms:publisher <https://ror.org/xxxxxxxxx> .' });
    if (c.missingLabel.length) add({ id: 'labels', axis: 'documentation', scored: false, severity: c.missingLabel.length / Math.max(1, c.termKind.size) > 0.5 ? 'medium' : 'low', title: plural(c.missingLabel.length, 'term') + ' without rdfs:label', why: 'Tools and BE-OLS search show labels to users.', fix: 'Add an rdfs:label with a language tag to each term.', snippet: pfxDecl(['rdfs']) + '\n\n' + list(c.missingLabel, 3).map((t) => t + ' rdfs:label "' + (splitIri(t.replace(/^.*:/, ''))[1] || t.replace(/^.*:/, '')).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() + '"@en .').join('\n'), terms: c.missingLabel.map(curie) });
    if (c.missingDomain.length || c.missingRange.length) add({ id: 'domrange', axis: 'documentation', scored: false, severity: 'low', title: plural(c.missingDomain.length + c.missingRange.length, 'missing domain or range declaration', 'missing domain or range declarations') + ' on properties', why: 'They show which classes a property connects and let validators catch misuse.', fix: 'Declare rdfs:domain and rdfs:range.', snippet: pfxDecl(['rdfs']) + '\n\n' + (c.missingDomain[0] ? curie(c.missingDomain[0]) : curie(c.missingRange[0])) + '\n    rdfs:domain ' + P + ':SomeClass ;\n    rdfs:range ' + P + ':OtherClass .', terms: [...new Set([...c.missingDomain, ...c.missingRange])].map(curie) });
    if (c.undeclared.length) add({ id: 'undeclared', axis: 'accessibility', scored: false, severity: 'medium', title: plural(c.undeclared.length, 'term') + ' in your namespace ' + (c.undeclared.length === 1 ? 'is' : 'are') + ' used but never declared', why: 'Usually a typo or a renamed term.', fix: 'Declare or correct: ' + list(c.undeclared, 6).join(', ') + '.', snippet: pfxDecl(['owl']) + '\n\n' + list(c.undeclared, 2).map((t) => t + ' a owl:Class .  # or owl:ObjectProperty / owl:DatatypeProperty').join('\n'), terms: c.undeclared.map(curie) });
    if (c.classes.length >= 3 && c.alignedClasses.length / c.classes.length < 0.2 && c.crit.aeco) add({ id: 'depth', axis: 'connectivity', scored: false, severity: 'low', title: 'Only ' + c.alignedClasses.length + ' of ' + c.classes.length + ' classes are aligned to external terms', why: 'Few of your classes are mapped to the ontologies you reference.', fix: 'Use the alignment suggestions below.', snippet: null });
    if (c.unusedPrefixes.length) add({ id: 'unused', axis: 'connectivity', scored: false, severity: 'info', title: plural(c.unusedPrefixes.length, 'declared prefix', 'declared prefixes') + ' never used', why: 'They do not count as links: ' + c.unusedPrefixes.slice(0, 10).join(', ') + '.', fix: 'Remove them or reuse those vocabularies.', snippet: null });
    if (c.litTotal > 0 && c.litNoLang / c.litTotal > 0.3) add({ id: 'lang', axis: 'documentation', scored: false, severity: 'info', title: Math.round(c.litNoLang / c.litTotal * 100) + '% of labels and comments have no language tag', why: 'Tags let tools pick the right language.', fix: 'Add a language tag to labels and comments.', snippet: '"wall"@en' });

    const sevRank = { high: 0, medium: 1, low: 2, info: 3 };
    F.sort((a, b) => (b.scored - a.scored) || (sevRank[a.severity] - sevRank[b.severity]));
    return F;
  }

  // ---------- parser adapters ----------
  function fromN3Quads(quads, prefixes) {
    const t = (x) => (x.termType === 'NamedNode' ? 'N' : x.termType === 'BlankNode' ? 'B' : 'L');
    return {
      prefixes: Object.fromEntries(Object.entries(prefixes || {}).map(([k, v]) => [k, typeof v === 'string' ? v : v.value])),
      quads: quads.map((q) => ({
        s: { t: t(q.subject), v: q.subject.value },
        p: q.predicate.value,
        o: { t: t(q.object), v: q.object.value, lang: q.object.language || '', dt: q.object.datatype ? q.object.datatype.value : '' },
      })),
    };
  }

  const api = { evaluate, fromN3Quads, normalizeUri, canonicalKey, META_LIST };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BEOLSEval = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ---------- example ontology shown when the page opens ----------
const SAMPLE = `@prefix :        <https://example.org/fro#> .
@prefix owl:     <http://www.w3.org/2002/07/owl#> .
@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix foaf:    <http://xmlns.com/foaf/0.1/> .

# Example: a small facade retrofit ontology with typical first-draft gaps.

<https://example.org/fro> a owl:Ontology ;
    dcterms:title "Facade Retrofit Ontology"@en ;
    dcterms:description "Describes facade elements, their condition and the retrofit measures applied to them."@en ;
    owl:versionInfo "0.3" .

:Building a owl:Class ;
    rdfs:label "building"@en ;
    rdfs:comment "A construction that has a facade subject to retrofit."@en .

:Space a owl:Class ;
    rdfs:label "space"@en .

:Facade a owl:Class ;
    rdfs:label "facade"@en ;
    rdfs:comment "The exterior envelope of a building, made of facade elements."@en .

:Wall a owl:Class ;
    rdfs:subClassOf :FacadeElement ;
    rdfs:label "wall"@en .

:Window a owl:Class ;
    rdfs:subClassOf :FacadeElement ;
    rdfs:label "window" .

:FacadeElement a owl:Class ;
    rdfs:comment "A physical component of a facade."@en .

:RetrofitMeasure a owl:Class ;
    rdfs:label "retrofit measure"@en ;
    rdfs:comment "An intervention that improves the performance of a facade element."@en .

:Material a owl:Class ;
    rdfs:label "material"@en .

:hasElement a owl:ObjectProperty ;
    rdfs:label "has element"@en ;
    rdfs:domain :Facade ;
    rdfs:range :FacadeElement .

:appliedTo a owl:ObjectProperty ;
    rdfs:label "applied to"@en ;
    rdfs:comment "Links a retrofit measure to the element it changes."@en ;
    rdfs:domain :RetrofitMeasure .

:madeOf a owl:ObjectProperty ;
    rdfs:range :Materal .

:uValue a owl:DatatypeProperty ;
    rdfs:label "U-value"@en ;
    rdfs:comment "Thermal transmittance in W/(m2.K)."@en ;
    rdfs:range xsd:decimal .

:installationYear a owl:DatatypeProperty ;
    rdfs:range xsd:gYear .`;

// ---------- page ----------
(function () {
  'use strict';
  const E = window.BEOLSEval;
  let CAT = null;
  const RDFLIB = 'https://cdn.jsdelivr.net/npm/rdflib@2.2.37/dist/rdflib.min.js';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const AXES = [
    ['connectivity', 'Connectivity', 3],
    ['accessibility', 'Accessibility', 3],
    ['documentation', 'Documentation & Reuse', 2],
    ['governance', 'Governance', 3],
  ];
  const AXIS_LABEL = Object.fromEntries(AXES.map((a) => [a[0], a[1]]));

  // Term names and aliases come from the generated catalogue (scripts/build_evaluator.py).
  const catalogueReady = fetch('data/evaluator_catalogue.json').then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then((cat) => {
    CAT = cat;
    $('cat-date').textContent = CAT.generated;
    $('cat-n').textContent = CAT.ontologies.length;
    refreshScores();
  });

  // Ontologies_forRepo.json is updated more often than the catalogue, so take the latest scores from it.
  const refreshScores = () => fetch('data/Ontologies_forRepo.json').then((r) => (r.ok ? r.json() : null)).then((live) => {
    if (!Array.isArray(live)) return;
    const byP = new Map(live.map((x) => [x.Prefix, x]));
    for (const c of CAT.ontologies) {
      const x = byP.get(c.p); if (!x) continue;
      c.s = [x['Alignment Score'], x['Accessibility Score'], x['Quality Score'], x['Governance Score']];
      if (x['Linked-by AECO Ontologies']) c.lb = String(x['Linked-by AECO Ontologies']).split(',').map((s) => s.trim()).filter(Boolean);
    }
    $('cat-date').textContent = 'live';
    if (state.lastGraph) runEvaluation(state.lastGraph, state.lastName, state.isSample);
  }).catch(() => {});

  const state = { text: null, name: null, isSample: false, lastGraph: null, lastName: null, result: null, filter: 'all', chart: null };

  // ---------- input ----------
  const drop = $('drop');
  $('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) readFile(f); });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  $('paste').addEventListener('input', () => { state.text = null; $('file-name').textContent = ''; });

  function readFile(f) {
    const reader = new FileReader();
    reader.onload = () => { state.text = reader.result; state.name = f.name; $('file-name').textContent = f.name + ' (' + Math.round(f.size / 1024) + ' KB)'; $('paste').value = ''; start(false); };
    reader.onerror = () => showError('The file could not be opened', 'Try choosing it again.');
    reader.readAsText(f);
  }
  $('run').addEventListener('click', () => {
    const pasted = $('paste').value.trim();
    if (pasted) { state.text = pasted; state.name = 'pasted.ttl'; }
    if (!state.text) { showError('No ontology yet', 'Add a file or paste the text first.'); return; }
    start(state.isSample && !pasted);
  });

  function loadSample() {
    state.text = SAMPLE; state.name = 'facade-retrofit.ttl';
    $('file-name').textContent = '';
    start(true);
  }

  async function start(isSample) {
    hideError();
    try {
      await catalogueReady;
    } catch (err) {
      showError('The catalogue could not be loaded', 'Open this page through GitHub Pages or a local web server. Browsers block its data file when the page is opened directly from disk.');
      return;
    }
    $('run').disabled = true; $('run').textContent = 'Evaluating...';
    try {
      const graph = await parse(state.text, state.name);
      if (!graph.quads.length) throw new Error('The file parsed but contains no triples.');
      state.isSample = isSample;
      runEvaluation(graph, state.name, isSample);
    } catch (err) {
      showError('The file could not be read', String(err && err.message ? err.message : err).replace(/\.+$/, '') + '. Check that the file is valid RDF.');
    } finally {
      $('run').disabled = false; $('run').textContent = 'Evaluate';
    }
  }

  function showError(title, msg) { $('error-title').textContent = title; $('error-msg').textContent = msg; $('error').hidden = false; $('error').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function hideError() { $('error').hidden = true; }

  // ---------- parsing ----------
  function detectFormat(text, name) {
    const ext = (name || '').toLowerCase().split('.').pop();
    const head = text.slice(0, 2000).trimStart();
    if (ext === 'jsonld' || ((ext === 'json') && head.startsWith('{')) || (head.startsWith('[') && head.includes('"@'))) return 'jsonld';
    if (['owl', 'rdf', 'xml'].includes(ext) && head.startsWith('<')) {
      if (/^<\?xml|^<rdf:RDF|^<!DOCTYPE/i.test(head) || /<rdf:RDF/.test(head)) return 'rdfxml';
    }
    if (/^<\?xml|^<rdf:RDF|^<!DOCTYPE rdf/i.test(head)) return 'rdfxml';
    if (ext === 'trig') return 'trig';
    if (ext === 'nt') return 'nt';
    return 'turtle';
  }

  function parse(text, name) {
    const fmt = detectFormat(text, name);
    if (fmt === 'rdfxml' || fmt === 'jsonld') return parseRdflib(text, fmt === 'rdfxml' ? 'application/rdf+xml' : 'application/ld+json');
    return new Promise((resolve, reject) => {
      const prefixes = {};
      const quads = [];
      const format = fmt === 'trig' ? 'TriG' : fmt === 'nt' ? 'N-Triples' : 'Turtle';
      const parser = new N3.Parser({ format, baseIRI: 'urn:x-upload:' + encodeURIComponent(name || 'file') });
      parser.parse(text, (err, quad, pfx) => {
        if (err) { reject(err); return; }
        if (quad) quads.push(quad);
        else { if (pfx) Object.assign(prefixes, pfx); resolve(E.fromN3Quads(quads, prefixes)); }
      }, (p, iri) => { prefixes[p] = iri.value || iri; });
    });
  }

  let rdflibPromise = null;
  function loadRdflib() {
    if (window.$rdf) return Promise.resolve();
    if (!rdflibPromise) rdflibPromise = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = RDFLIB; s.onload = res;
      s.onerror = () => rej(new Error('The RDF/XML reader could not be loaded. Convert the file to Turtle (for example with Protégé: File > Save as > Turtle) and try again'));
      document.head.appendChild(s);
    });
    return rdflibPromise;
  }
  async function parseRdflib(text, mime) {
    await loadRdflib();
    const store = window.$rdf.graph();
    const base = 'http://upload.invalid/ontology';
    await new Promise((res, rej) => {
      try { window.$rdf.parse(text, store, base, mime, (err) => (err ? rej(err) : res())); } catch (e) { rej(e); }
    });
    const prefixes = Object.assign({}, store.namespaces || {});
    const re = /xmlns:([A-Za-z_][\w.-]*)\s*=\s*["']([^"']+)["']/g; let m;
    while ((m = re.exec(text.slice(0, 20000)))) if (!(m[1] in prefixes)) prefixes[m[1]] = m[2];
    const dm = /xmlns\s*=\s*["']([^"']+)["']/.exec(text.slice(0, 20000)); if (dm && !('' in prefixes)) prefixes[''] = dm[1];
    const quads = store.statements.map((st) => ({ subject: st.subject, predicate: st.predicate, object: st.object }));
    return E.fromN3Quads(quads, prefixes);
  }

  // ---------- evaluation and rendering ----------
  function runEvaluation(graph, name, isSample) {
    state.lastGraph = graph; state.lastName = name;
    const r = E.evaluate(graph, CAT, {});
    r.docUrl = r.meta.docLinks[0] || '';
    r.fileName = name; r.isSample = isSample;
    state.result = r;
    render(r);
  }

  const shortIri = (u, prefixes) => {
    for (const [p, ns] of Object.entries(prefixes || {})) if (u && u.startsWith(ns) && u.length > ns.length) return p + ':' + u.slice(ns.length);
    return u;
  };

  function render(r) {
    const m = r.meta;
    const title = m.title || (r.fileName || 'Untitled ontology');
    const ent = r.catalogueEntry;
    const counts = m.counts;
    const pct = r.bench.percentile;

    const crit = r.crit;
    const yn = (b) => b ? '<span class="yes">Yes</span>' : '<span class="no">No</span>';
    const list = (a, n) => a.slice(0, n).join(', ') + (a.length > n ? ' +' + (a.length - n) : '');
    const covCls = r.coverage >= 100 ? 'yes' : r.coverage >= 50 ? 'part' : 'no';
    const rows = {
      connectivity: [
        ['Linkage to upper ontologies', yn(crit.upper), r.linkedUpper.length ? list([...new Set(r.linkedUpper)], 6) : 'None found'],
        ['Linkage to existing AECO ontologies', yn(crit.aeco), r.linkedAeco.length ? list(r.linkedAeco, 6) : 'None found'],
        ['Linkage to meta schema ontologies', yn(crit.meta), r.linkedMeta.length ? r.linkedMeta.join(', ') : 'None found'],
      ],
      accessibility: [
        ['Conceptual data model available', yn(crit.model), crit.model ? 'foaf:depiction' : 'None found'],
        ['Accessible as a serialization', yn(crit.serialization), counts.triples.toLocaleString('en') + ' triples'],
        ['Accessible as a URI', yn(crit.uri), m.ontologyIri || 'None found'],
      ],
      documentation: [
        ['Clearly documented', yn(crit.documentation), r.docUrl ? r.docUrl : 'None found'],
        ['Use of annotations (rdfs:comment)', '<span class="' + covCls + '">' + r.coverage + '%</span>', r.annotated + ' of ' + r.elementsCount + ' terms'],
        ['Reused or extended by other AECO ontologies', '<span class="na">Not scored</span>', ent ? (r.reusedBy.length ? list(r.reusedBy, 6) : 'None yet') : 'Not in BE-OLS'],
      ],
      governance: [
        ['License present', yn(crit.license), m.license || 'None'],
        ['Version present', yn(crit.version), m.version || 'None'],
        ['Creator identified', yn(crit.creator), m.creator ? list(m.creator, 3) : 'None'],
      ],
    };

    const scored = r.findings.filter((f) => f.scored);
    const best = r.findings.filter((f) => !f.scored);

    const html = [];
    if (r.isSample) html.push('<div class="example-banner"><span><b>Example report.</b> Upload a file to replace it.</span></div>');
    html.push(`
      <div class="summary">
        <div style="min-width:0">
          <h2>${esc(title)}</h2>
          <div class="iri">${esc(m.ontologyIri || 'No ontology IRI declared')}</div>
          <div class="facts">
            <span class="fact"><b>${counts.classes}</b> classes</span>
            <span class="fact"><b>${counts.objectProperties}</b> object properties</span>
            <span class="fact"><b>${counts.dataProperties}</b> data properties</span>
            <span class="fact"><b>${counts.triples.toLocaleString('en')}</b> triples</span>
            ${m.version ? `<span class="fact">version <b>${esc(m.version)}</b></span>` : ''}
          </div>
          ${ent ? `<p class="match-note">Listed in BE-OLS as <a href="https://cyberbuildlab.github.io/BE-OLS/individualOntologyDetail.html?ontology=${encodeURIComponent(ent.t || ent.p)}">${esc(ent.p)}</a>, catalogue score ${ent.s.reduce((a, b) => a + (b || 0), 0)} / 11.</p>` : ''}
        </div>
        <div class="total">
          <div class="num">${fmt(r.scores.total)}<small> / 11</small></div>
          <div class="rank">Higher than ${pct}% of ${r.bench.n} ontologies. Average ${fmt(r.bench.totalMean)}.</div>
        </div>
      </div>`);

    html.push(`
      <div class="eval">
        <div class="panel chart-card">
          <div class="chart-box"><canvas id="radar" aria-label="Radar chart of the four BE-OLS scores compared with the catalogue average" role="img"></canvas></div>
          <div class="legend">
            <span><i class="swatch" style="background:var(--you)"></i>Your ontology</span>
            <span><i class="swatch" style="background:var(--bench)"></i>BE-OLS average</span>
          </div>
        </div>
        <div class="panel axes">
          ${AXES.map(([k, label, max]) => `
            <div>
              <div class="axis-head"><span class="axis-name">${label}</span><span class="axis-score">${fmt(r.scores[k])} <small>/ ${max} · avg ${fmt(r.bench.mean[k])}</small></span></div>
              ${rows[k].map(([lab, badge, detail]) => `<div class="crit"><span>${esc(lab)}<span class="detail">${esc(detail)}</span></span>${badge}</div>`).join('')}
            </div>`).join('')}
        </div>
      </div>`);

    html.push(`
      <section>
        <div class="section-head">
          <h2>What to fix</h2>
          <div class="tabs" role="group" aria-label="Filter fixes">
            <button type="button" class="small" data-filter="all">All (${r.findings.length})</button>
            <button type="button" class="small" data-filter="scored">Costs points (${scored.length})</button>
            <button type="button" class="small" data-filter="best">Best practice (${best.length})</button>
          </div>
        </div>
        <div class="findings" id="findings"></div>
      </section>`);

    html.push(`
      <section>
        <div class="section-head"><div>
          <h2>Alignment suggestions</h2>
          <p>Same term names. Check the definitions before aligning.</p>
        </div>${r.suggestions.length ? '<button type="button" class="small" id="copy-align">Copy as Turtle</button>' : ''}</div>
        ${r.suggestions.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Ontology</th><th>Domain</th><th>Matching terms (yours → theirs)</th></tr></thead>
          <tbody>${r.suggestions.map((s) => `<tr>
            <td><span class="pfx">${esc(s.prefix)}</span>${s.isMeta ? '<span class="meta-badge">meta</span>' : ''}<span class="ttl">${esc(s.title || '')}</span></td>
            <td>${esc(s.domain || '')}</td>
            <td><div class="pairs">${pairList(s).slice(0, 8).map((x) => `<span>${esc(x)}</span>`).join('')}${pairList(s).length > 8 ? `<span>+${pairList(s).length - 8} more</span>` : ''}</div></td>
          </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No matching term names.</div>'}
      </section>`);

    const upper = [...new Set(r.linkedUpper)];
    html.push(`
      <section>
        <div class="section-head"><div><h2>Detected links</h2></div></div>
        <div class="links">
          <div class="panel"><h3>AECO ontologies in BE-OLS</h3><div class="chips">${r.linkedAeco.length ? r.linkedAeco.map((p) => `<span class="chip aeco">${esc(p)}</span>`).join('') : '<span class="none">None</span>'}</div></div>
          <div class="panel"><h3>Upper and generic</h3><div class="chips">${upper.length ? upper.map((p) => `<span class="chip">${esc(p)}</span>`).join('') : '<span class="none">None</span>'}</div></div>
        </div>
      </section>`);

    html.push(`
      <section class="panel actions">
        <div class="btn-row">
          <button type="button" id="foops" ${m.ontologyIri ? '' : 'disabled'}>Run FOOPs</button>
          <a class="btn" target="_blank" rel="noopener" href="${submitUrl(r)}">Submit to BE-OLS</a>
        </div>
        <p class="status" id="action-status"></p>
        <textarea id="copy-fallback" hidden readonly aria-label="Text to copy"></textarea>
      </section>`);

    $('report').innerHTML = html.join('');
    renderFindings();
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { state.filter = b.dataset.filter; renderFindings(); }));
    drawRadar(r);
    const ca = $('copy-align'); if (ca) ca.addEventListener('click', () => copy(alignmentTurtle(r), 'Copied.'));
    $('foops').addEventListener('click', () => runFoops(r));
  }

  function pairList(s) {
    const pf = state.lastGraph.prefixes;
    return [...new Set(s.matches.map((mm) => shortIri(mm.own, pf) + ' → ' + s.prefix + ':' + mm.target.replace(/^.*[#/]/, '')))];
  }

  function renderFindings() {
    const r = state.result;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
    const items = r.findings.filter((f) => state.filter === 'all' || (state.filter === 'scored' ? f.scored : !f.scored));
    const box = $('findings');
    if (!items.length) { box.innerHTML = '<div class="empty">Nothing here.</div>'; return; }
    box.innerHTML = items.map((f) => `
      <article class="finding">
        <div class="finding-head">
          <span class="sev ${f.severity}">${f.severity}</span>
          <span class="tag">${esc(AXIS_LABEL[f.axis])}</span>
          <span class="tag ${f.scored ? 'pts' : ''}">${f.scored ? 'Costs points' : 'Best practice'}</span>
          <h3>${esc(f.title)}</h3>
        </div>
        <p>${esc(f.why)}</p>
        <p><b>Fix:</b> ${esc(f.fix)}</p>
        ${f.terms && f.terms.length > 3 ? `<details class="terms"><summary>Show all ${f.terms.length} terms</summary><ul>${f.terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
      </article>`).join('');
  }

  function drawRadar(r) {
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    if (!window.Chart) return;
    const css = getComputedStyle(document.documentElement);
    const tok = (n) => css.getPropertyValue(n).trim();
    const ctx = $('radar').getContext('2d');
    state.chart = new Chart(ctx, {
      type: 'radar',
      plugins: [{
        id: 'avgLabels',
        afterDatasetsDraw(chart) {
          const g = chart.ctx; const s = chart.scales.r;
          g.save();
          g.font = '600 11.5px Poppins, sans-serif'; g.fillStyle = tok('--bench'); g.textBaseline = 'middle';
          chart.getDatasetMeta(0).data.forEach((pt, i) => {
            const side = Math.abs(pt.x - s.xCenter) > Math.abs(pt.y - s.yCenter);
            g.textAlign = side ? 'center' : 'left';
            g.fillText(fmt(r.bench.mean[AXES[i][0]]), side ? pt.x : pt.x + 9, side ? pt.y - 13 : pt.y);
          });
          g.restore();
        },
      }],
      data: {
        labels: ['Connectivity', 'Accessibility', ['Documentation', '& Reuse'], 'Governance'],
        datasets: [
          { label: 'BE-OLS average', data: AXES.map((a) => r.bench.mean[a[0]]), borderColor: tok('--bench'), backgroundColor: 'rgba(91,112,132,0.10)', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 2.5, pointBackgroundColor: tok('--bench') },
          { label: 'Your ontology', data: AXES.map((a) => r.scores[a[0]]), borderColor: tok('--you'), backgroundColor: 'rgba(224,40,46,0.30)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: tok('--you') },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.raw) + ' / ' + AXES[c.dataIndex][2] } } },
        scales: { r: {
          min: 0, max: 3, ticks: { stepSize: 1, color: tok('--faint'), backdropColor: 'transparent', font: { family: 'Poppins', size: 11 } },
          grid: { color: tok('--line') }, angleLines: { color: tok('--accent') },
          pointLabels: { color: tok('--fg'), font: { family: 'Poppins', size: 13, weight: '600' } },
        } },
      },
    });
  }

  // ---------- exports ----------
  function fmt(n) { return (Math.round(n * 10) / 10).toString(); }

  function alignmentTurtle(r) {
    const pfx = new Set(); const lines = [];
    const prefixes = state.lastGraph.prefixes;
    for (const s of r.suggestions) {
      const ns = s.matches[0].target.replace(/[^#/]*$/, '');
      pfx.add('@prefix ' + s.prefix + ': <' + ns + '> .');
      lines.push('# ' + s.prefix + (s.title ? ' (' + s.title + ')' : ''));
      for (const mm of s.matches) {
        const tns = mm.target.replace(/[^#/]*$/, '');
        const target = tns === ns ? s.prefix + ':' + mm.target.slice(ns.length) : '<' + mm.target + '>';
        const own = shortIri(mm.own, prefixes); const ownTok = own === mm.own ? '<' + own + '>' : own;
        lines.push(ownTok + (mm.kind === 'C' ? ' rdfs:subClassOf ' : ' rdfs:subPropertyOf ') + target + ' .  # or owl:equivalent' + (mm.kind === 'C' ? 'Class' : 'Property'));
      }
      lines.push('');
    }
    return '# Candidate alignments from matching term names. Review each one before use.\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n' + [...pfx].join('\n') + '\n\n' + lines.join('\n');
  }
  function submitUrl(r) {
    const m = r.meta;
    const q = new URLSearchParams({ template: 'new_ontology.yml' });
    if (m.title) q.set('title', 'Ontology submission: ' + m.title);
    if (m.preferredPrefix || r.ownPrefix) q.set('prefix', m.preferredPrefix || r.ownPrefix);
    if (m.version) q.set('version', m.version);
    if (m.description) q.set('description', String(m.description).slice(0, 1500));
    if (m.ontologyIri) q.set('uri', m.ontologyIri);
    if (r.docUrl) q.set('reference', r.docUrl);
    return 'https://github.com/CyberbuildLab/BE-OLS/issues/new?' + q.toString();
  }

  function copy(text, okMsg) {
    const status = $('action-status');
    const done = (msg) => { if (status) status.textContent = msg; };
    try {
      navigator.clipboard.writeText(text).then(() => done(okMsg), () => fallback());
    } catch (e) { fallback(); }
    function fallback() {
      const ta = $('copy-fallback');
      ta.hidden = false; ta.value = text; ta.focus(); ta.select();
      if (status) status.textContent = 'Copying was blocked. Press Ctrl+C.';
    }
  }

  async function runFoops(r) {
    const status = $('action-status');
    status.textContent = 'Asking FOOPs to assess ' + r.meta.ontologyIri + ' ...';
    try {
      const res = await fetch('https://foops.linkeddata.es/assessOntology', {
        method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', accept: 'application/json;charset=UTF-8' },
        body: JSON.stringify({ ontologyUri: r.meta.ontologyIri }),
      });
      const j = await res.json();
      if (typeof j.overall_score !== 'number') throw new Error('no score');
      status.innerHTML = 'FOOPs FAIR score: <b>' + Math.round(j.overall_score * 100) + '%</b> (published version at the IRI).';
    } catch (e) {
      status.innerHTML = 'Could not reach FOOPs. Try <a href="https://foops.linkeddata.es/" target="_blank" rel="noopener">foops.linkeddata.es</a> with <span class="mono">' + esc(r.meta.ontologyIri) + '</span>.';
    }
  }

  
  loadSample();
})();
