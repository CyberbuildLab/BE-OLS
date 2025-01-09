// Fetch and display ontology data dynamically
async function loadOntologies() {
    try {
        const response = await fetch('data/Ontologies_forRepo.json'); // Ensure the JSON file path is correct
        if (!response.ok) {
            throw new Error('Failed to fetch JSON file');
        }

        const ontologies = await response.json(); // Parse the JSON data
        console.log('Ontologies loaded:', ontologies); // Log for debugging
        displayOntologies(ontologies);
    } catch (error) {
        console.error('Error loading ontologies:', error);
        document.getElementById('ontology-container').innerHTML = '<p>Error loading ontologies. Please try again later.</p>';
    }
}

// Function to map primary domain to corresponding image paths
function getCategoryImage(category) {
    switch (category?.toLowerCase()) {
        case 'information management':
            return 'images/information_management.png';
        case 'circular economy':
            return 'images/circular_economy.png';
        case 'be product (building)':
            return 'images/be_product_building.png';
        case 'be product (infrastructure)':
            return 'images/be_product_infrastructure.png';
        default:
            return 'images/default_category.png';
    }
}

function displayOntologies(ontologies) {
    const container = document.getElementById('ontology-container');
    container.innerHTML = ''; // Clear previous content

    ontologies.forEach(ontology => {
        const card = document.createElement('div');
        card.classList.add('ontology-card');

        card.innerHTML = `
            <div class="card-header">${ontology.Acronym || 'N/A'}</div>
            <div class="card-name">${ontology.Name || 'Unnamed Ontology'}</div>
            <div class="circle">${ontology.EC3Web || 'N/A'}</div>
            <div class="card-content">FOOPS Score: ${ontology['FOOPS Score'] || 'N/A'}</div>
            <div class="card-content">Primary Domain: ${ontology['Primary Domain'] || 'N/A'}</div>
            <div class="card-content">Secondary Domain: ${ontology['Secondary Domain'] || 'N/A'}</div>
            <div class="card-description">${ontology['Short Description'] || 'No description available.'}</div>
        `;

        container.appendChild(card);
    });
}


// Function to filter ontologies based on a search query
function filterOntologies() {
    const query = document.getElementById('searchInput').value.toLowerCase();

    fetch('Ontologies_forRepo.json')
        .then(response => response.json())
        .then(ontologies => {
            const filtered = ontologies.filter(ontology =>
                Object.values(ontology).some(value =>
                    value && String(value).toLowerCase().includes(query)
                )
            );
            displayOntologies(filtered);
        })
        .catch(error => console.error('Error filtering ontologies:', error));
}

// Load ontologies when the page is loaded
window.onload = loadOntologies;

// Expose the filter function for search input
window.filterOntologies = filterOntologies;
