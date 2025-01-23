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


// Generate a spider chart and return it as a data URL
function generateSpiderChart(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 100; // Full axis length
    const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
    const values = [
        data.Alignment || 0,
        data.Accessibility || 0,
        data.Quality || 0,
    ];
    const maxValue = 3; // 3 segments

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw concentric rings for the 3 segments
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let i = 1; i <= maxValue; i++) {
        const stepRadius = (i / maxValue) * radius; // 1/3rd, 2/3rd, full radius
        ctx.beginPath();
        angles.forEach((angle, index) => {
            const x = centerX + stepRadius * Math.cos(angle);
            const y = centerY + stepRadius * Math.sin(angle);
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 1;
    angles.forEach((angle) => {
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        ctx.lineTo(x, y);
        ctx.stroke();
    });

    // Add axis labels
    const labels = ['Alignment', 'Accessibility', 'Quality'];
    ctx.font = '14px Arial';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach((label, index) => {
        const angle = angles[index];
        const labelX = centerX + (radius + 20) * Math.cos(angle);
        const labelY = centerY + (radius + 20) * Math.sin(angle);
        ctx.fillText(label, labelX, labelY);
    });

    // Draw the data points and red-filled polygon
    ctx.strokeStyle = '#ff0000';
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'; // Transparent red fill
    ctx.beginPath();
    values.forEach((value, index) => {
        const pointRadius = (value / maxValue) * radius; // 0, 1/3, 2/3, or full radius
        const angle = angles[index];
        const x = centerX + pointRadius * Math.cos(angle);
        const y = centerY + pointRadius * Math.sin(angle);

        if (index === 0) ctx.moveTo(x, y); // Move to the first point
        else ctx.lineTo(x, y); // Draw a line to the next point
    });
    ctx.closePath(); // Close the polygon path
    ctx.fill(); // Fill the polygon with the red color
    ctx.stroke(); // Outline the polygon

    // Draw data points (red dots)
    values.forEach((value, index) => {
        const pointRadius = (value / maxValue) * radius; // Scale to 0, 1/3, 2/3, or full radius
        const angle = angles[index];
        const x = centerX + pointRadius * Math.cos(angle);
        const y = centerY + pointRadius * Math.sin(angle);

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI); // Draw the point as a circle
        ctx.fillStyle = '#ff0000'; // Red color for the points
        ctx.fill();
    });

    return canvas.toDataURL(); // Return the canvas as a data URL
}




// Display ontologies with spider charts
function displayOntologies(ontologies) {
    const container = document.getElementById('ontology-container');
    container.innerHTML = ''; // Clear existing content

    ontologies.forEach((ontology) => {
        const card = document.createElement('div');
        card.classList.add('card');

        const ontologyLink = document.createElement('a');
        ontologyLink.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(ontology.Name)}`;
        ontologyLink.classList.add('card-link');

        // Generate spider chart for the ontology
        const spiderChartUrl = generateSpiderChart({
            Alignment: ontology.Alignment,
            Accessibility: ontology.Accessability,
            Quality: ontology.Quality,
        });

        // Create the card content
        ontologyLink.innerHTML = `
            <div class="media">
                <img src="${spiderChartUrl}" alt="Spider Chart">
            </div>
            <div class="content">
                <div class="name">${ontology.Name}</div>
                <div class="acronym">${ontology.Acronym || 'N/A'}</div>
                <div class="details">
                    <span><strong>Primary Domain:</strong> ${ontology['Primary Domain']}</span>
                    <span><strong>Secondary Domain:</strong> ${ontology['Secondary Domain'] || 'N/A'}</span>
                </div>
                <div class="buttons">
                    <button class="see-details">See Details</button>
                    <a href="${ontology.URI}" target="_blank" class="go-to-ontology-btn">See Ontology</a>
                </div>
            </div>
        `;

        card.appendChild(ontologyLink);
        container.appendChild(card);
    });
}



// // Function to display ontologies
// function displayOntologies(ontologies) {
//     const container = document.getElementById('ontology-container');
//     container.innerHTML = '';  
//     ontologies.forEach(ontology => {
//         const card = document.createElement('div');
//         card.classList.add('card');

//         // This part is for making the individualOntologyDetail.html tailored to each ontology based on their Name in the JSON file
//         // Create the link that directs to individualOntologyDetail.html with the ontology name as a query parameter
//         const ontologyLink = document.createElement('a');
//         ontologyLink.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(ontology.Name)}`; // URL with query parameter
//         ontologyLink.classList.add('card-link');  

//         // content inside the ontology cards:
//         ontologyLink.innerHTML = `
//             <div class="media">
//                 <img src="images/EC3SpiderChart.png" alt="EC3 Spider Chart">
//             </div>
//             <div class="content">
//                 <div class="name">${ontology.Name}</div>
//                 <div class="acronym">${ontology.Acronym || 'N/A'}</div>
//                 <div class="details">
//                     <span><strong>FOOPS Score:</strong> ${ontology.FOOPSScore || 'N/A'}</span>
//                     <span><strong>Primary Domain:</strong> ${ontology['Primary Domain']}</span>
//                     <span><strong>Secondary Domain:</strong> ${ontology['Secondary Domain'] || 'N/A'}</span>
//                 </div>
//                 <div class="buttons">
//                     <button class="see-details">
//                         See Details
//                     </button>
//                     <a href="${ontology.URI}" target="_blank" class="go-to-ontology-btn">
//                         See Ontology
//                     </a>
//                 </div>
//             </div>
//         `;

//         // Append the ontologyLink 
//         card.appendChild(ontologyLink);
//         container.appendChild(card);  // Add the card to the container
//     });
// }

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
