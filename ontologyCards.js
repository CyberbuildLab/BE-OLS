// This the main file for all functions that display the ontology cards

// Fetch and display ontology data dynamically from a JSON file
async function loadOntologies() {
    try {
        const response = await fetch('data/Ontologies_forRepo.json'); 
        if (!response.ok) {
            throw new Error('Failed to fetch JSON file');
        }

        const ontologies = await response.json(); 
        window.ontologiesData = ontologies; 
        console.log('Ontologies loaded:', ontologies); 
        displayOntologies(ontologies); 
    } catch (error) {
        console.error('Error loading ontologies:', error);
        document.getElementById('ontology-container').innerHTML = '<p>Error loading ontologies. Please try again later.</p>';
    }
}

// Function to display ontologies
function displayOntologies(ontologies) {
    const container = document.getElementById('ontology-container');
    container.innerHTML = '';  
    ontologies.forEach(ontology => {
        const card = document.createElement('div');
        card.classList.add('card');

        // This part is for making the individualOntologyDetail.html tailored to each ontology based on their Name in the JSON file
        // Create the link that directs to individualOntologyDetail.html with the ontology name as a query parameter
        const ontologyLink = document.createElement('a');
        ontologyLink.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(ontology.Name)}`; // URL with query parameter
        ontologyLink.classList.add('card-link');  

        // content inside the ontology cards:
        ontologyLink.innerHTML = `
            <div class="media">
                <img src="images/EC3SpiderChart.png" alt="EC3 Spider Chart">
            </div>
            <div class="content">
                <div class="name">${ontology.Name}</div>
                <div class="acronym">${ontology.Acronym || 'N/A'}</div>
                <div class="details">
                    <span><strong>FOOPS Score:</strong> ${ontology.FOOPSScore || 'N/A'}</span>
                    <span><strong>Primary Domain:</strong> ${ontology['Primary Domain']}</span>
                    <span><strong>Secondary Domain:</strong> ${ontology['Secondary Domain'] || 'N/A'}</span>
                </div>
                <div class="buttons">
                    <button class="see-details">
                        See Details
                    </button>
                    <a href="${ontology.URI}" target="_blank" class="go-to-ontology-btn">
                        See Ontology
                    </a>
                </div>
            </div>
        `;

        // Append the ontologyLink 
        card.appendChild(ontologyLink);
        container.appendChild(card);  // Add the card to the container
    });
}

// Function to filter ontologies based on a search query for any keyword. This function is dynamic and shows the cards as the user types
function filterOntologies(query) {
    const filtered = window.ontologiesData.filter(ontology =>
        Object.values(ontology).some(value =>
            value && String(value).toLowerCase().includes(query.toLowerCase())
        )
    );
    displayOntologies(filtered);
}

// Function to handle primary domain button clicks for the top box
function filterByDomain(domain) {
    if (domain === 'all') {
        displayOntologies(window.ontologiesData);  
    } else {
        const filtered = window.ontologiesData.filter(ontology =>
            ontology['Primary Domain'] && ontology['Primary Domain'].toLowerCase() === domain.toLowerCase()
        );
        displayOntologies(filtered);
    }
}

// Event listener for the search function
document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();  // Get the search input value
    filterOntologies(query); // Call the search function with the query
});

// Event listener for primary domain buttons (including the "All" button)
const primaryDomainButtons = document.querySelectorAll('.primary-domain-btn');
primaryDomainButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        const domain = e.target.innerText.trim();
        filterByDomain(domain); // Filter based on primary domain
    });
});

// Load ontologies when the page is loaded
window.onload = loadOntologies;
