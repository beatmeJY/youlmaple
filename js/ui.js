const THEME_KEY = "maple-note-theme";

export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function renderShell() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="layout">
      <div class="backdrop" data-close-nav hidden></div>
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <p class="brand-mark">MAPLE NOTE</p>
          <strong>메이플 노트</strong>
          <span>개인용 정보 메모</span>
          <button class="icon-button nav-close" type="button" data-close-nav>닫기</button>
        </div>
        <nav class="nav" id="nav" aria-label="주요 메뉴"></nav>
      </aside>
      <div class="content">
        <header class="topbar">
          <button class="icon-button" type="button" data-open-nav aria-label="메뉴 열기">메뉴</button>
          <p class="topbar-title">메이플 노트</p>
          <div class="topbar-actions">
            <p class="account-email" id="account-email"></p>
            <button class="icon-button" type="button" data-logout>로그아웃</button>
            <button class="icon-button" type="button" data-theme-toggle>다크 모드</button>
          </div>
        </header>
        <main id="main" class="main"></main>
      </div>
    </div>
  `;
}

export function setNavOpen(open) {
  document.body.classList.toggle("nav-open", open);
  const backdrop = document.querySelector(".backdrop");
  if (backdrop) backdrop.hidden = !open;
}

export function syncThemeButton() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  const dark = document.documentElement.dataset.theme !== "light";
  button.textContent = dark ? "라이트 모드" : "다크 모드";
}
