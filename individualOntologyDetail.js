// This the  file for individual ontolgoy descriptions after the user clicks on the cards or on the See Details butyon

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
        // Fetch the ontology data from the JSON file
        const response = await fetch('data/Ontologies_forRepo.json');
        if (!response.ok) {
            throw new Error('Failed to fetch ontology data');
        }

        const ontologies = await response.json();
        const ontology = ontologies.find(o => o.Title === ontologyName); // Find the ontology by Title

        if (!ontology) {
            document.getElementById('ontology-details').innerHTML = 'Ontology not found.';
            return;
        }

        populateOntologyTable(ontology);  // create the table
        populateEvaluationTable(ontology);
        renderSpiderChart(ontology);
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
    
    // Define the desired order of fields (updated to match JSON column names)
    const fieldOrder = [
        "Title",
        "Prefix",
        "Created",
        "Version",
        "License",
        "URI",
        "FOOPs Score",
        "Description",
        "Conforms to Standard(s)",
        "Primary Domain",
        "Secondary Domain",
        "Reference Source",
        "Linked-to AECO Ontologies",
        "Linked-to Upper Ontologies",
        "Linked-by AECO Ontologies",
        "Number of Classes",
        "Number of Object Properties",
        "Number of Data Properties",
    ];

    // Populate the table in the defined order
    fieldOrder.forEach((key) => {
        let value = ontology[key];
        
        // Show blank for null/undefined values instead of hiding the row
        if (value === null || value === undefined) {
            value = "";
        }

        // Make URI a clickable link
        if (key === "URI" && value) {
            value = `<a href="${value}" target="_blank">${value}</a>`;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${key}</td>
            <td>${value}</td>
        `;
        tableBody.appendChild(row);
    });

    // Check if "Cluster" exists and display ClusterName in the second box
    const clusterBox = document.getElementById('cluster-box');
    if (ontology["Cluster"]) {
        clusterBox.style.display = 'block'; // Make the cluster box visible
        clusterBox.querySelector('.cluster-name').textContent = ontology["Cluster"];
    } else {
        clusterBox.style.display = 'none'; // Hide the cluster box if not part of a cluster
    }
}

// Function to Populate Evaluation Table
function populateEvaluationTable(ontology) {
    const tableBody = document.querySelector("#evaluation-table tbody");
    tableBody.innerHTML = ""; // Clear previous content

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
        criteriaList.forEach((item, index) => {
            let value = ontology[item.key];
            let presence = "No";
            
            // Handle different value types
            if (value !== null && value !== undefined) {
                if (typeof value === 'number') {
                    presence = value >= 1 ? "Yes" : "No";
                } else if (typeof value === 'string') {
                    const trimmed = value.trim().toLowerCase();
                    presence = (trimmed !== "" && trimmed !== "no" && trimmed !== "n/a") ? "Yes" : "No";
                }
            }

            const row = document.createElement("tr");
            
            // First row of the axis group: Merge Evaluation Axis & Axis Score columns
            if (index === 0) {
                row.innerHTML = `
                    <td rowspan="${criteriaList.length}" style="vertical-align: middle; text-align: center; font-weight: bold;">${axis}</td>
                    <td>${item.criteria}</td>
                    <td>${presence}</td>
                    <td rowspan="${criteriaList.length}" style="vertical-align: middle; text-align: center; font-weight: bold;">${axisScores[axis]}</td>
                `;
            } else {
                row.innerHTML = `
                    <td>${item.criteria}</td>
                    <td>${presence}</td>
                `;
            }
            
            tableBody.appendChild(row);
        });
    });
}


// Function to Render Spider Chart
function renderSpiderChart(ontology) {
    const ctx = document.getElementById("spiderChart").getContext("2d");

    new Chart(ctx, {
        type: "radar",
        data: {
            labels: ["Connectivity", "Accessibility", "Documentation & Reuse"],
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
            scales: {
                r: {
                    suggestedMin: 0,
                    suggestedMax: 3
                }
            }
        }
    });
}

window.onload = loadOntologyDetails;
