// This the  file for individual ontolgoy descriptions after the user clicks on the cards or on the See Details butyon

// Fetch and display ontology data dynamically 
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
        const ontology = ontologies.find(o => o.Name === ontologyName); // Find the ontology by name

        if (!ontology) {
            document.getElementById('ontology-details').innerHTML = 'Ontology not found.';
            return;
        }

        populateOntologyTable(ontology);  // create the table
    } catch (error) {
        console.error('Error fetching ontology data:', error);
        document.getElementById('ontology-details').innerHTML = 'Error loading ontology data. Please try again later.';
    }
}

// Function to create and populate the ontology table
function populateOntologyTable(ontology) {
    const tableBody = document.querySelector('#ontology-table tbody');
    tableBody.innerHTML = '';  

    // Populate the table with data
    Object.keys(ontology).forEach(key => {
        if (ontology[key] !== null) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${key}</td>
                <td>${ontology[key]}</td>
            `;
            tableBody.appendChild(row);
        }
    });
}


window.onload = loadOntologyDetails;
