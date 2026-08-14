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

        // Best-effort: lets search also match each ontology's TTL vocabulary
        // (class/property names + descriptions), not just its listed metadata.
        // Missing/failed load just means search falls back to metadata only.
        window.ttlSearchIndex = {};
        try {
            const indexResponse = await fetch('data/Ontologies_TTL_SearchIndex.json');
            if (indexResponse.ok) {
                const index = await indexResponse.json();
                window.ttlSearchIndex = index.ontologies || {};
            }
        } catch (indexError) {
            console.warn('TTL search index unavailable, falling back to metadata-only search:', indexError);
        }

        populateYearFilter(ontologies);
        applyCurrentView();
    } catch (error) {
        console.error('Error loading ontologies:', error);
        document.getElementById('ontology-container').innerHTML = '<p>Error loading ontologies. Please try again later.</p>';
    }
}



// Generate a spider chart and return it as a data URL
function generateSpiderChart(data) {
    const canvas = document.createElement('canvas');
    // Wider than the plotted shape needs, so the east/west axis labels
    // (Accessibility / Governance) have room to sit outside the diamond
    // without being clipped by the canvas edge. Stays square (1:1), so the
    // card's object-fit:cover crop framing is unaffected.
    canvas.width = 380;
    canvas.height = 380;
    const ctx = canvas.getContext('2d');

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 100; // Full axis length
    const labels = ['Connectivity', 'Accessibility', 'Documentation & Reuse', 'Governance'];
    // Evenly spaced around the circle (starting at the top), however many axes there are.
    const angles = labels.map((_, i) => (2 * Math.PI * i) / labels.length - Math.PI / 2);
    const values = labels.map((label) => data[label] || 0);
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
        ontologyLink.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(ontology.Title)}`;
        ontologyLink.classList.add('card-link');

        // Generate spider chart for the ontology (updated field names)
        const spiderChartUrl = generateSpiderChart({
            Connectivity: ontology["Alignment Score"],
            Accessibility: ontology["Accessibility Score"],
            "Documentation & Reuse": ontology["Quality Score"],
            Governance: ontology["Governance Score"],
        });

        // Check if the URI is missing. If missing, route to the missingURI.html - 20251202
        const rawURI = ontology.URI ? ontology.URI.toString().trim() : "";
        const isMissingURI = rawURI === "" || rawURI.toLowerCase() === "n/a";

        // If missing:
        const resolvedURI = isMissingURI ? "missingURI.html" : rawURI;

        // Create the card content (updated field names)
        ontologyLink.innerHTML = `
            <div class="media">
                <img src="${spiderChartUrl}" alt="Spider Chart">
            </div>
            <div class="content">
                <div class="name">${ontology.Title}</div>
                <div class="acronym">${ontology.Prefix || 'N/A'}</div>
                <div class="details">
                    <span><strong>Primary Domain:</strong> ${ontology['Primary Domain']}</span>
                    <span><strong>Secondary Domain:</strong> ${ontology['Secondary Domain'] || 'N/A'}</span>
                    <span><strong>FAIR Score:</strong> ${ontology['FOOPs Score'] || 'N/A'}</span>
                    <span><strong>${ontology['Created'] || 'Publication year unknown'}</strong></span>
                </div>
                <div class="buttons">
                    <button class="see-details">See Details</button>
                    <a href="${resolvedURI}" target="_blank" class="go-to-ontology-btn">See Ontology</a>
                </div>
            </div>
        `;

        card.appendChild(ontologyLink);
        container.appendChild(card);
    });
}


// Search text, domain, and year all narrow the same underlying list together
// (instead of each one resetting the others), and sorting applies on top.
const filterState = { search: '', domain: 'all', year: 'all' };
let currentSort = 'relevance';
let currentSortDir = 'desc';

// Sort fields where "biggest number first" is the more useful default;
// everything else (name, domain) defaults to ascending (A-Z).
const DESC_BY_DEFAULT = new Set([
    'fair', 'quality', 'accessibility', 'alignment', 'annotation', 'governance',
    'classes', 'object-properties', 'data-properties', 'connectivity', 'year',
]);

// Extracts a 4-digit year from the (inconsistently formatted) Created field.
function extractYear(value) {
    if (!value) return 0;
    const match = String(value).match(/\d{4}/);
    return match ? Number(match[0]) : 0;
}

// Counts how many other ontologies this one links to, as a simple stand-in
// for "Connectivity (links)".
function countLinks(ontology) {
    const linked = ontology['Linked-to AECO Ontologies'];
    if (!linked || typeof linked !== 'string') return 0;
    return linked.split(',').map((s) => s.trim()).filter(Boolean).length;
}

function computeFilteredList() {
    let list = window.ontologiesData || [];

    if (filterState.search) {
        const query = filterState.search.toLowerCase();
        const ttlIndex = window.ttlSearchIndex || {};
        list = list.filter((ontology) => {
            const metadataMatch = Object.values(ontology).some((value) =>
                value && String(value).toLowerCase().includes(query)
            );
            if (metadataMatch) return true;

            // Fall back to the ontology's own TTL vocabulary (class/property
            // names + descriptions), so e.g. searching a class name finds the
            // ontology even if that term isn't mentioned in its metadata.
            const ttlEntry = ontology.Prefix && ttlIndex[ontology.Prefix];
            return !!(ttlEntry && ttlEntry.text && ttlEntry.text.toLowerCase().includes(query));
        });
    }

    if (filterState.domain !== 'all') {
        list = list.filter((ontology) =>
            (ontology['Primary Domain'] || '').toLowerCase() === filterState.domain.toLowerCase()
        );
    }

    if (filterState.year !== 'all') {
        if (filterState.year === 'unknown') {
            list = list.filter((ontology) => extractYear(ontology.Created) === 0);
        } else {
            const year = Number(filterState.year);
            list = list.filter((ontology) => extractYear(ontology.Created) === year);
        }
    }

    return list;
}

function sortOntologies(list, criterion, direction) {
    const sorted = [...list];
    const dir = direction === 'asc' ? 1 : -1;
    const byNumber = (field) => (a, b) => dir * ((Number(a[field]) || 0) - (Number(b[field]) || 0));
    const byText = (field) => (a, b) => dir * String(a[field] || '').localeCompare(String(b[field] || ''));

    switch (criterion) {
        case 'name':
            sorted.sort(byText('Title'));
            break;
        case 'domain':
            sorted.sort(byText('Primary Domain'));
            break;
        case 'fair':
            sorted.sort(byNumber('FOOPs Score'));
            break;
        case 'quality':
            sorted.sort(byNumber('Quality Score'));
            break;
        case 'accessibility':
            sorted.sort(byNumber('Accessibility Score'));
            break;
        case 'alignment':
            sorted.sort(byNumber('Alignment Score'));
            break;
        case 'governance':
            sorted.sort(byNumber('Governance Score'));
            break;
        case 'annotation':
            sorted.sort(byNumber('Annotation Score'));
            break;
        case 'classes':
            sorted.sort(byNumber('Number of Classes'));
            break;
        case 'object-properties':
            sorted.sort(byNumber('Number of Object Properties'));
            break;
        case 'data-properties':
            sorted.sort(byNumber('Number of Data Properties'));
            break;
        case 'connectivity':
            sorted.sort((a, b) => dir * (countLinks(a) - countLinks(b)));
            break;
        case 'year':
            sorted.sort((a, b) => dir * (extractYear(a.Created) - extractYear(b.Created)));
            break;
        default:
            break; // relevance = original dataset order
    }
    return sorted;
}

// Re-filters and re-sorts from the full dataset, called after any search,
// domain-filter, year-filter, or sort-order change.
function applyCurrentView() {
    const filtered = computeFilteredList();
    displayOntologies(sortOntologies(filtered, currentSort, currentSortDir));
}

// Function to filter ontologies based on a search query for any keyword. This function is dynamic and shows the cards as the user types
function filterOntologies(query) {
    filterState.search = (query || '').trim();
    applyCurrentView();
}

// Function to handle primary domain button clicks for the top box
function filterByDomain(domain) {
    filterState.domain = domain === 'All' ? 'all' : domain;
    applyCurrentView();
}

// Builds the Year dropdown from whatever years actually appear in the data,
// rather than a hardcoded range.
function populateYearFilter(ontologies) {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;

    const years = new Set();
    let hasUnknown = false;
    ontologies.forEach((ontology) => {
        const year = extractYear(ontology.Created);
        if (year) years.add(year);
        else hasUnknown = true;
    });

    const sortedYears = Array.from(years).sort((a, b) => b - a);
    const options = ['<option value="all">All Years</option>']
        .concat(sortedYears.map((year) => `<option value="${year}">${year}</option>`));
    if (hasUnknown) options.push('<option value="unknown">Unknown</option>');
    yearSelect.innerHTML = options.join('');
}

function updateSortDirectionButton() {
    const btn = document.getElementById('sortDirectionToggle');
    if (!btn) return;
    btn.classList.toggle('asc', currentSortDir === 'asc');
    btn.title = currentSortDir === 'asc' ? 'Ascending' : 'Descending';
}

// Event listener for the search function
document.getElementById('searchInput').addEventListener('input', (e) => {
    filterOntologies(e.target.value);
});

// Event listener for the sort dropdown
document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    currentSortDir = DESC_BY_DEFAULT.has(currentSort) ? 'desc' : 'asc';
    updateSortDirectionButton();
    applyCurrentView();
});

// Event listener for the Asc/Desc toggle
document.getElementById('sortDirectionToggle').addEventListener('click', () => {
    currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    updateSortDirectionButton();
    applyCurrentView();
});

// Event listener for the year dropdown
document.getElementById('yearSelect').addEventListener('change', (e) => {
    filterState.year = e.target.value;
    applyCurrentView();
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
