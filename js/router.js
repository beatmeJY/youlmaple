import { routes } from "./routes.js";

const pages = {
  dashboard: () => import("./pages/dashboard.js"),
  characters: () => import("./pages/characters.js"),
  monsters: () => import("./pages/monsters.js"),
  items: () => import("./pages/items.js"),
  quests: () => import("./pages/quests.js"),
  notes: () => import("./pages/notes.js"),
};

export function getRouteId() {
  const id = location.hash.replace(/^#\/?/, "");
  return pages[id] ? id : "dashboard";
}

export function navigate(id) {
  location.hash = `#/${id}`;
}

export async function renderRoute(root) {
  const id = getRouteId();
  const page = await pages[id]();
  await page.render(root);
  return id;
}

export function renderNav(nav, activeId) {
  nav.innerHTML = routes
    .map(
      (route) => `
        <a
          class="nav-link${route.id === activeId ? " is-active" : ""}"
          href="#/${route.id}"
          data-route="${route.id}"
        >
          <span>${route.label}</span>
          <small>${route.description}</small>
        </a>
      `,
    )
    .join("");
}
