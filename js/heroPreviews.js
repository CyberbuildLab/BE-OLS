// Drives the three "live preview" cards in the landing page hero: a sample
// spider chart (Ontology Cards), live dataset stats (Analytics), and a small
// non-interactive network graph (Ontology Network Graph). Each preview pulls
// from the same data/Ontologies_forRepo.json used elsewhere on the site.

const PREVIEW_COLORS = ["#f7a11b", "#4f9de0", "#5fae5f", "#c46bd9", "#e0575a", "#e0c04f"];
const SPIDER_CYCLE_INTERVAL_MS = 3500;

async function fetchOntologies() {
    const response = await fetch("data/Ontologies_forRepo.json");
    if (!response.ok) throw new Error("Failed to fetch ontology data");
    return response.json();
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function scoresFor(ontology) {
    return [
        Number(ontology["Alignment Score"]) || 0,
        Number(ontology["Accessibility Score"]) || 0,
        Number(ontology["Quality Score"]) || 0,
    ];
}

// Cycles the spider chart through every ontology (shuffled once at load) so the
// preview keeps changing, rather than showing one fixed sample forever.
function renderHeroSpiderPreview(ontologies) {
    const canvas = document.getElementById("heroSpiderPreview");
    const caption = document.getElementById("heroSpiderCaption");
    if (!canvas || typeof Chart === "undefined") return;

    const cycleOrder = shuffle(ontologies.filter((o) => o.Title));
    if (!cycleOrder.length) return;

    if (caption) caption.textContent = cycleOrder[0].Title;

    let index = 0;
    const chart = new Chart(canvas.getContext("2d"), {
        type: "radar",
        data: {
            labels: ["Connectivity", "Accessibility", ["Documentation", "& Reuse"]],
            datasets: [
                {
                    label: cycleOrder[0].Title,
                    data: scoresFor(cycleOrder[0]),
                    backgroundColor: "rgba(255, 99, 132, 0.2)",
                    borderColor: "rgba(255, 99, 132, 1)",
                    borderWidth: 2,
                    pointRadius: 2,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 10 },
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    suggestedMin: 0,
                    suggestedMax: 3,
                    ticks: { display: false },
                    pointLabels: { font: { size: 8 } },
                },
            },
        },
    });

    setInterval(() => {
        index = (index + 1) % cycleOrder.length;
        const next = cycleOrder[index];
        chart.data.datasets[0].label = next.Title;
        chart.data.datasets[0].data = scoresFor(next);
        chart.update();
        if (caption) caption.textContent = next.Title;
    }, SPIDER_CYCLE_INTERVAL_MS);
}

function renderHeroStats(ontologies) {
    const statOntologies = document.getElementById("statOntologies");
    const statClasses = document.getElementById("statClasses");
    const statProperties = document.getElementById("statProperties");
    const updatedEl = document.getElementById("dataContentUpdated");
    if (!statOntologies || !statClasses || !statProperties) return;

    let totalClasses = 0;
    let totalProperties = 0;
    ontologies.forEach((o) => {
        totalClasses += Number(o["Number of Classes"]) || 0;
        totalProperties += Number(o["Number of Object Properties"]) || 0;
        totalProperties += Number(o["Number of Data Properties"]) || 0;
    });

    statOntologies.textContent = ontologies.length.toLocaleString();
    statClasses.textContent = totalClasses.toLocaleString();
    statProperties.textContent = totalProperties.toLocaleString();

    if (updatedEl) {
        const today = new Date().toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
        updatedEl.textContent = `Last update: ${today}`;
    }
}

function renderHeroGraphPreview(ontologies) {
    const container = document.getElementById("heroGraphPreview");
    if (!container || typeof vis === "undefined") return;

    const prefixMap = new Map();
    ontologies.forEach((o) => {
        if (o.Prefix) prefixMap.set(o.Prefix.toLowerCase(), o);
    });

    const edges = [];
    const connectedPrefixes = new Set();
    ontologies.forEach((o) => {
        if (!o.Prefix) return;
        const linkedTo = o["Linked-to AECO Ontologies"];
        if (linkedTo && typeof linkedTo === "string") {
            linkedTo.split(",").forEach((target) => {
                const targetPrefix = target.trim().toLowerCase();
                if (targetPrefix && prefixMap.has(targetPrefix)) {
                    edges.push({ from: o.Prefix.toLowerCase(), to: targetPrefix });
                    connectedPrefixes.add(o.Prefix.toLowerCase());
                    connectedPrefixes.add(targetPrefix);
                }
            });
        }
    });

    // Same idea as the full Ontology Network Graph page: size each dot by how
    // many links it has, so hub ontologies stand out here too.
    const degreeMap = new Map();
    edges.forEach(({ from, to }) => {
        degreeMap.set(from, (degreeMap.get(from) || 0) + 1);
        degreeMap.set(to, (degreeMap.get(to) || 0) + 1);
    });

    // Only show ontologies that actually have a link, so the preview doesn't
    // fill up with disconnected dots that clutter the small canvas.
    const nodes = ontologies
        .filter((o) => o.Prefix && connectedPrefixes.has(o.Prefix.toLowerCase()))
        .map((o, index) => {
            const id = o.Prefix.toLowerCase();
            const degree = degreeMap.get(id) || 0;
            return {
                id,
                size: 4 + Math.min(degree, 20) * 1.1,
                color: PREVIEW_COLORS[index % PREVIEW_COLORS.length],
            };
        });

    const data = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges),
    };

    const options = {
        autoResize: true,
        interaction: {
            dragNodes: false,
            dragView: false,
            zoomView: false,
            selectable: false,
            hover: false,
        },
        physics: {
            enabled: true,
            stabilization: { enabled: true, iterations: 120, fit: true },
        },
        nodes: { shape: "dot", borderWidth: 0 },
        edges: { color: { color: "rgba(120, 120, 120, 0.35)" }, smooth: false, width: 0.5 },
    };

    const network = new vis.Network(container, data, options);
    network.once("stabilizationIterationsDone", function () {
        network.setOptions({ physics: false });
    });
}

async function initHeroPreviews() {
    try {
        const ontologies = await fetchOntologies();
        renderHeroSpiderPreview(ontologies);
        renderHeroStats(ontologies);
        renderHeroGraphPreview(ontologies);
    } catch (error) {
        console.error("Error loading hero previews:", error);
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroPreviews);
} else {
    initHeroPreviews();
}
