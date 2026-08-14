// Analytics dashboard: ranked lists, domain coverage, ontologies-over-time
// chart, and the compare-ontologies tool. All widgets read from the same
// dataset used by the ontology cards and network graph pages.

const DATA_URL = 'data/Ontologies_forRepo.json';

// Full dataset, kept around so every widget (ranked lists, the year/domain
// drill-down modal, compare) can re-derive its view without re-fetching.
let allOntologiesData = [];

const DOMAIN_CSS_VAR = {
    'Information Management': '--domain-information-management',
    'Production (Process)': '--domain-production-process',
    'Energy': '--domain-energy',
    'Planning Permission': '--domain-planning-permission',
    'Facilities Management': '--domain-facilities-management',
    'BE Product (Infrastructure)': '--domain-be-product-infrastructure',
    'Safety': '--domain-safety',
    'Circular Economy': '--domain-circular-economy',
    'Resources': '--domain-resources',
    'Comfort': '--domain-comfort',
    'Geographic Information': '--domain-geographic-information',
    'BE Product (Building)': '--domain-be-product-building',
    'Geometry': '--domain-geometry',
    'Quality': '--domain-quality',
    'IoT Sensors/Actuators': '--domain-iot-sensors-actuators',
    'Weather/Climate': '--domain-weather-climate',
    'Materials': '--domain-materials',
    'Mobility/Transport': '--domain-mobility-transport',
    'Fire Safety': '--domain-fire-safety',
    'Standards, Codes and Certifications': '--domain-standards-codes-and-certifications',
};

let domainColorCache = null;

// Resolves a domain name to its hex color, reading the palette once from the
// CSS custom properties defined in analytics.css (single source of truth).
function getDomainColor(domain) {
    if (!domainColorCache) {
        const styles = getComputedStyle(document.documentElement);
        domainColorCache = { default: styles.getPropertyValue('--domain-default').trim() || '#999999' };
        Object.entries(DOMAIN_CSS_VAR).forEach(([name, varName]) => {
            const value = styles.getPropertyValue(varName).trim();
            if (value) domainColorCache[name] = value;
        });
    }
    return domainColorCache[domain] || domainColorCache.default;
}

function getAccentMark() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent-mark').trim() || '#df8f15';
}

// Splits a comma-separated field (e.g. "Linked-to AECO Ontologies") into
// trimmed, non-empty tokens.
function splitList(value) {
    if (!value || typeof value !== 'string') return [];
    return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function extractYear(value) {
    if (!value) return null;
    const match = String(value).match(/\d{4}/);
    return match ? Number(match[0]) : null;
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

// A ratio is only meaningful when the denominator is non-zero; ontologies
// with a zero denominator are excluded from that ranking rather than shown
// as Infinity.
function safeRatio(numeratorRaw, denominatorRaw) {
    const den = toNumber(denominatorRaw);
    if (!den) return null;
    return toNumber(numeratorRaw) / den;
}

function formatScore(value) {
    if (value === null || value === undefined || value === '') return '–';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// -------------------- Overview stat tiles --------------------

function renderStatTiles(ontologies) {
    const container = document.getElementById('statTiles');
    if (!container) return;

    const totalClasses = ontologies.reduce((sum, o) => sum + toNumber(o['Number of Classes']), 0);
    const totalObjectProperties = ontologies.reduce((sum, o) => sum + toNumber(o['Number of Object Properties']), 0);
    const totalDataProperties = ontologies.reduce((sum, o) => sum + toNumber(o['Number of Data Properties']), 0);
    const reusedCount = ontologies.filter((o) => splitList(o['Linked-by AECO Ontologies']).length > 0).length;
    const domainCount = new Set(
        ontologies.map((o) => (o['Primary Domain'] || '').trim()).filter(Boolean)
    ).size;

    const tiles = [
        { label: 'Ontologies', value: ontologies.length },
        { label: 'Classes', value: totalClasses },
        { label: 'Object properties', value: totalObjectProperties },
        { label: 'Data properties', value: totalDataProperties },
        { label: 'Reused AECO ontologies', value: reusedCount },
        { label: 'Domains covered', value: domainCount },
    ];

    container.innerHTML = tiles.map((tile) => `
        <div class="stat-tile">
            <div class="stat-tile-value">${tile.value.toLocaleString()}</div>
            <div class="stat-tile-label">${tile.label}</div>
        </div>
    `).join('');
}

// -------------------- Shared ranked-list controls --------------------

// Reads a "Show top" <select> (10 / 20 / custom) + its paired number input.
function getTopN(selectId, customId, fallback = 10) {
    const select = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    if (!select) return fallback;
    if (select.value === 'custom') {
        const n = parseInt(custom ? custom.value : '', 10);
        return Number.isFinite(n) && n > 0 ? n : fallback;
    }
    return parseInt(select.value, 10) || fallback;
}

function setupTopNControl(selectId, customId, onChange) {
    const select = document.getElementById(selectId);
    const custom = document.getElementById(customId);
    if (!select || !custom) return;
    select.addEventListener('change', () => {
        custom.hidden = select.value !== 'custom';
        if (select.value === 'custom') custom.focus();
        onChange();
    });
    custom.addEventListener('input', onChange);
}

// Shows/hides the "N hidden — Reset" link next to a widget's controls.
function updateResetButton(buttonId, excludedSet, onReset) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    if (excludedSet.size === 0) {
        button.hidden = true;
        button.onclick = null;
        return;
    }
    button.hidden = false;
    button.textContent = `${excludedSet.size} hidden — Reset`;
    button.onclick = onReset;
}

// Double-clicking a ranked-list row jumps to that ontology's detail page,
// matching the rest of the site's linking convention (title-keyed).
function setupRankedListNavigation(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('dblclick', (e) => {
        if (e.target.closest('.ranked-remove')) return; // don't navigate when double-clicking the "x"
        const row = e.target.closest('.ranked-row');
        if (!row) return;
        const nameEl = row.querySelector('.ranked-name');
        if (!nameEl) return;
        window.location.href = `individualOntologyDetail.html?ontology=${encodeURIComponent(nameEl.textContent)}`;
    });
}

// Wires the delegated click handler for a ranked list's per-row remove (x)
// buttons, adding the removed ontology's title to `excludedSet`.
function setupRemovableList(containerId, excludedSet, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', (e) => {
        const button = e.target.closest('.ranked-remove');
        if (!button) return;
        excludedSet.add(decodeURIComponent(button.dataset.title));
        onChange();
    });
}

function renderRankedList(containerId, rows, { showDomainDot = false, removable = false } = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (rows.length === 0) {
        container.innerHTML = '<p class="widget-empty">No data available.</p>';
        return;
    }

    const maxValue = Math.max(...rows.map((r) => r.value), 1);

    container.innerHTML = rows.map((row, index) => {
        const pct = Math.max((row.value / maxValue) * 100, 4);
        const dot = showDomainDot
            ? `<span class="ranked-dot" style="background:${getDomainColor(row.domain)}"></span>`
            : '';
        const removeButton = removable
            ? `<button type="button" class="ranked-remove" data-title="${encodeURIComponent(row.name)}" aria-label="Remove ${row.name} from this list" title="Remove from list">&times;</button>`
            : '';
        return `
            <div class="ranked-row" style="--pct:${pct}%" title="Double-click to view ${row.name}'s details">
                <div class="ranked-row-fill"></div>
                <span class="ranked-rank">${index + 1}</span>
                ${dot}
                <span class="ranked-name">${row.name}</span>
                <span class="ranked-value">${row.display !== undefined ? row.display : row.value}</span>
                ${removeButton}
            </div>
        `;
    }).join('');
}

// -------------------- Most referenced --------------------

const mostReferencedState = { excluded: new Set() };

function renderMostReferenced() {
    const topN = getTopN('mostReferencedTopN', 'mostReferencedTopNCustom');
    const rows = allOntologiesData
        .map((o) => ({ name: o.Title, value: splitList(o['Linked-by AECO Ontologies']).length }))
        .filter((r) => r.value > 0 && !mostReferencedState.excluded.has(r.name))
        .sort((a, b) => b.value - a.value)
        .slice(0, topN);
    renderRankedList('mostReferencedList', rows, { removable: true });
    updateResetButton('mostReferencedReset', mostReferencedState.excluded, () => {
        mostReferencedState.excluded.clear();
        renderMostReferenced();
    });
}

function setupMostReferenced() {
    setupTopNControl('mostReferencedTopN', 'mostReferencedTopNCustom', renderMostReferenced);
    setupRemovableList('mostReferencedList', mostReferencedState.excluded, renderMostReferenced);
    setupRankedListNavigation('mostReferencedList');
}

// -------------------- Ontology Metrics ranking --------------------

const METRIC_DEFINITIONS = {
    classes: { label: 'Classes', value: (o) => toNumber(o['Number of Classes']) },
    objectProperties: { label: 'Object Properties', value: (o) => toNumber(o['Number of Object Properties']) },
    dataProperties: { label: 'Data Properties', value: (o) => toNumber(o['Number of Data Properties']) },
    classesPerOp: { label: 'Classes / Object Properties', value: (o) => safeRatio(o['Number of Classes'], o['Number of Object Properties']) },
    opPerClasses: { label: 'Object Properties / Classes', value: (o) => safeRatio(o['Number of Object Properties'], o['Number of Classes']) },
    classesPerDp: { label: 'Classes / Data Properties', value: (o) => safeRatio(o['Number of Classes'], o['Number of Data Properties']) },
    dpPerClasses: { label: 'Data Properties / Classes', value: (o) => safeRatio(o['Number of Data Properties'], o['Number of Classes']) },
    classesPerAllProps: { label: 'Classes / (Object + Data Properties)', value: (o) => safeRatio(o['Number of Classes'], toNumber(o['Number of Object Properties']) + toNumber(o['Number of Data Properties'])) },
    allPropsPerClasses: { label: '(Object + Data Properties) / Classes', value: (o) => safeRatio(toNumber(o['Number of Object Properties']) + toNumber(o['Number of Data Properties']), o['Number of Classes']) },
};

const metricRankingState = { excluded: new Set() };

function renderMetricRanking() {
    const metricSelect = document.getElementById('metricRankingMetric');
    const metricKey = metricSelect ? metricSelect.value : 'classes';
    const metricDef = METRIC_DEFINITIONS[metricKey] || METRIC_DEFINITIONS.classes;
    const topN = getTopN('metricRankingTopN', 'metricRankingTopNCustom');

    const rows = allOntologiesData
        .map((o) => ({ name: o.Title, value: metricDef.value(o), domain: o['Primary Domain'] }))
        .filter((r) => r.value !== null && r.value > 0 && !metricRankingState.excluded.has(r.name))
        .sort((a, b) => b.value - a.value)
        .slice(0, topN)
        .map((r) => ({ ...r, display: formatScore(r.value) }));

    renderRankedList('metricRankingList', rows, { showDomainDot: true, removable: true });
    updateResetButton('metricRankingReset', metricRankingState.excluded, () => {
        metricRankingState.excluded.clear();
        renderMetricRanking();
    });
}

function setupMetricRanking() {
    const metricSelect = document.getElementById('metricRankingMetric');
    if (metricSelect) metricSelect.addEventListener('change', renderMetricRanking);
    setupTopNControl('metricRankingTopN', 'metricRankingTopNCustom', renderMetricRanking);
    setupRemovableList('metricRankingList', metricRankingState.excluded, renderMetricRanking);
    setupRankedListNavigation('metricRankingList');
}

// -------------------- FOOPs score ranking --------------------

const foopsRankingState = { excluded: new Set() };
const foopsRangeState = { min: 0, max: 1 };

function renderFoopsRanking() {
    const topN = getTopN('foopsRankingTopN', 'foopsRankingTopNCustom');

    const rows = allOntologiesData
        .map((o) => ({ name: o.Title, value: toNumber(o['FOOPs Score']), domain: o['Primary Domain'] }))
        .filter((r) =>
            r.value > 0 &&
            r.value >= foopsRangeState.min &&
            r.value <= foopsRangeState.max &&
            !foopsRankingState.excluded.has(r.name)
        )
        .sort((a, b) => b.value - a.value)
        .slice(0, topN)
        .map((r) => ({ ...r, display: formatScore(r.value) }));

    renderRankedList('foopsRankingList', rows, { showDomainDot: true, removable: true });
    updateResetButton('foopsRankingReset', foopsRankingState.excluded, () => {
        foopsRankingState.excluded.clear();
        renderFoopsRanking();
    });
}

// Two overlapping native <input type="range"> elements sharing one visual
// track -- a standard technique for a dual-handle slider without a library.
function setupFoopsRangeSlider() {
    const minInput = document.getElementById('foopsRangeMin');
    const maxInput = document.getElementById('foopsRangeMax');
    const minLabel = document.getElementById('foopsRangeMinLabel');
    const maxLabel = document.getElementById('foopsRangeMaxLabel');
    const fill = document.getElementById('foopsRangeFill');
    if (!minInput || !maxInput || !minLabel || !maxLabel || !fill) return;

    const dataMax = Math.max(
        ...allOntologiesData.map((o) => toNumber(o['FOOPs Score'])).filter((v) => v > 0),
        0.01
    );

    [minInput, maxInput].forEach((input) => {
        input.max = String(dataMax);
        input.step = '0.01';
    });
    minInput.value = '0';
    maxInput.value = String(dataMax);
    foopsRangeState.min = 0;
    foopsRangeState.max = dataMax;

    function updateVisuals() {
        const min = parseFloat(minInput.value);
        const max = parseFloat(maxInput.value);
        const pctMin = (min / dataMax) * 100;
        const pctMax = (max / dataMax) * 100;
        fill.style.left = `${pctMin}%`;
        fill.style.width = `${Math.max(pctMax - pctMin, 0)}%`;
        minLabel.textContent = min.toFixed(2);
        maxLabel.textContent = max.toFixed(2);
    }

    // Whichever thumb the user last touched gets a higher z-index, so it
    // stays draggable even once the two handles meet or cross.
    minInput.addEventListener('pointerdown', () => {
        minInput.classList.add('active-thumb');
        maxInput.classList.remove('active-thumb');
    });
    maxInput.addEventListener('pointerdown', () => {
        maxInput.classList.add('active-thumb');
        minInput.classList.remove('active-thumb');
    });

    minInput.addEventListener('input', () => {
        if (parseFloat(minInput.value) > parseFloat(maxInput.value)) {
            minInput.value = maxInput.value;
        }
        foopsRangeState.min = parseFloat(minInput.value);
        updateVisuals();
        renderFoopsRanking();
    });

    maxInput.addEventListener('input', () => {
        if (parseFloat(maxInput.value) < parseFloat(minInput.value)) {
            maxInput.value = minInput.value;
        }
        foopsRangeState.max = parseFloat(maxInput.value);
        updateVisuals();
        renderFoopsRanking();
    });

    updateVisuals();
}

function setupFoopsRanking() {
    setupTopNControl('foopsRankingTopN', 'foopsRankingTopNCustom', renderFoopsRanking);
    setupRemovableList('foopsRankingList', foopsRankingState.excluded, renderFoopsRanking);
    setupRankedListNavigation('foopsRankingList');
    setupFoopsRangeSlider();
}

// -------------------- Domain coverage --------------------

function renderDomainCoverage(ontologies) {
    const container = document.getElementById('domainCoverageList');
    if (!container) return;

    const counts = new Map();
    ontologies.forEach((o) => {
        const domain = (o['Primary Domain'] || '').trim();
        if (!domain) return;
        counts.set(domain, (counts.get(domain) || 0) + 1);
    });

    const rows = Array.from(counts.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count);

    if (rows.length === 0) {
        container.innerHTML = '<p class="widget-empty">No data available.</p>';
        return;
    }

    const maxValue = Math.max(...rows.map((r) => r.count), 1);

    container.innerHTML = rows.map((row) => {
        const pct = Math.max((row.count / maxValue) * 100, 3);
        return `
            <button type="button" class="domain-row" data-domain="${encodeURIComponent(row.domain)}">
                <span class="domain-label" title="${row.domain}">${row.domain}</span>
                <div class="domain-track">
                    <div class="domain-fill" style="width:${pct}%; background:${getDomainColor(row.domain)}"></div>
                </div>
                <span class="domain-value">${row.count}</span>
            </button>
        `;
    }).join('');
}

function setupDomainCoverage() {
    const container = document.getElementById('domainCoverageList');
    if (!container) return;
    container.addEventListener('click', (e) => {
        const row = e.target.closest('.domain-row');
        if (!row) return;
        openDomainModal(decodeURIComponent(row.dataset.domain));
    });
}

// -------------------- Ontologies over time --------------------

let overTimeChart = null;

function renderOverTimeChart(ontologies) {
    const canvas = document.getElementById('overTimeChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const counts = new Map();
    ontologies.forEach((o) => {
        const year = extractYear(o.Created);
        if (!year) return;
        counts.set(year, (counts.get(year) || 0) + 1);
    });

    const years = Array.from(counts.keys()).sort((a, b) => a - b);
    const values = years.map((year) => counts.get(year));
    const accent = getAccentMark();

    if (overTimeChart) overTimeChart.destroy();

    overTimeChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: years.map(String),
            datasets: [{
                data: values,
                borderColor: accent,
                backgroundColor: 'rgba(223, 143, 21, 0.12)',
                pointBackgroundColor: accent,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2,
                fill: true,
                tension: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Hover/click by nearest x-position rather than requiring the
            // cursor sit exactly on the (small) point -- otherwise the
            // tooltip disappears the moment the mouse drifts off the dot,
            // before a click can land.
            interaction: { mode: 'nearest', intersect: false, axis: 'x' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => `Click to see all ${item.parsed.y} ontolog${item.parsed.y === 1 ? 'y' : 'ies'}`,
                    },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#898781' },
                    title: { display: true, text: 'Year Created', color: '#666', font: { size: 12, weight: '600' } },
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: '#898781' },
                    grid: { color: '#e1e0d9' },
                },
            },
            onHover: (event, elements) => {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            onClick: (event, elements) => {
                if (!elements.length) return;
                openYearModal(years[elements[0].index]);
            },
        },
    });
}

// -------------------- Ontology-list drill-down modal --------------------
// Shared by both the "Ontologies over time" chart (click a year) and the
// Domain Coverage bars (click a domain).

function openOntologyListModal(title, ontologies) {
    const overlay = document.getElementById('ontologyListModalOverlay');
    const modal = document.getElementById('ontologyListModal');
    const titleEl = document.getElementById('ontologyListModalTitle');
    const list = document.getElementById('ontologyListModalList');
    if (!overlay || !modal || !titleEl || !list) return;

    titleEl.textContent = title;

    const sorted = [...ontologies].sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));

    list.innerHTML = sorted.length === 0
        ? '<li class="ontology-list-modal-list-empty">No ontologies found.</li>'
        : sorted.map((o) => `
            <li>
                <a class="ontology-list-modal-link" href="individualOntologyDetail.html?ontology=${encodeURIComponent(o.Title)}">
                    <span class="ontology-list-modal-link-title">${o.Title}</span>
                    <span class="ontology-list-modal-link-domain">${o['Primary Domain'] || ''}</span>
                </a>
            </li>
        `).join('');

    overlay.classList.add('open');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function openYearModal(year) {
    const matches = allOntologiesData.filter((o) => extractYear(o.Created) === year);
    openOntologyListModal(`Ontologies created in ${year} (${matches.length})`, matches);
}

function openDomainModal(domain) {
    const matches = allOntologiesData.filter((o) => (o['Primary Domain'] || '').trim() === domain);
    openOntologyListModal(`${domain} (${matches.length})`, matches);
}

function closeOntologyListModal() {
    const overlay = document.getElementById('ontologyListModalOverlay');
    const modal = document.getElementById('ontologyListModal');
    if (overlay) overlay.classList.remove('open');
    if (modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    }
}

function setupOntologyListModal() {
    const overlay = document.getElementById('ontologyListModalOverlay');
    const closeButton = document.getElementById('ontologyListModalClose');
    if (overlay) overlay.addEventListener('click', closeOntologyListModal);
    if (closeButton) closeButton.addEventListener('click', closeOntologyListModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeOntologyListModal();
    });
}

// -------------------- Compare Ontologies --------------------

const MAX_COMPARE = 5;

const compareState = {
    selected: [], // ontology objects, in add order
    charts: [],   // Chart.js instances, index-aligned with `selected`
};

function setupCompareTool(ontologies) {
    const input = document.getElementById('compareSearchInput');
    const suggestionsBox = document.getElementById('compareSuggestions');
    if (!input || !suggestionsBox) return;

    function closeSuggestions() {
        suggestionsBox.classList.remove('open');
        suggestionsBox.innerHTML = '';
    }

    function showSuggestions(query) {
        if (compareState.selected.length >= MAX_COMPARE) {
            suggestionsBox.innerHTML = `<div class="compare-suggestion-empty">Maximum of ${MAX_COMPARE} ontologies selected. Remove one to add another.</div>`;
            suggestionsBox.classList.add('open');
            return;
        }

        const selectedTitles = new Set(compareState.selected.map((o) => o.Title));
        const q = query.trim().toLowerCase();

        let matches = ontologies.filter((o) => !selectedTitles.has(o.Title));
        if (q) {
            matches = matches.filter((o) => (o.Title || '').toLowerCase().includes(q));
        }
        matches = matches.slice(0, 8);

        if (matches.length === 0) {
            suggestionsBox.innerHTML = '<div class="compare-suggestion-empty">No matching ontologies.</div>';
        } else {
            suggestionsBox.innerHTML = matches.map((o) =>
                `<button type="button" class="compare-suggestion" data-title="${encodeURIComponent(o.Title)}">${o.Title}</button>`
            ).join('');
        }
        suggestionsBox.classList.add('open');
    }

    input.addEventListener('focus', () => showSuggestions(input.value));
    input.addEventListener('input', () => showSuggestions(input.value));

    suggestionsBox.addEventListener('click', (e) => {
        const button = e.target.closest('.compare-suggestion');
        if (!button) return;
        const title = decodeURIComponent(button.dataset.title);
        const ontology = ontologies.find((o) => o.Title === title);
        if (ontology) addCompareOntology(ontology);
        input.value = '';
        closeSuggestions();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.compare-search-wrap')) closeSuggestions();
    });

    document.getElementById('compareCards').addEventListener('click', (e) => {
        const button = e.target.closest('.compare-card-remove');
        if (!button) return;
        removeCompareOntology(decodeURIComponent(button.dataset.title));
    });
}

function addCompareOntology(ontology) {
    if (compareState.selected.length >= MAX_COMPARE) return;
    if (compareState.selected.some((o) => o.Title === ontology.Title)) return;
    compareState.selected.push(ontology);
    renderCompareCards();
}

function removeCompareOntology(title) {
    compareState.selected = compareState.selected.filter((o) => o.Title !== title);
    renderCompareCards();
}

function renderCompareCards() {
    const container = document.getElementById('compareCards');
    if (!container) return;

    compareState.charts.forEach((chart) => chart && chart.destroy());
    compareState.charts = [];

    if (compareState.selected.length === 0) {
        container.innerHTML = '<div class="compare-empty-state"></div>';
        return;
    }

    container.innerHTML = compareState.selected.map((ontology, index) => {
        const domain = ontology['Primary Domain'] || 'Unknown';
        const color = getDomainColor(domain);
        return `
            <article class="compare-card" style="--card-accent:${color}">
                <button type="button" class="compare-card-remove" data-title="${encodeURIComponent(ontology.Title)}" aria-label="Remove ${ontology.Title}">&times;</button>
                <div class="compare-card-title">${ontology.Title}</div>
                <div class="compare-card-domain">${domain}</div>
                <div class="compare-radar-wrap">
                    <canvas class="compare-radar" id="compareRadar-${index}"></canvas>
                </div>
                <div class="compare-metrics">
                    <div class="compare-metric-row"><span class="compare-metric-label">Quality Score</span><span class="compare-metric-value">${formatScore(ontology['Quality Score'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">Accessibility Score</span><span class="compare-metric-value">${formatScore(ontology['Accessibility Score'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">Alignment Score</span><span class="compare-metric-value">${formatScore(ontology['Alignment Score'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">Governance Score</span><span class="compare-metric-value">${formatScore(ontology['Governance Score'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">Annotation Score</span><span class="compare-metric-value">${formatScore(ontology['Annotation Score'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">FOOPs Score</span><span class="compare-metric-value">${formatScore(ontology['FOOPs Score'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">Number of Classes</span><span class="compare-metric-value">${formatScore(ontology['Number of Classes'])}</span></div>
                    <div class="compare-metric-row"><span class="compare-metric-label">Number of Object Properties</span><span class="compare-metric-value">${formatScore(ontology['Number of Object Properties'])}</span></div>
                </div>
            </article>
        `;
    }).join('');

    if (typeof Chart === 'undefined') return;

    compareState.selected.forEach((ontology, index) => {
        const canvas = document.getElementById(`compareRadar-${index}`);
        if (!canvas) return;
        const color = getDomainColor(ontology['Primary Domain'] || '');
        const chart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: ['Connectivity', 'Accessibility', ['Documentation', '& Reuse'], 'Governance'],
                datasets: [{
                    data: [
                        toNumber(ontology['Alignment Score']),
                        toNumber(ontology['Accessibility Score']),
                        toNumber(ontology['Quality Score']),
                        toNumber(ontology['Governance Score']),
                    ],
                    borderColor: color,
                    backgroundColor: color + '26', // ~15% opacity wash
                    pointBackgroundColor: color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1,
                    pointRadius: 4,
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: 6 },
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0,
                        max: 3,
                        ticks: { stepSize: 1, display: false },
                        pointLabels: { font: { size: 8 }, color: '#666' },
                        grid: { color: '#e1e0d9' },
                        angleLines: { color: '#e1e0d9' },
                    },
                },
            },
        });
        compareState.charts.push(chart);
    });

    renderDomainBrowsePanel();
}

// -------------------- Browse by domain --------------------
// A companion way to build the compare selection: pick ontologies grouped by
// domain instead of typing into the search box.

const domainBrowseState = {
    expanded: new Set(),  // domains currently expanded
};

function buildDomainBrowseGroups() {
    const groups = new Map();
    allOntologiesData.forEach((o) => {
        const domain = (o['Primary Domain'] || '').trim();
        if (!domain) return;
        if (!groups.has(domain)) groups.set(domain, []);
        groups.get(domain).push(o);
    });
    return Array.from(groups.entries())
        .map(([domain, items]) => ({
            domain,
            items: items.slice().sort((a, b) => (a.Title || '').localeCompare(b.Title || '')),
        }))
        .sort((a, b) => b.items.length - a.items.length);
}

function renderDomainBrowsePanel() {
    const panel = document.getElementById('domainBrowsePanel');
    const badge = document.getElementById('domainBrowseBadge');
    if (!panel) return;

    const groups = buildDomainBrowseGroups();
    const selectedTitles = new Set(compareState.selected.map((o) => o.Title));
    const capReached = compareState.selected.length >= MAX_COMPARE;

    panel.innerHTML = groups.map(({ domain, items }) => {
        const isOpen = domainBrowseState.expanded.has(domain);
        const color = getDomainColor(domain);
        const selectedInDomain = items.filter((o) => selectedTitles.has(o.Title)).length;

        const itemsHtml = isOpen ? `
            <div class="domain-browse-items">
                ${items.map((o) => {
                    const isChecked = selectedTitles.has(o.Title);
                    const isDisabled = !isChecked && capReached;
                    return `
                        <label class="domain-browse-item${isDisabled ? ' is-disabled' : ''}">
                            <input type="checkbox" data-title="${encodeURIComponent(o.Title)}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                            <span>${o.Title}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        ` : '';

        return `
            <div class="domain-browse-group">
                <div class="domain-browse-row${isOpen ? ' open' : ''}">
                    <span class="domain-browse-dot" style="background:${color}"></span>
                    <button type="button" class="domain-browse-expand" data-domain="${encodeURIComponent(domain)}">
                        <span class="domain-browse-name" style="color:${color}">${domain}</span>
                        <span class="domain-browse-count">${items.length}${selectedInDomain ? ` · ${selectedInDomain} added` : ''}</span>
                        <span class="domain-browse-chevron-small" aria-hidden="true">▾</span>
                    </button>
                </div>
                ${itemsHtml}
            </div>
        `;
    }).join('');

    if (badge) {
        const selectedCount = compareState.selected.length;
        badge.hidden = selectedCount === 0;
        badge.textContent = String(selectedCount);
    }
}

function setupDomainBrowse() {
    const toggle = document.getElementById('domainBrowseToggle');
    const panel = document.getElementById('domainBrowsePanel');
    if (!toggle || !panel) return;

    function openPanel() {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        renderDomainBrowsePanel();
    }

    function closePanel() {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    }

    toggle.addEventListener('click', () => {
        if (panel.hidden) openPanel(); else closePanel();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.domain-browse')) closePanel();
    });

    panel.addEventListener('change', (e) => {
        const checkbox = e.target.closest('input[type="checkbox"]');
        if (!checkbox) return;
        const title = decodeURIComponent(checkbox.dataset.title);
        if (checkbox.checked) {
            const ontology = allOntologiesData.find((o) => o.Title === title);
            if (ontology) addCompareOntology(ontology); // re-renders the panel too
        } else {
            removeCompareOntology(title); // re-renders the panel too
        }
    });

    panel.addEventListener('click', (e) => {
        // Stop here so the document-level "outside click closes the panel"
        // listener never sees this event. It matters because the handler
        // below re-renders panel.innerHTML while the click is still
        // bubbling, which detaches e.target -- by the time a listener
        // further up the tree ran e.target.closest('.domain-browse'), the
        // detached target has no parent, so that check would wrongly look
        // like an outside click and close the panel mid-interaction.
        e.stopPropagation();

        const expandButton = e.target.closest('.domain-browse-expand');
        if (expandButton) {
            const domain = decodeURIComponent(expandButton.dataset.domain);
            if (domainBrowseState.expanded.has(domain)) domainBrowseState.expanded.delete(domain);
            else domainBrowseState.expanded.add(domain);
            renderDomainBrowsePanel();
        }
    });
}

// -------------------- Init --------------------

async function loadAnalytics() {
    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error('Failed to fetch ontology data');
        const ontologies = await response.json();
        allOntologiesData = ontologies;

        renderStatTiles(ontologies);

        setupMostReferenced();
        renderMostReferenced();

        setupMetricRanking();
        renderMetricRanking();

        setupFoopsRanking();
        renderFoopsRanking();

        renderDomainCoverage(ontologies);
        setupDomainCoverage();

        renderOverTimeChart(ontologies);
        setupOntologyListModal();

        setupCompareTool(ontologies);
        setupDomainBrowse();
        renderCompareCards();
    } catch (error) {
        console.error('Error loading analytics data:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAnalytics);
} else {
    loadAnalytics();
}
