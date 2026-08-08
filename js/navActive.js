// Highlights whichever nav link points to the page currently being viewed,
// so visitors have a clear "you are here" cue without a full pill/button style.
(function () {
    function markActiveNavLink() {
        const currentFile = window.location.pathname.split("/").pop() || "index.html";
        document.querySelectorAll(".nav ul li a[href]").forEach((link) => {
            const linkFile = link.getAttribute("href").split("/").pop();
            if (linkFile === currentFile) {
                link.classList.add("nav-current");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", markActiveNavLink);
    } else {
        markActiveNavLink();
    }
})();
