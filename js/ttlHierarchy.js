// Parses a TTL file's rdfs:subClassOf structure client-side (via N3.js) and renders
// it as either a collapsible tree or a vis-network graph on the ontology detail page.

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
const RDFS_CLASS = "http://www.w3.org/2000/01/rdf-schema#Class";
const RDFS_SUBCLASSOF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const OWL_OBJECT_PROPERTY = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_DATATYPE_PROPERTY = "http://www.w3.org/2002/07/owl#DatatypeProperty";
const RDF_PROPERTY = "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE = "http://www.w3.org/2000/01/rdf-schema#range";
const OWL_ON_PROPERTY = "http://www.w3.org/2002/07/owl#onProperty";
const OWL_SOME_VALUES_FROM = "http://www.w3.org/2002/07/owl#someValuesFrom";
const OWL_ALL_VALUES_FROM = "http://www.w3.org/2002/07/owl#allValuesFrom";
const OWL_ON_CLASS = "http://www.w3.org/2002/07/owl#onClass";
const OWL_THING = "http://www.w3.org/2002/07/owl#Thing";
const MAX_HIERARCHY_NODES = 800;

function hierarchyLocalName(iri) {
    const cut = Math.max(iri.lastIndexOf("#"), iri.lastIndexOf("/"));
    return cut >= 0 ? iri.slice(cut + 1) : iri;
}

// Reads rdf:type/owl:Class|rdfs:Class, rdfs:subClassOf, rdfs:label, and object/datatype
// property (with rdfs:domain/rdfs:range) triples out of a TTL file's quads. Blank-node
// objects (owl:Restriction, unionOf domains, etc.) are skipped so they aren't mistaken
// for named classes.
function parseTtlClasses(ttlText) {
    let quads;
    try {
        quads = new N3.Parser().parse(ttlText);
    } catch (error) {
        console.error("Failed to parse TTL for class hierarchy:", error);
        return { nodes: new Map(), edges: [], roots: [], propertyEdges: [], literalEdges: [] };
    }

    const classIris = new Set();
    const propertyKind = new Map(); // iri -> "object" | "datatype" | "property"
    const labels = new Map();
    const edges = [];
    const domainByProperty = new Map();
    const rangeByProperty = new Map();
    const restrictionByBlankNode = new Map();
    const pendingRestrictionEdges = [];

    quads.forEach((quad) => {
        const predicate = quad.predicate.value;

        // Most of this corpus expresses property usage via anonymous owl:Restriction
        // blank nodes (rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ... ; ... ])
        // rather than plain rdfs:domain/range, so blank-node subjects are tracked
        // separately to resolve those restrictions after the full pass.
        if (quad.subject.termType === "BlankNode") {
            const key = quad.subject.value;
            if (!restrictionByBlankNode.has(key)) {
                restrictionByBlankNode.set(key, {});
            }
            const entry = restrictionByBlankNode.get(key);
            if (predicate === OWL_ON_PROPERTY && quad.object.termType === "NamedNode") {
                entry.onProperty = quad.object.value;
            } else if (
                (predicate === OWL_SOME_VALUES_FROM || predicate === OWL_ALL_VALUES_FROM || predicate === OWL_ON_CLASS) &&
                quad.object.termType === "NamedNode"
            ) {
                entry.target = quad.object.value;
            }
            return;
        }

        if (predicate === RDF_TYPE && quad.subject.termType === "NamedNode") {
            if (quad.object.value === OWL_CLASS || quad.object.value === RDFS_CLASS) {
                classIris.add(quad.subject.value);
            } else if (quad.object.value === OWL_OBJECT_PROPERTY) {
                propertyKind.set(quad.subject.value, "object");
            } else if (quad.object.value === OWL_DATATYPE_PROPERTY) {
                propertyKind.set(quad.subject.value, "datatype");
            } else if (quad.object.value === RDF_PROPERTY && !propertyKind.has(quad.subject.value)) {
                propertyKind.set(quad.subject.value, "property");
            }
            return;
        }

        if (predicate === RDFS_LABEL && quad.object.termType === "Literal") {
            const isPreferred = quad.object.language === "en" || !labels.has(quad.subject.value);
            if (isPreferred) {
                labels.set(quad.subject.value, quad.object.value);
            }
            return;
        }

        if (predicate === RDFS_SUBCLASSOF && quad.subject.termType === "NamedNode") {
            if (quad.object.termType === "NamedNode") {
                classIris.add(quad.subject.value);
                // owl:Thing is the implicit universal superclass of everything, so an
                // explicit "subClassOf owl:Thing" triple is trivial noise — skip it
                // rather than showing Thing as a superclass in the tree/graph.
                if (quad.object.value !== OWL_THING) {
                    classIris.add(quad.object.value);
                    edges.push({ child: quad.subject.value, parent: quad.object.value });
                }
            } else if (quad.object.termType === "BlankNode") {
                pendingRestrictionEdges.push({ source: quad.subject.value, blankNodeKey: quad.object.value });
            }
            return;
        }

        if (predicate === RDFS_DOMAIN && quad.subject.termType === "NamedNode" && quad.object.termType === "NamedNode") {
            domainByProperty.set(quad.subject.value, quad.object.value);
            return;
        }

        if (predicate === RDFS_RANGE && quad.subject.termType === "NamedNode" && quad.object.termType === "NamedNode") {
            rangeByProperty.set(quad.subject.value, quad.object.value);
        }
    });

    const nodes = new Map();
    classIris.forEach((iri) => {
        nodes.set(iri, { iri, label: labels.get(iri) || hierarchyLocalName(iri) });
    });

    const childIris = new Set(edges.map((edge) => edge.child));
    const roots = Array.from(nodes.keys()).filter((iri) => !childIris.has(iri));

    // Object-property edges: only drawn when both endpoints resolve to classes
    // already discovered in this same file, so the graph doesn't fill up with
    // one-off external IRIs pulled in from imported vocabularies.
    const propertyEdges = [];
    const seenPropertyEdges = new Set();
    function addPropertyEdge(source, target, propertyIri) {
        if (!nodes.has(source) || !nodes.has(target)) return;
        const label = labels.get(propertyIri) || hierarchyLocalName(propertyIri);
        const dedupeKey = `${source}|${target}|${label}`;
        if (seenPropertyEdges.has(dedupeKey)) return;
        seenPropertyEdges.add(dedupeKey);
        propertyEdges.push({ source, target, label });
    }

    // Datatype-property (literal) edges: the "target" is a literal value (a string,
    // number, date, ...), not a class, so it's rendered as its own small literal node
    // rather than requiring a match against known classes.
    const literalEdges = [];
    const seenLiteralEdges = new Set();
    function addLiteralEdge(source, propertyIri, datatypeIri) {
        if (!nodes.has(source)) return;
        const dedupeKey = `${source}|${propertyIri}`;
        if (seenLiteralEdges.has(dedupeKey)) return;
        seenLiteralEdges.add(dedupeKey);
        literalEdges.push({
            source,
            propertyIri,
            label: labels.get(propertyIri) || hierarchyLocalName(propertyIri),
            datatypeLabel: datatypeIri ? hierarchyLocalName(datatypeIri) : "literal",
        });
    }

    propertyKind.forEach((kind, propertyIri) => {
        const domain = domainByProperty.get(propertyIri);
        const range = rangeByProperty.get(propertyIri);
        if (!domain) return;
        if (kind === "datatype" || isLikelyDatatypeIri(range)) {
            addLiteralEdge(domain, propertyIri, range);
        } else if (range && nodes.has(range)) {
            addPropertyEdge(domain, range, propertyIri);
        }
    });

    pendingRestrictionEdges.forEach(({ source, blankNodeKey }) => {
        const restriction = restrictionByBlankNode.get(blankNodeKey);
        if (!restriction || !restriction.onProperty) return;
        const kind = propertyKind.get(restriction.onProperty);
        if (kind === "datatype" || isLikelyDatatypeIri(restriction.target)) {
            addLiteralEdge(source, restriction.onProperty, restriction.target);
        } else if (restriction.target && nodes.has(restriction.target)) {
            addPropertyEdge(source, restriction.target, restriction.onProperty);
        }
    });

    return { nodes, edges, roots, propertyEdges, literalEdges };
}

function isLikelyDatatypeIri(iri) {
    if (!iri) return false;
    return (
        iri.startsWith("http://www.w3.org/2001/XMLSchema#") ||
        iri === "http://www.w3.org/2000/01/rdf-schema#Literal" ||
        iri === "http://www.w3.org/1999/02/22-rdf-syntax-ns#PlainLiteral" ||
        iri === "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
    );
}

// Nests edges into {iri, label, children[]} starting from the given roots. Classes with
// multiple parents appear under each parent branch. A per-branch ancestor set guards
// against cycles in malformed data.
function buildHierarchyTree(nodes, edges, roots) {
    const childrenByParent = new Map();
    edges.forEach(({ child, parent }) => {
        if (!childrenByParent.has(parent)) {
            childrenByParent.set(parent, []);
        }
        childrenByParent.get(parent).push(child);
    });

    function buildNode(iri, ancestors) {
        const label = nodes.has(iri) ? nodes.get(iri).label : hierarchyLocalName(iri);
        const nextAncestors = new Set(ancestors);
        nextAncestors.add(iri);
        const children = (childrenByParent.get(iri) || [])
            .filter((childIri) => !ancestors.has(childIri))
            .map((childIri) => buildNode(childIri, nextAncestors));
        return { iri, label, children };
    }

    return roots.map((iri) => buildNode(iri, new Set()));
}

function renderHierarchyTreeView(container, treeRoots, ontologyTitle) {
    container.innerHTML = "";
    if (!treeRoots.length) {
        container.innerHTML = '<p class="hierarchy-empty">No class hierarchy found in this ontology file.</p>';
        return;
    }
    if (ontologyTitle) {
        const heading = document.createElement("div");
        heading.className = "hierarchy-tree-title";
        heading.textContent = ontologyTitle;
        container.appendChild(heading);
    }
    const rootList = buildHierarchyList(treeRoots, false);
    rootList.classList.add("hierarchy-tree-root");
    container.appendChild(rootList);
}

function buildHierarchyList(nodes, expanded) {
    const ul = document.createElement("ul");
    ul.className = "hierarchy-tree";
    nodes.forEach((node) => ul.appendChild(buildHierarchyItem(node, expanded)));
    return ul;
}

function buildHierarchyItem(node, expanded) {
    const li = document.createElement("li");
    li.className = "hierarchy-tree-item";

    const hasChildren = node.children.length > 0;
    const label = document.createElement("span");
    label.className = "hierarchy-tree-label" + (hasChildren ? " has-children" : " leaf");

    const icon = document.createElement("span");
    icon.className = "hierarchy-tree-icon" + (hasChildren && expanded ? " expanded" : "");
    icon.textContent = hasChildren ? "▸" : "•";
    label.appendChild(icon);

    const text = document.createElement("span");
    text.className = "hierarchy-tree-text";
    text.textContent = node.label;
    label.appendChild(text);

    li.appendChild(label);

    if (hasChildren) {
        const childList = buildHierarchyList(node.children, false);
        childList.style.display = expanded ? "block" : "none";
        li.appendChild(childList);

        label.addEventListener("click", () => {
            const isOpen = childList.style.display !== "none";
            childList.style.display = isOpen ? "none" : "block";
            icon.classList.toggle("expanded", !isOpen);
        });
    }

    return li;
}

// Renders classes + subClassOf + object/datatype properties as a draggable,
// physics-based force-directed graph (same vis-network interaction style as
// js/ontologyGraph.js's ontology-to-ontology graph), rather than a static tree layout.
// Datatype properties get their own small "literal" node (labeled with the XSD
// datatype, e.g. "string") attached to the class that declares them, since their
// target isn't a class in the ontology.
function renderHierarchyGraphView(container, nodes, edges, propertyEdges, literalEdges) {
    container.innerHTML = "";
    if (typeof vis === "undefined") {
        container.innerHTML = '<p class="hierarchy-empty">Graph view unavailable (vis-network failed to load).</p>';
        return;
    }
    if (!nodes.size) {
        container.innerHTML = '<p class="hierarchy-empty">No class hierarchy found in this ontology file.</p>';
        return;
    }

    const visNodes = Array.from(nodes.values()).map((node) => ({
        id: node.iri,
        label: node.label,
        title: node.iri,
    }));

    const subClassEdges = edges.map((edge) => ({
        from: edge.child,
        to: edge.parent,
        color: { color: "#f7a11b", highlight: "#e69518" },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        title: "rdfs:subClassOf",
    }));

    const propEdges = (propertyEdges || []).map((edge) => ({
        from: edge.source,
        to: edge.target,
        label: edge.label,
        dashes: true,
        color: { color: "#8c9db5", highlight: "#5c6f8a" },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        font: { size: 10, color: "#5c6f8a", strokeWidth: 0 },
        title: edge.label,
    }));

    const literalNodes = [];
    const literalOwnEdges = [];
    (literalEdges || []).forEach((edge) => {
        const literalNodeId = `literal::${edge.source}::${edge.propertyIri}`;
        literalNodes.push({
            id: literalNodeId,
            label: edge.datatypeLabel,
            shape: "box",
            color: {
                background: "#eef3fb",
                border: "#7a93b8",
                highlight: { background: "#dbe6f5", border: "#5c6f8a" },
            },
            font: { size: 10, color: "#3a4a63" },
            margin: 6,
            title: `${edge.label} : ${edge.datatypeLabel}`,
        });
        literalOwnEdges.push({
            from: edge.source,
            to: literalNodeId,
            label: edge.label,
            dashes: true,
            color: { color: "#a9bcd6", highlight: "#5c6f8a" },
            arrows: { to: { enabled: true, scaleFactor: 0.4 } },
            font: { size: 10, color: "#5c6f8a", strokeWidth: 0 },
            title: `${edge.label} : ${edge.datatypeLabel}`,
        });
    });

    const data = {
        nodes: new vis.DataSet([...visNodes, ...literalNodes]),
        edges: new vis.DataSet([...subClassEdges, ...propEdges, ...literalOwnEdges]),
    };

    const options = {
        nodes: {
            shape: "dot",
            size: 14,
            color: { background: "#f7a11b", border: "#c97f0f", highlight: { background: "#e69518", border: "#c97f0f" } },
            font: { size: 13, color: "#333" },
            borderWidth: 2,
        },
        edges: {
            smooth: { enabled: true, type: "dynamic" },
        },
        physics: {
            enabled: true,
            barnesHut: { gravitationalConstant: -4000, springLength: 140, springConstant: 0.03 },
            stabilization: { enabled: true, iterations: 300 },
        },
        interaction: {
            dragNodes: true,
            hideEdgesOnDrag: false,
            hover: true,
            zoomView: true,
        },
    };

    new vis.Network(container, data, options);
    container.appendChild(buildHierarchyGraphLegend());
}

// Small always-visible key explaining the graph's node/edge color coding, pinned to
// the bottom-left corner of the graph container (which must be position: relative).
function buildHierarchyGraphLegend() {
    const legend = document.createElement("div");
    legend.className = "hierarchy-graph-legend";
    legend.innerHTML = `
        <div class="hierarchy-graph-legend-item">
            <span class="hierarchy-graph-legend-swatch hierarchy-graph-legend-swatch--dot" style="background:#f7a11b;border-color:#c97f0f;"></span>
            Class
        </div>
        <div class="hierarchy-graph-legend-item">
            <span class="hierarchy-graph-legend-swatch hierarchy-graph-legend-swatch--box" style="background:#eef3fb;border-color:#7a93b8;"></span>
            Literal value
        </div>
        <div class="hierarchy-graph-legend-item">
            <span class="hierarchy-graph-legend-swatch hierarchy-graph-legend-swatch--line" style="border-color:#f7a11b;"></span>
            subClassOf
        </div>
        <div class="hierarchy-graph-legend-item">
            <span class="hierarchy-graph-legend-swatch hierarchy-graph-legend-swatch--line hierarchy-graph-legend-swatch--dashed" style="border-color:#8c9db5;"></span>
            Object property
        </div>
        <div class="hierarchy-graph-legend-item">
            <span class="hierarchy-graph-legend-swatch hierarchy-graph-legend-swatch--line hierarchy-graph-legend-swatch--dashed" style="border-color:#a9bcd6;"></span>
            Datatype property
        </div>
    `;
    return legend;
}

// Parses the TTL text once, then wires the Tree/Graph toggle buttons to render into
// their respective containers. Shows a size-guard message instead of rendering when the
// hierarchy is too large to display inline without freezing the page.
function initHierarchyView(ttlText, elements) {
    const { treeContainer, graphContainer, statusEl, treeButton, graphButton, ontologyTitle } = elements;

    const { nodes, edges, roots, propertyEdges, literalEdges } = parseTtlClasses(ttlText);

    if (nodes.size === 0) {
        statusEl.textContent = "No class hierarchy found in this ontology file.";
        treeButton.style.display = "none";
        graphButton.style.display = "none";
        return;
    }

    if (nodes.size > MAX_HIERARCHY_NODES) {
        statusEl.textContent = `Ontology too large to render inline (${nodes.size} classes) — use the TTL download instead.`;
        treeButton.style.display = "none";
        graphButton.style.display = "none";
        treeContainer.style.display = "none";
        graphContainer.style.display = "none";
        return;
    }

    statusEl.textContent = "";
    const tree = buildHierarchyTree(nodes, edges, roots);

    let graphRendered = false;

    function showTree() {
        treeButton.classList.add("active");
        graphButton.classList.remove("active");
        treeContainer.style.display = "block";
        graphContainer.style.display = "none";
    }

    function showGraph() {
        graphButton.classList.add("active");
        treeButton.classList.remove("active");
        treeContainer.style.display = "none";
        graphContainer.style.display = "block";
        if (!graphRendered) {
            renderHierarchyGraphView(graphContainer, nodes, edges, propertyEdges, literalEdges);
            graphRendered = true;
        }
    }

    renderHierarchyTreeView(treeContainer, tree, ontologyTitle);
    treeButton.addEventListener("click", showTree);
    graphButton.addEventListener("click", showGraph);
    showGraph();
}
