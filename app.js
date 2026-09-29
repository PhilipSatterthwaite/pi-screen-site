// Shared by every page: the header and tabs, talking to /api/v1, polling the frame's state, the status line,
// the phone's name, and the values from /config.
"use strict";

// These pages are served two ways: by GitHub Pages, and by the frame itself as a backup (http://inkypi:8080).
// From GitHub they reach the frame at its Tailscale HTTPS address, set up with `tailscale serve`.
const PI_ADDRESS = "https://inkypi.tail4468d5.ts.net";
const FROM_GITHUB = location.hostname.endsWith(".github.io");
const API = (FROM_GITHUB ? PI_ADDRESS : "") + "/api/v1";
const NAME_KEY = "piscreen.name";
const POLL_MS = 5000;

const TABS = [["index.html", "Frame"], ["notes.html", "Notes"], ["todos.html", "Lists"],
  ["reminders.html", "Reminders"], ["photos.html", "Photos"], ["settings.html", "Settings"]];

let pollTimer = null;
const stateListeners = [];
let lastState = null;

function getPhoneName() {
  try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; }
}

function setPhoneName(name) {
  name = (name || "").trim().slice(0, 40);
  try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* private mode: keep it for this page only */ }
  window.piscreenName = name;
  const button = document.getElementById("name-button");
  if (button) button.textContent = name || "Set name";
}

async function apiRequest(method, path, body) {
  const headers = { "X-Piscreen": "1", "X-Piscreen-Name": encodeURIComponent(window.piscreenName || getPhoneName()) };
  const options = { method, headers, cache: "no-store" };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(API + path, options);
  } catch (e) {
    throw new Error("Can't reach the frame. Is Tailscale on?");
  }
  let payload = null;
  try { payload = await response.json(); } catch (e) { /* not JSON */ }
  if (!payload || !payload.ok) {
    const message = payload && payload.error ? payload.error.message : `The frame answered ${response.status}.`;
    throw new Error(message);
  }
  return payload.data;
}

function apiGet(path) { return apiRequest("GET", path); }
function apiSend(method, path, body) { return apiRequest(method, path, body === undefined ? {} : body); }

function onState(listener) { stateListeners.push(listener); if (lastState) listener(lastState); }

async function pollOnce() {
  try {
    const state = await apiGet("/state");
    const previous = lastState;
    lastState = state;
    renderStatus(state);
    renderReminderBanner(state);
    stateListeners.forEach((listener) => listener(state, previous));
  } catch (e) {
    renderStatus(null, e.message);
  }
}

function startPolling() {
  stopPolling();
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderStatus(state, error) {
  const status = document.getElementById("status");
  const warning = document.getElementById("warning");
  if (!status) return;
  if (!state) {
    status.textContent = error || "Can't reach the frame.";
    status.classList.remove("busy");
    return;
  }
  let text;
  if (state.busy) {
    text = "Updating the screen";
  } else {
    const shown = state.shown_label || state.target_label || "Nothing";
    const parts = [shown];
    if (state.takeover) parts.push(`showing ${state.takeover.kind === "reminder" ? "a reminder" : "a note"} until ${formatTime(state.takeover.ends_at)}`);
    else if (state.mode === "auto") parts.push(state.set_by ? `auto, set by ${state.set_by}` : "auto");
    else parts.push(state.set_by ? `pinned by ${state.set_by}` : "pinned");
    if (state.last_redraw_at) parts.push(`updated ${formatTime(state.last_redraw_at)}`);
    text = parts.join(", ");
  }
  status.textContent = text;
  status.classList.toggle("busy", !!state.busy);
  const warnings = [...(state.warnings || [])];
  if (state.last_result && !state.last_result.success) warnings.unshift(`Last update failed: ${state.last_result.message}`);
  warning.hidden = warnings.length === 0;
  warning.textContent = warnings.join(" ");
}

// While a reminder is on the frame, every page shows it with Dismiss and Snooze.
let bannerKey = null;

async function renderReminderBanner(state) {
  const banner = document.getElementById("reminder-banner");
  if (!banner) return;
  const takeover = state && state.takeover && state.takeover.kind === "reminder" ? state.takeover : null;
  const key = takeover ? takeover.item_ids.join(",") : null;
  if (key === bannerKey) return;
  bannerKey = key;
  if (!takeover) { banner.hidden = true; banner.replaceChildren(); return; }
  let due = [];
  try { due = await apiGet(`/reminders?ids=${key}`); } catch (e) { bannerKey = null; return; }
  banner.replaceChildren(el("div", { class: "alert-title", text: "On the frame now" }),
    ...due.map((r) => el("div", { class: "alert-item" },
      el("div", { class: "grow" }, el("b", { text: r.title }), r.details ? el("div", { class: "meta", text: r.details }) : null),
      el("button", { type: "button", class: "small", text: "Snooze 10 min",
        onclick: (e) => withButton(e.currentTarget, async () => { await apiSend("POST", `/reminders/${r.id}/snooze`, { minutes: 10 }); bannerKey = null; pollOnce(); }) }),
      el("button", { type: "button", class: "small primary", text: "Dismiss",
        onclick: (e) => withButton(e.currentTarget, async () => { await apiSend("POST", `/reminders/${r.id}/dismiss`); bannerKey = null; pollOnce(); }) }))));
  banner.hidden = false;
}

function toast(message) {
  const box = document.createElement("div");
  box.className = "toast";
  box.setAttribute("role", "alert");
  box.textContent = message;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

// Build an element safely: text is always set as text, never as HTML.
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "text") node.textContent = value;
    else if (key in node && typeof value !== "string") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

// Run an action from a button: disable it while waiting, report failures.
async function withButton(button, action) {
  if (button) button.disabled = true;
  try { return await action(); }
  catch (e) { toast(e.message); }
  finally { if (button) button.disabled = false; }
}

// The parts every page shares, added around the page's <main>. Runs as soon as this script loads, before the
// page's own script, so those scripts find these elements.
function buildChrome() {
  const title = document.body.dataset.title || "Frame";
  document.title = `${title} · Frame`;
  const main = document.querySelector("main");
  main.before(
    el("header", { class: "top" }, el("h1", { text: title }),
      el("button", { type: "button", class: "name-button", id: "name-button", "aria-label": "Change your name" })),
    el("div", { class: "status", id: "status", role: "status", "aria-live": "polite", text: "Connecting…" }),
    el("div", { class: "warning", id: "warning", hidden: true }),
    el("div", { class: "alert-banner", id: "reminder-banner", hidden: true, role: "alert" }));
  const here = location.pathname.split("/").pop() || "index.html";
  main.after(
    el("nav", { class: "tabs", "aria-label": "Pages" }, ...TABS.map(([href, label]) =>
      el("a", { href, "aria-current": href === here ? "page" : null, text: label }))),
    el("div", { class: "overlay", id: "name-dialog", hidden: true },
      el("form", { class: "dialog", id: "name-form" },
        el("h2", { text: "Who is this?" }),
        el("p", { text: "Your name is shown next to what you add or change. It is only a label." }),
        el("input", { id: "name-input", name: "name", maxlength: "40", autocomplete: "given-name",
          placeholder: "Your name", required: true }),
        el("button", { type: "submit", class: "primary", text: "Save" }))));
}

// Values the frame decides, such as the longest note. Elements ask for them with:
//   data-fill-text="Default ({reminder_takeover_minutes} min)"   the text, with {name} replaced
//   data-fill-attr="maxlength:max_note_chars,data-max-mb:max_upload_mb"
//   data-fill-options="note_expiry_choices" data-selected="1 week"   a <select>'s options
let frameConfig = null;
const configListeners = [];

function onConfig(listener) { configListeners.push(listener); if (frameConfig) listener(frameConfig); }

function fillFromConfig(config) {
  const fill = (template) => template.replace(/\{(\w+)\}/g, (_, key) => (key in config ? String(config[key]) : ""));
  document.querySelectorAll("[data-fill-text]").forEach((node) => { node.textContent = fill(node.dataset.fillText); });
  document.querySelectorAll("[data-fill-attr]").forEach((node) => {
    for (const pair of node.dataset.fillAttr.split(",")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (key in config) node.setAttribute(attr, String(config[key]));
    }
  });
  document.querySelectorAll("select[data-fill-options]").forEach((select) => {
    const choices = config[select.dataset.fillOptions] || [];
    const selected = select.value || select.dataset.selected;
    select.replaceChildren(...choices.map((choice) => el("option", { value: choice,
      text: choice.charAt(0).toUpperCase() + choice.slice(1), selected: choice === selected })));
  });
}

async function loadConfig() {
  try {
    frameConfig = await apiGet("/config");
  } catch (e) {
    setTimeout(loadConfig, POLL_MS);   // the status line already says why
    return;
  }
  fillFromConfig(frameConfig);
  configListeners.forEach((listener) => listener(frameConfig));
}

function askName() {
  const dialog = document.getElementById("name-dialog");
  const input = document.getElementById("name-input");
  input.value = getPhoneName();
  dialog.hidden = false;
  input.focus();
}

buildChrome();

document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  // A link such as http://inkypi:8080/?name=Anna sets the name, so it can be sent ready to use.
  const fromLink = new URLSearchParams(location.search).get("name");
  setPhoneName(fromLink && fromLink.trim() ? fromLink : getPhoneName());
  document.getElementById("name-button").addEventListener("click", askName);
  document.getElementById("name-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("name-input").value.trim();
    if (!name) return;
    setPhoneName(name);
    document.getElementById("name-dialog").hidden = true;
  });
  if (!getPhoneName()) askName();
  document.addEventListener("visibilitychange", () => (document.hidden ? stopPolling() : startPolling()));
  startPolling();
});
