/**
 * The header's menus, as on the marketing site: open on hover or click,
 * close on leaving the bar, Escape or a click elsewhere. Also shows the bar's
 * bottom hairline once the page scrolls, and fills in the GitHub star count.
 */
let stars: Promise<number | null> | undefined;

const menus = () => [...document.querySelectorAll<HTMLElement>("[data-site-menu]")];

function setOpen(target: HTMLElement | null) {
  for (const menu of menus()) {
    const open = menu === target;
    menu.querySelector("[data-site-menu-trigger]")?.setAttribute("aria-expanded", String(open));
    menu.querySelector(".menu-pop")?.setAttribute("data-state", open ? "open" : "closed");
  }
}

const isOpen = (menu: HTMLElement) => menu.querySelector(".menu-pop")?.getAttribute("data-state") === "open";

function wire() {
  const nav = document.querySelector<HTMLElement>("[data-site-nav]");
  if (!nav || nav.dataset.wired) return;
  nav.dataset.wired = "1";
  for (const menu of menus()) {
    menu.addEventListener("mouseenter", () => setOpen(menu));
    menu.querySelector("[data-site-menu-trigger]")?.addEventListener("click", () => setOpen(isOpen(menu) ? null : menu));
  }
  nav.addEventListener("mouseleave", () => setOpen(null));
  showStars();
}

document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(null));
document.addEventListener("pointerdown", (e) => {
  if (!(e.target as Element).closest?.("[data-site-nav]")) setOpen(null);
});
function syncScrolled() {
  document.querySelector("[data-site-header]")?.toggleAttribute("data-scrolled", window.scrollY > 4);
}
window.addEventListener("scroll", syncScrolled, { passive: true });
document.addEventListener("astro:page-load", syncScrolled);
syncScrolled();

// The ClientRouter swaps the header on every page.
document.addEventListener("astro:page-load", wire);
wire();

function showStars() {
  stars ??= fetch("https://api.github.com/repos/openinary/openinary", {
    headers: { Accept: "application/vnd.github.v3+json" },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (typeof d?.stargazers_count === "number" ? d.stargazers_count : null))
    .catch(() => null);
  stars.then((n) => {
    if (n === null) return;
    document.querySelectorAll("[data-github-stars]").forEach((el) => (el.textContent = n.toLocaleString("en-US")));
  });
}
