import { signOut, startAuth, translateAuthError } from "./auth.js";
import { renderLogin, renderSetup } from "./pages/login.js";
import { renderNav, renderRoute } from "./router.js";
import { applyTheme, getTheme, renderShell, setNavOpen, syncThemeButton } from "./ui.js";

applyTheme(getTheme());

const app = document.querySelector("#app");
let mode = "loading";

function renderLoading() {
  app.innerHTML = `<p class="boot">로그인 상태를 확인하고 있습니다.</p>`;
  mode = "loading";
}

async function showPage() {
  const main = document.querySelector("#main");
  const nav = document.querySelector("#nav");
  if (!main || !nav) return;
  const activeId = await renderRoute(main);
  renderNav(nav, activeId);
  setNavOpen(false);
}

function showApp(session) {
  const entered = mode !== "app";
  if (entered) {
    renderShell();
    mode = "app";
  }
  const email = document.querySelector("#account-email");
  if (email) email.textContent = session?.user?.email ?? "";
  syncThemeButton();
  if (entered) showPage();
}

function showLogin() {
  renderLogin(app);
  mode = "login";
  syncThemeButton();
}

function showSetup(error) {
  const message = translateAuthError(error);
  const title = message.includes("라이브러리") ? "연결할 수 없습니다" : "설정이 필요합니다";
  renderSetup(app, message, title);
  mode = "setup";
  syncThemeButton();
}

document.body.addEventListener("click", async (event) => {
  if (event.target.closest("[data-open-nav]")) setNavOpen(true);
  if (event.target.closest("[data-close-nav]")) setNavOpen(false);
  if (event.target.closest("[data-theme-toggle]")) {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    applyTheme(next);
    syncThemeButton();
  }
  if (event.target.closest("[data-logout]")) {
    const button = event.target.closest("[data-logout]");
    button.disabled = true;
    try {
      await signOut();
    } catch (error) {
      button.disabled = false;
      window.alert(translateAuthError(error));
    }
  }
});

window.addEventListener("hashchange", () => {
  if (mode === "app") showPage();
});

renderLoading();
startAuth((session, event, error) => {
  if (event === "CONFIG_ERROR") {
    showSetup(error);
    return;
  }
  if (session) showApp(session);
  else if (mode !== "login") showLogin();
});
