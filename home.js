// The Frame page: what the frame shows, and buttons to change it.
"use strict";

let modes = [];
let shownRedraw = null;

function renderModes(state) {
  const grid = document.getElementById("modes");
  grid.replaceChildren();
  const auto = el("button", { type: "button", "aria-pressed": String(state.mode === "auto"), text: "Auto",
    onclick: (event) => choose(event.currentTarget, "auto") });
  grid.appendChild(auto);
  for (const mode of modes.filter((m) => m.enabled)) {
    grid.appendChild(el("button", { type: "button", "aria-pressed": String(state.mode === mode.mode_id),
      text: mode.label, onclick: (event) => choose(event.currentTarget, mode.mode_id) }));
  }
}

async function choose(button, modeId) {
  await withButton(button, async () => {
    const state = await apiSend("POST", "/mode", { mode: modeId });
    renderStatus(state);
    renderModes(state);
  });
}

async function loadModes() {
  try { modes = await apiGet("/modes"); } catch (e) { toast(e.message); }
}

function reloadFrame(state) {
  if (state.last_redraw_at === shownRedraw) return;
  shownRedraw = state.last_redraw_at;
  const img = document.getElementById("frame");
  img.src = `${API}/frame.png?t=${encodeURIComponent(shownRedraw || Date.now())}`;
}

function renderTakeover(state) {
  const box = document.getElementById("takeover");
  box.hidden = !state.takeover;
  if (state.takeover) {
    const what = state.takeover.kind === "reminder" ? "A reminder" : "A note";
    document.getElementById("takeover-text").textContent = `${what} is on the frame until ${formatTime(state.takeover.ends_at)}.`;
  }
}

let modesRevision = null;

document.addEventListener("DOMContentLoaded", async () => {
  const img = document.getElementById("frame");
  img.addEventListener("error", () => { img.hidden = true; document.getElementById("frame-empty").hidden = false; });
  img.addEventListener("load", () => { img.hidden = false; document.getElementById("frame-empty").hidden = true; });
  document.getElementById("refresh").addEventListener("click", (event) =>
    withButton(event.currentTarget, async () => renderStatus(await apiSend("POST", "/display/refresh"))));
  document.getElementById("takeover-end").addEventListener("click", (event) =>
    withButton(event.currentTarget, async () => renderStatus(await apiSend("POST", "/takeover/end"))));
  await loadModes();
  onState(async (state) => {
    if (modesRevision !== null && state.revisions.mode !== modesRevision) await loadModes();
    modesRevision = state.revisions.mode;
    renderModes(state);
    renderTakeover(state);
    reloadFrame(state);
  });
});
