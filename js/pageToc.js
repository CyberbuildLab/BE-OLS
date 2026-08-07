// Sticky in-page table of contents: highlights whichever section is
// currently in view as the user scrolls (a "scrollspy" sidebar).
(function () {
    function initPageToc() {
        const toc = document.getElementById('pageToc');
        if (!toc) return;

        const links = Array.from(toc.querySelectorAll('.toc-link'));
        const sections = links
            .map((link) => document.getElementById(link.dataset.tocTarget))
            .filter(Boolean);

        if (!sections.length) return;

        function setActive(id) {
            links.forEach((link) => {
                link.classList.toggle('active', link.dataset.tocTarget === id);
            });
        }

        // Anything crossing this horizontal line (just under the sticky header)
        // counts as "currently being read".
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActive(entry.target.id);
                    }
                });
            },
            { rootMargin: '-90px 0px -70% 0px', threshold: 0 }
        );

        sections.forEach((section) => observer.observe(section));
        setActive(sections[0].id);

        links.forEach((link) => {
            link.addEventListener('click', (event) => {
                const target = document.getElementById(link.dataset.tocTarget);
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActive(link.dataset.tocTarget);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPageToc);
    } else {
        initPageToc();
    }
})();
