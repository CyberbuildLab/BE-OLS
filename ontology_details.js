// individualOntologyDetail.js

// Function to get the query parameter from the URL
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Function to fetch ontology data based on the name
async function fetchOntologyData(ontologyName) {
    try {
        const response = await fetch('data/Ontologies_forRepo.json'); // Make sure this path is correct
        if (!response.ok) {
            throw new Error('Failed to fetch ontology data');
        }

        const ontologies = await response.json();
        const ontologyData = ontologies.find(ontology => ontology.Name === ontologyName);
        
        if (ontologyData) {
            populateOntologyTable(ontologyData);
        } else {
            document.getElementById('ontology-details').innerHTML = '<p>Ontology not found.</p>';
        }
    } catch (error) {
        console.error('Error fetching ontology data:', error);
        document.getElementById('ontology-details').innerHTML = '<p>Error loading ontology data. Please try again later.</p>';
    }
}

// Function to populate the ontology details table
function populateOntologyTable(ontologyData) {
    const tableBody = document.querySelector('#ontology-table tbody');
    
    // Clear previous content
    tableBody.innerHTML = '';
    
    // Add new rows for each field in the ontology data
    for (const key in ontologyData) {
        if (ontologyData.hasOwnProperty(key)) {
            const row = document.createElement('tr');
            const cell1 = document.createElement('td');
            const cell2 = document.createElement('td');

            cell1.textContent = key;
            cell2.textContent = ontologyData[key] || 'N/A';

            row.appendChild(cell1);
            row.appendChild(cell2);
            tableBody.appendChild(row);
        }
    }
}

// Fetch and display ontology details when the page loads
window.onload = function () {
    const ontologyName = getQueryParam('ontology');
    if (ontologyName) {
        fetchOntologyData(ontologyName);  // Fetch data based on the ontology name
    } else {
        document.getElementById('ontology-details').innerHTML = '<p>No ontology selected.</p>';
    }
};
