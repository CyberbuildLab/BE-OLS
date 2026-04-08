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
  "Standards, Codes and Certifications": "#9edae5",
};

const DEFAULT_COLOR = "#999999";
const BASE_NODE_SIZE = 15;
const NODE_SIZE_SCALE = 2.5;
const FONT_SIZE = 14;
const ANIMATION_DURATION = 450;
const STABILIZATION_ITERATIONS = 1000;
const DATA_FIELD_LINKED = "Linked-to AECO Ontologies";
const DATA_FIELD_DOMAIN = "Primary Domain";
const DATA_FIELD_CLASSES = "Number of Classes";
const DATA_FIELD_FOOPS = "FOOPs Score";
const DATA_FIELD_DESCRIPTION = "Description";
const DOM_ID_CONTAINER = "ontology-network-graph";
const DOM_ID_LEGEND = "legend";
const DOM_ID_SIDE_PANEL = "sidePanel";
const DOM_ID_PANEL_OVERLAY = "panelOverlay";
const DOM_ID_CLOSE_BUTTON = "panelCloseButton";
const DOM_ID_PANEL_TITLE = "panelTitle";
const DOM_ID_PANEL_PREFIX = "panelPrefix";
const DOM_ID_PANEL_DOMAIN = "panelDomain";
const DOM_ID_PANEL_DESCRIPTION = "panelDescription";
const DOM_ID_PANEL_CONNECTIONS = "panelConnections";
const DOM_ID_PANEL_CLASSES = "panelClasses";
const DOM_ID_PANEL_FOOPS = "panelFoops";
const DOM_ID_PANEL_LINKED = "panelLinkedList";
const DOM_ID_DETAIL_BUTTON = "panelDetailButton";
const DOM_ID_LOADING_BAR = "loadingBar";
const DOM_ID_LOADING_BAR_PROGRESS = "loadingBarProgress";
const DOM_ID_LOADING_BAR_TEXT = "loadingBarText";

let network = null;
let ontologiesData = [];
let prefixMap = new Map();
let inDegreeMap = new Map();
let selectedNodeId = null;

async function initializeGraph() {
  const container = document.getElementById(DOM_ID_CONTAINER);
  if (!container) {
    console.error("Container #ontology-network-graph not found!");
    return;
  }

  try {
    const response = await fetch("data/Ontologies_forRepo.json");
    if (!response.ok) {
      throw new Error("Failed to fetch ontology data");
    }

    ontologiesData = await response.json();

    const { nodes, edges, domains } = buildGraphData(ontologiesData);

    renderLegend(domains);

    const data = {
      nodes: new vis.DataSet(nodes),
      edges: new vis.DataSet(edges),
    };

    const options = {
      configure: {
        enabled: false,
      },
      edges: {
        color: {
          inherit: true,
        },
        smooth: {
          enabled: true,
          type: "dynamic",
        },
        arrows: {
          to: { enabled: true, scaleFactor: 0.5 },
        },
      },
      interaction: {
        dragNodes: true,
        hideEdgesOnDrag: false,
        hideNodesOnDrag: false,
        hover: true,
      },
      physics: {
        enabled: true,
        stabilization: {
          enabled: true,
          fit: true,
          iterations: STABILIZATION_ITERATIONS,
          onlyDynamicEdges: false,
          updateInterval: 50,
        },
      },
      nodes: {
        shape: "dot",
        font: {
          size: FONT_SIZE,
        },
        borderWidth: 2,
      },
    };

    network = new vis.Network(container, data, options);

    setupPanelEvents();
    setupLoadingBar();

    network.on("click", function (params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const ontology = getOntologyByPrefix(nodeId);
        if (ontology) {
          openSidePanel(ontology);
        }
      } else {
        closeSidePanel();
      }
    });
  } catch (error) {
    console.error("Error loading graph:", error);
    container.innerHTML =
      '<div class="error-message">Error loading ontology data. Please try again later.</div>';
  }
}

function setupLoadingBar() {
  const loadingBar = document.getElementById(DOM_ID_LOADING_BAR);
  if (!loadingBar) {
    return;
  }

  network.on("stabilizationProgress", function (params) {
    loadingBar.style.display = "flex";
    loadingBar.style.opacity = "1";

    const progress = document.getElementById(DOM_ID_LOADING_BAR_PROGRESS);
    const text = document.getElementById(DOM_ID_LOADING_BAR_TEXT);

    if (progress && text) {
      const widthFactor = params.iterations / params.total;
      const percentage = Math.round(widthFactor * 100);
      progress.style.width = percentage + "%";
      text.textContent = percentage + "%";
    }
  });

  network.once("stabilizationIterationsDone", function () {
    const progress = document.getElementById(DOM_ID_LOADING_BAR_PROGRESS);
    const text = document.getElementById(DOM_ID_LOADING_BAR_TEXT);

    if (progress) progress.style.width = "100%";
    if (text) text.textContent = "100%";

    loadingBar.style.opacity = "0";
    setTimeout(function () {
      loadingBar.style.display = "none";
    }, 500);
  });
}

function buildGraphData(ontologies) {
  const nodes = [];
  const edges = [];
  const domains = new Set();
  prefixMap = new Map();

  ontologies.forEach((o) => {
    if (o.Prefix) {
      prefixMap.set(o.Prefix.toLowerCase(), o);
    }
  });

  inDegreeMap = new Map();
  ontologies.forEach((o) => {
    const linkedTo = o[DATA_FIELD_LINKED];
    if (linkedTo && typeof linkedTo === "string") {
      linkedTo.split(",").forEach((target) => {
        const targetPrefix = target.trim().toLowerCase();
        if (targetPrefix) {
          inDegreeMap.set(
            targetPrefix,
            (inDegreeMap.get(targetPrefix) || 0) + 1,
          );
        }
      });
    }
  });

  ontologies.forEach((o) => {
    if (!o || !o.Prefix) return;

    const prefix = o.Prefix.toLowerCase();
    const domain = o[DATA_FIELD_DOMAIN] || "Unknown";
    const color = DOMAIN_COLORS[domain] || DEFAULT_COLOR;

    domains.add(domain);

    const degree = inDegreeMap.get(prefix) || 0;
    const size = BASE_NODE_SIZE + degree * NODE_SIZE_SCALE;

    nodes.push({
      id: prefix,
      label: o.Prefix,
      color: color,
      size: size,
      font: { size: FONT_SIZE },
      labelHighlightBold: true,
    });

    const linkedTo = o[DATA_FIELD_LINKED];
    if (linkedTo && typeof linkedTo === "string") {
      linkedTo.split(",").forEach((target) => {
        const targetPrefix = target.trim().toLowerCase();
        if (targetPrefix && prefixMap.has(targetPrefix)) {
          edges.push({
            from: prefix,
            to: targetPrefix,
          });
        }
      });
    }
  });

  return { nodes, edges, domains: Array.from(domains).sort() };
}

function renderLegend(domains) {
  const legendContainer = document.getElementById(DOM_ID_LEGEND);
  if (!legendContainer) return;

  legendContainer.innerHTML = "";
  domains.forEach((domain) => {
    const color = DOMAIN_COLORS[domain] || DEFAULT_COLOR;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background-color: ${color}"></span>${domain}`;
    legendContainer.appendChild(item);
  });
}

function getOntologyByPrefix(prefix) {
  if (!prefix) return null;
  return prefixMap.get(prefix.toLowerCase()) || null;
}

function parseLinkedPrefixes(ontology) {
  const linkedTo = ontology?.[DATA_FIELD_LINKED];
  if (!linkedTo || typeof linkedTo !== "string") return [];

  return linkedTo
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}

function setupPanelEvents() {
  const closeButton = document.getElementById(DOM_ID_CLOSE_BUTTON);
  const overlay = document.getElementById(DOM_ID_PANEL_OVERLAY);

  if (!closeButton || !overlay) {
    return;
  }

  closeButton.addEventListener("click", closeSidePanel);
  overlay.addEventListener("click", closeSidePanel);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeSidePanel();
    }
  });
}

function openSidePanel(ontology) {
  const sidePanel = document.getElementById(DOM_ID_SIDE_PANEL);
  const overlay = document.getElementById(DOM_ID_PANEL_OVERLAY);
  if (!sidePanel || !overlay || !ontology || !ontology.Prefix) {
    return;
  }

  const ontologyPrefix = ontology.Prefix.toLowerCase();
  selectedNodeId = ontologyPrefix;

  const domain = ontology[DATA_FIELD_DOMAIN] || "Unknown";
  const connectionCount = inDegreeMap.get(ontologyPrefix) || 0;
  const linkedPrefixes = parseLinkedPrefixes(ontology);
  const classesCount = ontology[DATA_FIELD_CLASSES];
  const foopsScore = ontology[DATA_FIELD_FOOPS];

  const panelTitle = document.getElementById(DOM_ID_PANEL_TITLE);
  const panelPrefix = document.getElementById(DOM_ID_PANEL_PREFIX);
  const panelDomain = document.getElementById(DOM_ID_PANEL_DOMAIN);
  const panelDescription = document.getElementById(DOM_ID_PANEL_DESCRIPTION);
  const panelConnections = document.getElementById(DOM_ID_PANEL_CONNECTIONS);
  const panelClasses = document.getElementById(DOM_ID_PANEL_CLASSES);
  const panelFoops = document.getElementById(DOM_ID_PANEL_FOOPS);
  const panelLinkedList = document.getElementById(DOM_ID_PANEL_LINKED);
  const panelDetailButton = document.getElementById(DOM_ID_DETAIL_BUTTON);

  if (panelTitle) panelTitle.textContent = ontology.Title || ontology.Prefix;
  if (panelPrefix) panelPrefix.textContent = ontology.Prefix;

  if (panelDomain) {
    panelDomain.textContent = domain;
    panelDomain.style.backgroundColor = DOMAIN_COLORS[domain] || DEFAULT_COLOR;
  }

  if (panelDescription) {
    panelDescription.textContent =
      ontology[DATA_FIELD_DESCRIPTION] || "No description available.";
  }

  if (panelConnections) panelConnections.textContent = String(connectionCount);
  if (panelClasses) panelClasses.textContent = formatNumber(classesCount);
  if (panelFoops) panelFoops.textContent = formatScore(foopsScore);

  if (panelLinkedList) {
    panelLinkedList.innerHTML = "";

    if (linkedPrefixes.length === 0) {
      const emptyText = document.createElement("span");
      emptyText.textContent = "No linked AECO ontologies.";
      panelLinkedList.appendChild(emptyText);
    } else {
      linkedPrefixes.forEach((linkedPrefix) => {
        const linkedButton = document.createElement("button");
        linkedButton.type = "button";
        linkedButton.className = "linked-tag";
        linkedButton.textContent = linkedPrefix;
        linkedButton.addEventListener("click", function () {
          const linkedOntology = getOntologyByPrefix(linkedPrefix);
          if (linkedOntology && network) {
            network.focus(linkedPrefix, {
              scale: 1,
              animation: {
                duration: ANIMATION_DURATION,
                easingFunction: "easeInOutQuad",
              },
            });
            network.selectNodes([linkedPrefix]);
            openSidePanel(linkedOntology);
          }
        });
        panelLinkedList.appendChild(linkedButton);
      });
    }
  }

  if (panelDetailButton) {
    panelDetailButton.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(ontology.Title || ontology.Prefix)}`;
  }

  sidePanel.classList.add("open");
  sidePanel.setAttribute("aria-hidden", "false");
  overlay.classList.add("open");

  if (network) {
    network.selectNodes([ontologyPrefix]);
  }
}

function closeSidePanel() {
  const sidePanel = document.getElementById(DOM_ID_SIDE_PANEL);
  const overlay = document.getElementById(DOM_ID_PANEL_OVERLAY);

  if (sidePanel) {
    sidePanel.classList.remove("open");
    sidePanel.setAttribute("aria-hidden", "true");
  }

  if (overlay) {
    overlay.classList.remove("open");
  }

  if (network && selectedNodeId) {
    network.unselectAll();
  }

  selectedNodeId = null;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "-";
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
    }
    return trimmed;
  }
  return "-";
}

function formatScore(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "-";
    return value.toFixed(2);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "-";
    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) {
      return trimmed;
    }
    return numeric.toFixed(2);
  }
  return "-";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeGraph);
} else {
  initializeGraph();
}
