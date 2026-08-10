// This the  file for individual ontolgoy descriptions after the user clicks on the cards or on the See Details butyon

const TTL_FOLDER_PATH = 'data/source/Ontologies_TTL';

// Strip everything except letters/digits so prefixes and filenames can be compared loosely
function normalizeToken(value) {
    return (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Match an ontology's Prefix to a filename in available-ontologies.json: exact match first,
// then fall back to a "starts with" match either direction (handles cases like
// prefix "asb" -> file "asbingowl.ttl", or prefix "lca-c-renovation" -> "lca-c-reno.ttl")
function findTtlFilename(prefix, availableOntologies) {
    const cleanPrefix = normalizeToken(prefix);
    if (!cleanPrefix || !availableOntologies || !availableOntologies.length) {
        return null;
    }

    const withBase = availableOntologies.map((file) => ({
        file,
        base: normalizeToken(file.replace(/\.ttl$/i, ''))
    }));

    const exact = withBase.find(({ base }) => base === cleanPrefix);
    if (exact) {
        return exact.file;
    }

    const fuzzyMatches = withBase.filter(
        ({ base }) => base.startsWith(cleanPrefix) || cleanPrefix.startsWith(base)
    );
    if (!fuzzyMatches.length) {
        return null;
    }

    // Prefer whichever candidate's length is closest to the prefix itself
    fuzzyMatches.sort((a, b) => Math.abs(a.base.length - cleanPrefix.length) - Math.abs(b.base.length - cleanPrefix.length));
    return fuzzyMatches[0].file;
}

//Fetch and display ontology data dynamically
async function loadOntologyDetails() {
    // Get the ontology NAME from the URL string in the URL that comes from the displayOntologies function in ontology-cards.js
    const urlParams = new URLSearchParams(window.location.search);
    const ontologyName = urlParams.get('ontology');

    if (!ontologyName) {
        document.getElementById('ontology-details').innerHTML = 'No ontology found.';
        return;
    }

    try {
        // Fetch the ontology data and the list of available TTL files in parallel
        const [ontologiesResponse, availableOntologiesResponse] = await Promise.all([
            fetch('data/Ontologies_forRepo.json'),
            fetch(`${TTL_FOLDER_PATH}/available-ontologies.json`)
        ]);

        if (!ontologiesResponse.ok) {
            throw new Error('Failed to fetch ontology data');
        }

        const ontologies = await ontologiesResponse.json();
        const availableOntologies = availableOntologiesResponse.ok ? await availableOntologiesResponse.json() : [];
        const ontology = ontologies.find(o => o.Title === ontologyName); // Find the ontology by Title

        if (!ontology) {
            document.getElementById('ontology-details').innerHTML = 'Ontology not found.';
            return;
        }

        populateOntologyTable(ontology);  // create the table
        populateEvaluationTable(ontology);
        populateHierarchyStats(ontology);
        renderSpiderChart(ontology);
        await loadClassHierarchy(ontology, availableOntologies);

        // If the page was opened with a #section-id hash (e.g. from the TOC),
        // re-scroll to it now that the async-loaded content above has settled
        // the page height — otherwise the initial browser scroll-to-anchor
        // lands in the wrong place.
        if (window.location.hash) {
            const target = document.querySelector(window.location.hash);
            if (target) {
                requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
            }
        }
    } catch (error) {
        console.error('Error fetching ontology data:', error);
        document.getElementById('ontology-details').innerHTML = 'Error loading ontology data. Please try again later.';
    }
}


function populateOntologyTable(ontology) {

    // Update the page header with ontology Title
    const ontologyHeading = document.getElementById('ontology-heading');
    ontologyHeading.textContent = ontology.Title; // Set Title as the title

    const tableBody = document.querySelector('#ontology-table tbody');
    tableBody.innerHTML = ''; // Clear previous content

    function fieldValue(key) {
        const value = ontology[key];
        return (value === null || value === undefined || value === "") ? "&ndash;" : value;
    }

    function addRow(label, valueHtml) {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${label}</td><td>${valueHtml}</td>`;
        tableBody.appendChild(row);
    }

    // Order: Prefix, Description, Domains, then everything else, FOOPs Score last.
    addRow('Prefix', fieldValue('Prefix'));
    addRow('Description', `<p class="description-value">${ontology.Description || 'No description available.'}</p>`);
    addRow('Primary Domain', fieldValue('Primary Domain'));
    addRow('Secondary Domain', fieldValue('Secondary Domain'));
    addRow('Version', fieldValue('Version'));
    addRow('Created', fieldValue('Created'));
    addRow('Licence', fieldValue('License'));
    addRow('URI', ontology.URI ? `<a href="${ontology.URI}" target="_blank">${ontology.URI}</a>` : '&ndash;');
    addRow('Reference Source', fieldValue('Reference Source'));
    addRow('Conforms to Standard(s)', fieldValue('Conforms to Standard(s)'));
    addRow('Linked-to AECO Ontologies', fieldValue('Linked-to AECO Ontologies'));
    addRow('Linked-to Upper Ontologies', fieldValue('Linked-to Upper Ontologies'));
    addRow('Linked-by AECO Ontologies', fieldValue('Linked-by AECO Ontologies'));
    addRow('FOOPs Score', fieldValue('FOOPs Score'));

    // Check if "Cluster" exists and display ClusterName in the second box
    const clusterBox = document.getElementById('cluster-box');
    const tocClusterItem = document.getElementById('tocClusterItem');
    if (ontology["Cluster"]) {
        clusterBox.style.display = 'block'; // Make the cluster box visible
        clusterBox.querySelector('.cluster-name').textContent = ontology["Cluster"];
        if (tocClusterItem) tocClusterItem.style.display = 'block';
    } else {
        clusterBox.style.display = 'none'; // Hide the cluster box if not part of a cluster
        if (tocClusterItem) tocClusterItem.style.display = 'none';
    }
}

// Populates the Classes / Object properties / Data properties stat cards
// shown at the bottom of the Tree/Graph visualizer.
function populateHierarchyStats(ontology) {
    const statClasses = document.getElementById('statHierarchyClasses');
    const statObjectProps = document.getElementById('statHierarchyObjectProps');
    const statDataProps = document.getElementById('statHierarchyDataProps');

    if (statClasses) statClasses.textContent = ontology['Number of Classes'] ?? '-';
    if (statObjectProps) statObjectProps.textContent = ontology['Number of Object Properties'] ?? '-';
    if (statDataProps) statDataProps.textContent = ontology['Number of Data Properties'] ?? '-';
}

// Shows/hides the TTL download and URI link buttons next to the Tree/Graph toggle,
// depending on whether the ontology has a matched TTL file and/or a URI.
function populateHierarchyLinks(ttlFilename, uri, version) {
    const ttlLink = document.getElementById('hierarchy-ttl-link');
    const ttlLinkLabel = document.getElementById('hierarchy-ttl-link-label');
    const uriLink = document.getElementById('hierarchy-uri-link');

    if (ttlFilename) {
        ttlLink.href = `${TTL_FOLDER_PATH}/${ttlFilename}`;
        ttlLinkLabel.textContent = version ? `TTL - Version ${version}` : 'Download TTL';
        ttlLink.style.display = 'inline-block';
    } else {
        ttlLink.style.display = 'none';
    }

    if (uri) {
        uriLink.href = uri;
        uriLink.style.display = 'inline-block';
    } else {
        uriLink.style.display = 'none';
    }
}

// Fetch the ontology's TTL file (if available) and render its class hierarchy as a
// collapsible tree / vis-network graph, using the same Prefix -> filename matching as
// the "Ontology File" download row.
async function loadClassHierarchy(ontology, availableOntologies) {
    const statusEl = document.getElementById('hierarchy-status');
    const treeContainer = document.getElementById('hierarchy-tree-container');
    const graphContainer = document.getElementById('hierarchy-graph-container');
    const treeButton = document.getElementById('hierarchy-view-tree');
    const graphButton = document.getElementById('hierarchy-view-graph');

    const ttlFilename = findTtlFilename(ontology.Prefix, availableOntologies);
    populateHierarchyLinks(ttlFilename, ontology.URI, ontology.Version);

    if (!ttlFilename) {
        statusEl.textContent = 'Ontology file not available, so no class hierarchy can be shown.';
        treeButton.style.display = 'none';
        graphButton.style.display = 'none';
        treeContainer.style.display = 'none';
        graphContainer.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`${TTL_FOLDER_PATH}/${ttlFilename}`);
        if (!response.ok) {
            throw new Error('Failed to fetch TTL file');
        }
        const ttlText = await response.text();
        initHierarchyView(ttlText, { treeContainer, graphContainer, statusEl, treeButton, graphButton, ontologyTitle: ontology.Title });
    } catch (error) {
        console.error('Error loading class hierarchy:', error);
        statusEl.textContent = 'Error loading class hierarchy.';
        treeButton.style.display = 'none';
        graphButton.style.display = 'none';
        treeContainer.style.display = 'none';
        graphContainer.style.display = 'none';
    }
}

// Function to Populate Evaluation Table
function populateEvaluationTable(ontology) {
    const breakdown = document.getElementById("evaluation-breakdown");
    breakdown.innerHTML = ""; // Clear previous content

    // Define the fixed criteria and their corresponding keys in the JSON
    const evaluationCriteria = {
        "Connectivity": [
            { criteria: "Linkage to upper ontologies", key: "Linked-to Upper Ontologies" },
            { criteria: "Linkage to existing AECO ontologies", key: "Linked-to AECO Ontologies" },
            { criteria: "Linkage to meta schema ontologies", key: "Conforms to Standard(s)" }
        ],
        "Accessibility": [
            { criteria: "Conceptual Data model available", key: "Has Conceptual Model" },
            { criteria: "Accessible as Serialization", key: "Has Serialization" },
            { criteria: "Accessible as a URI", key: "URI" }
        ],
        "Documentation & Reuse": [
            { criteria: "Clearly documented", key: "Has Documentation" },
            { criteria: "Use of annotations", key: "Has Annotations" },
            { criteria: "Reused/Extended", key: "Is Reused by Other AECO Ontologies" }
        ]
    };

    // Axis score mappings (updated to match JSON column names)
    const axisScores = {
        "Connectivity": ontology["Alignment Score"] || 0,
        "Accessibility": ontology["Accessibility Score"] || 0,
        "Documentation & Reuse": ontology["Quality Score"] || 0
    };

    Object.entries(evaluationCriteria).forEach(([axis, criteriaList]) => {
        const axisBlock = document.createElement("div");
        axisBlock.className = "eval-axis-block";

        const criteriaRowsHtml = criteriaList.map((item) => {
            let value = ontology[item.key];
            let isYes = false;

            // Handle different value types
            if (value !== null && value !== undefined) {
                if (typeof value === 'number') {
                    isYes = value >= 1;
                } else if (typeof value === 'string') {
                    const trimmed = value.trim().toLowerCase();
                    isYes = trimmed !== "" && trimmed !== "no" && trimmed !== "n/a";
                }
            }

            return `
                <div class="eval-criteria-row">
                    <span class="eval-criteria-label">${item.criteria}</span>
                    <span class="eval-presence ${isYes ? 'eval-presence--yes' : 'eval-presence--no'}">
                        ${isYes ? '&#10003; Yes' : '&minus; No'}
                    </span>
                </div>
            `;
        }).join("");

        axisBlock.innerHTML = `
            <div class="eval-axis-header">
                <span class="eval-axis-name">${axis}</span>
                <span class="eval-axis-score">${axisScores[axis]} / 3</span>
            </div>
            ${criteriaRowsHtml}
        `;

        breakdown.appendChild(axisBlock);
    });
}


// Function to Render Spider Chart
function renderSpiderChart(ontology) {
    const ctx = document.getElementById("spiderChart").getContext("2d");

    new Chart(ctx, {
        type: "radar",
        data: {
            labels: ["Connectivity", "Accessibility", ["Documentation", "& Reuse"]],
            datasets: [
                {
                    label: ontology.Title,
                    data: [
                        ontology["Alignment Score"] || 0,
                        ontology["Accessibility Score"] || 0,
                        ontology["Quality Score"] || 0
                    ],
                    backgroundColor: "rgba(255, 99, 132, 0.2)",
                    borderColor: "rgba(255, 99, 132, 1)",
                    borderWidth: 2
                }
            ]
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
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

window.onload = loadOntologyDetails;
