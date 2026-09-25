const MAX_TOASTS = 4;
const LOADING_DELAY = 380;

let stack = null;
let loadingTimer = 0;

function ensureStack() {
  if (stack?.isConnected) return stack;
  stack = document.createElement("div");
  stack.className = "toast-stack";
  stack.setAttribute("aria-live", "polite");
  stack.setAttribute("aria-relevant", "additions");
  document.body.appendChild(stack);
  return stack;
}

function icon(tone) {
  if (tone === "loading") return `<span class="toast-spinner" aria-hidden="true"></span>`;
  if (tone === "error") {
    return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.2 6.2 13.8 13.8M13.8 6.2 6.2 13.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  if (tone === "info") {
    return `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="5.4" r="1.15" fill="currentColor"/><path d="M10 8.6v6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.4 8.2 13.6 15 6.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function toneOf(text, kind) {
  if (kind === "error") return "error";
  if (/중(?:입니다|이에요)/.test(text)) return "loading";
  if (/(했습니다|합쳤습니다|넣었습니다|보냈습니다)[.!]?\s*$/.test(text)) return "success";
  return "info";
}

function durationOf(tone, text) {
  if (tone === "error") return Math.min(9000, 4600 + text.length * 35);
  if (tone === "info") return Math.min(9000, 4200 + text.length * 40);
  return 3200;
}

function dismiss(node) {
  if (!node?.isConnected || node.dataset.leaving === "1") return;
  node.dataset.leaving = "1";
  clearTimeout(Number(node.dataset.timer || 0));
  node.classList.add("is-out");
  const remove = () => node.remove();
  node.addEventListener("transitionend", remove, { once: true });
  window.setTimeout(remove, 280);
}

function trim() {
  const items = [...ensureStack().querySelectorAll(".toast")].filter((node) => node.dataset.leaving !== "1");
  const extra = items.length - MAX_TOASTS;
  for (let index = 0; index < extra; index += 1) dismiss(items[index]);
}

function dismissLoading() {
  clearTimeout(loadingTimer);
  loadingTimer = 0;
  if (!stack) return;
  for (const node of stack.querySelectorAll(".toast.is-loading")) dismiss(node);
}

export function clearToasts() {
  dismissLoading();
  if (!stack) return;
  for (const node of [...stack.querySelectorAll(".toast")]) dismiss(node);
}

function push(text, tone, action) {
  const root = ensureStack();
  const node = document.createElement("div");
  const ms = action ? 10000 : tone === "loading" ? 0 : durationOf(tone, text);
  node.className = `toast is-${tone}${action ? " has-action" : ""}`;
  node.setAttribute("role", tone === "error" ? "alert" : "status");
  node.innerHTML = `
    <span class="toast-icon">${icon(tone)}</span>
    <p class="toast-text"></p>
    <button class="toast-close" type="button" aria-label="알림 닫기">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6 14 14M14 6 6 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    ${ms ? `<span class="toast-progress" style="animation-duration:${ms}ms"></span>` : ""}
  `;
  node.querySelector(".toast-text").textContent = text;
  node.querySelector(".toast-close").addEventListener("click", () => dismiss(node));
  if (action) {
    const actionButton = document.createElement("button");
    actionButton.className = "toast-action";
    actionButton.type = "button";
    actionButton.textContent = action.label;
    actionButton.addEventListener("click", () => {
      dismiss(node);
      action.onClick();
    });
    node.querySelector(".toast-close").before(actionButton);
  }

  if (ms) {
    const bar = node.querySelector(".toast-progress");
    let remaining = ms;
    let started = 0;
    const arm = () => {
      started = performance.now();
      node.dataset.timer = String(window.setTimeout(() => dismiss(node), remaining));
    };
    node.addEventListener("mouseenter", () => {
      clearTimeout(Number(node.dataset.timer || 0));
      remaining -= performance.now() - started;
      if (bar) bar.style.animationPlayState = "paused";
    });
    node.addEventListener("mouseleave", () => {
      if (node.dataset.leaving === "1") return;
      if (bar) bar.style.animationPlayState = "running";
      arm();
    });
    arm();
  }

  root.appendChild(node);
  trim();
}

export function notify(text, kind = "info", action = null) {
  const message = String(text ?? "").trim();
  if (!message) {
    clearToasts();
    return;
  }
  const tone = toneOf(message, kind);
  if (tone === "loading") {
    clearTimeout(loadingTimer);
    loadingTimer = window.setTimeout(() => {
      loadingTimer = 0;
      for (const node of ensureStack().querySelectorAll(".toast.is-loading")) dismiss(node);
      push(message, "loading");
    }, LOADING_DELAY);
    return;
  }
  dismissLoading();
  push(message, tone, action);
}
