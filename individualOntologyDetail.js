// Fetch and display ontology data dynamically based on the query parameter
async function loadOntologyDetails() {
    // Get the ontology name from the query string in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const ontologyName = urlParams.get('ontology'); // Get the ontology name from the URL

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

        populateOntologyTable(ontology);  // Populate the details in the table
    } catch (error) {
        console.error('Error fetching ontology data:', error);
        document.getElementById('ontology-details').innerHTML = 'Error loading ontology data. Please try again later.';
    }
}

// Function to populate the ontology details in the table
function populateOntologyTable(ontology) {
    const tableBody = document.querySelector('#ontology-table tbody');
    tableBody.innerHTML = '';  // Clear existing rows

    // Populate table with ontology data
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

// Load ontology details when the page is loaded
window.onload = loadOntologyDetails;
