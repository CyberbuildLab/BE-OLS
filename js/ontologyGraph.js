// Color mapping for domains (using same palette as original)
const DOMAIN_COLORS = {
    "Information Management": "#1f77b4",
    "Production (Process)": "#aec7e8",
    "Energy": "#ff7f0e",
    "Planning Permission": "#ffbb78",
    "Facilities Management": "#2ca02c",
    "BE Product (Infrastructure)": "#98df8a",
    "Safety": "#d62728",
    "Circular Economy": "#ff9896",
    "Resources": "#9467bd",
    "Comfort": "#c5b0d5",
    "Geographic Information": "#8c564b",
    "BE Product (Building)": "#c49c94",
    "Geometry": "#e377c2",
    "Quality": "#f7b6d2",
    "IoT Sensors/Actuators": "#7f7f7f",
    "Weather/Climate": "#c7c7c7",
    "Materials": "#bcbd22",
    "Mobility/Transport": "#dbdb8d",
    "Fire Safety": "#17becf",
    "Standards, Codes and Certifications": "#9edae5"
};

const DEFAULT_COLOR = "#999999";

let network = null;
let ontologiesData = [];

async function initializeGraph() {
    console.log('Initializing graph...');

    const container = document.getElementById('mynetwork');
    if (!container) {
        console.error('Container #mynetwork not found!');
        return;
    }

    try {
        const response = await fetch('data/Ontologies_forRepo.json');
        if (!response.ok) {
            throw new Error('Failed to fetch ontology data');
        }

        ontologiesData = await response.json();
        console.log('Loaded', ontologiesData.length, 'ontologies');

        const { nodes, edges, domains } = buildGraphData(ontologiesData);

        renderLegend(domains);

        const data = {
            nodes: new vis.DataSet(nodes),
            edges: new vis.DataSet(edges)
        };

        const options = {
            configure: {
                enabled: false
            },
            edges: {
                color: {
                    inherit: true
                },
                smooth: {
                    enabled: true,
                    type: "dynamic"
                },
                arrows: {
                    to: { enabled: true, scaleFactor: 0.5 }
                }
            },
            interaction: {
                dragNodes: true,
                hideEdgesOnDrag: false,
                hideNodesOnDrag: false,
                hover: true
            },
            physics: {
                enabled: true,
                stabilization: {
                    enabled: true,
                    fit: true,
                    iterations: 1000,
                    onlyDynamicEdges: false,
                    updateInterval: 50
                }
            },
            nodes: {
                shape: "dot",
                font: {
                    size: 14
                },
                borderWidth: 2
            }
        };

        console.log('Creating network with', nodes.length, 'nodes and', edges.length, 'edges');

        network = new vis.Network(container, data, options);
        console.log('Network created successfully');

        network.on("click", function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const ontology = ontologiesData.find(o => o.Prefix && o.Prefix.toLowerCase() === nodeId.toLowerCase());
                if (ontology && ontology.Title) {
                    window.location.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(ontology.Title)}`;
                }
            }
        });

        network.on("stabilizationProgress", function(params) {
            const loadingBar = document.getElementById('loadingBar');
            const bar = document.getElementById('bar');
            const text = document.getElementById('text');
            if (loadingBar) loadingBar.removeAttribute("style");
            if (text) {
                const maxWidth = 496;
                const minWidth = 20;
                const widthFactor = params.iterations / params.total;
                const width = Math.max(minWidth, maxWidth * widthFactor);
                if (bar) bar.style.width = width + 'px';
                text.innerHTML = Math.round(widthFactor * 100) + '%';
            }
        });

        network.once("stabilizationIterationsDone", function() {
            console.log('Stabilization complete');
            const text = document.getElementById('text');
            const bar = document.getElementById('bar');
            const loadingBar = document.getElementById('loadingBar');
            if (text) text.innerHTML = '100%';
            if (bar) bar.style.width = '496px';
            if (loadingBar) loadingBar.style.opacity = 0;
            if (loadingBar) {
                setTimeout(function() { loadingBar.style.display = 'none'; }, 500);
            }
        });

    } catch (error) {
        console.error('Error loading graph:', error);
        container.innerHTML = '<div class="error-message">Error loading ontology data. Please try again later.</div>';
    }
}

function buildGraphData(ontologies) {
    const nodes = [];
    const edges = [];
    const domains = new Set();
    const prefixMap = new Map();

    ontologies.forEach(o => {
        if (o.Prefix) {
            prefixMap.set(o.Prefix.toLowerCase(), o);
        }
    });

    const inDegree = new Map();
    ontologies.forEach(o => {
        const linkedTo = o["Linked-to AECO Ontologies"];
        if (linkedTo && typeof linkedTo === 'string') {
            linkedTo.split(',').forEach(target => {
                const targetPrefix = target.trim().toLowerCase();
                if (targetPrefix) {
                    inDegree.set(targetPrefix, (inDegree.get(targetPrefix) || 0) + 1);
                }
            });
        }
    });

    ontologies.forEach(o => {
        if (!o.Prefix) return;

        const prefix = o.Prefix.toLowerCase();
        const domain = o["Primary Domain"] || "Unknown";
        const color = DOMAIN_COLORS[domain] || DEFAULT_COLOR;

        domains.add(domain);

        const degree = inDegree.get(prefix) || 0;
        const size = 15 + (degree * 2.5);

        nodes.push({
            id: prefix,
            label: o.Prefix,
            title: `<strong>${o.Title || o.Prefix}</strong><br>Domain: ${domain}<br>Connections: ${degree}`,
            color: color,
            size: size,
            font: { size: 14 },
            labelHighlightBold: true
        });

        const linkedTo = o["Linked-to AECO Ontologies"];
        if (linkedTo && typeof linkedTo === 'string') {
            linkedTo.split(',').forEach(target => {
                const targetPrefix = target.trim().toLowerCase();
                if (targetPrefix && prefixMap.has(targetPrefix)) {
                    edges.push({
                        from: prefix,
                        to: targetPrefix
                    });
                }
            });
        }
    });

    return { nodes, edges, domains: Array.from(domains).sort() };
}

function renderLegend(domains) {
    const legendContainer = document.getElementById('legend');
    legendContainer.innerHTML = '';

    domains.forEach(domain => {
        const color = DOMAIN_COLORS[domain] || DEFAULT_COLOR;
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<span class="legend-dot" style="background-color: ${color}"></span>${domain}`;
        legendContainer.appendChild(item);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGraph);
} else {
    initializeGraph();
}
