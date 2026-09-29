// The Settings page: the screens and the timing settings.
"use strict";

const SETTING_LABELS = {
  debounce_seconds: ["Wait after a change before redrawing", "seconds"],
  interactive_min_gap_seconds: ["Shortest gap between redraws from phones", "seconds"],
  auto_min_interval_seconds: ["Shortest automatic redraw interval", "seconds, at least 180"],
  rotation_dwell_minutes: ["Time on each screen in Auto", "minutes"],
  reminder_takeover_minutes: ["How long a due reminder stays on the frame", "minutes"],
  note_takeover_minutes: ["How long a \"show now\" note stays on the frame", "minutes"],
  reminder_grace_hours: ["Still show a reminder missed while the frame was off by up to", "hours"],
  max_note_chars: ["Longest note", "characters"],
  max_upload_mb: ["Largest photo upload", "MB"],
  photo_max_edge_px: ["Longest side of a stored photo", "pixels"],
};

// Each screen's options, as the screen's settings.html in InkyPi offers them. Values are saved as text, the way
// InkyPi's own forms save them; keys ending in [] hold lists.
const YES_NO = [["true", "Yes"], ["false", "No"]];
const TIME_FORMAT = { key: "timeFormat", label: "Time format", options: [["12h", "12-hour"], ["24h", "24-hour"]] };
const UNITS = { key: "units", label: "Units", options: [["imperial", "Fahrenheit"], ["metric", "Celsius"]] };
const LOCATION = [
  { key: "latitude", label: "Latitude", placeholder: "40.3431 (blank = Princeton, NJ)" },
  { key: "longitude", label: "Longitude", placeholder: "-74.6551" },
];
const SCREEN_OPTIONS = {
  dashboard: [...LOCATION, UNITS, TIME_FORMAT,
    { key: "wordSource", label: "Word of the day from",
      options: [["feed", "Merriam-Webster (the word list when it can't be reached)"], ["list", "The word list on the frame only"]] }],
  ps_weather: [...LOCATION, UNITS, TIME_FORMAT,
    { key: "days", label: "Days in the forecast (5 to 7)", type: "number", min: 5, max: 7 }],
  ps_calendar: [
    { key: "calendarURLs[]", label: "Calendar addresses (private ICS links)", type: "list",
      placeholder: "https://… or webcal://…",
      hint: "Anyone who has an address can read that calendar. Saved addresses are shown shortened, and are kept only on the frame." },
    { key: "daysAhead", label: "Days ahead", type: "number", min: 1, max: 31 }, TIME_FORMAT],
  ps_notes: [
    { key: "layout", label: "Layout", options: [["board", "A board of notes"], ["featured", "One large note (the newest, or a pinned one)"]] },
    { key: "count", label: "Notes on the board (1 to 6)", type: "number", min: 1, max: 6 },
    { key: "showAuthor", label: "Show who sent it", options: YES_NO },
    { key: "showTime", label: "Show when it was sent", options: YES_NO }],
  ps_todo: [
    { key: "lists[]", label: "Lists to show (none ticked = all)", type: "lists" },
    { key: "columns", label: "Columns", options: [["2", "Two"], ["1", "One"]] },
    { key: "showDoneHours", label: "Keep completed items, struck through, for this many hours (0 = hide at once)", type: "number", min: 0, max: 168 }],
  ps_reminders: [{ key: "daysAhead", label: "Days ahead to list", type: "number", min: 1, max: 60 }, TIME_FORMAT],
  ps_word: [
    { key: "source", label: "Word from", options: [["feed", "Merriam-Webster (the word list when it can't be reached)"], ["list", "The word list on the frame only"]] },
    { key: "showExample", label: "Show an example sentence", options: YES_NO },
    { key: "showPronunciation", label: "Show the pronunciation", options: YES_NO }],
  ps_daily: [
    { key: "layout", label: "Show", options: [["auto", "By time of day"], ["morning", "Always the morning look"],
      ["afternoon", "Always the afternoon look"], ["evening", "Always the evening look"]] },
    { key: "morningStart", label: "Morning (weather, calendar, word) from", type: "time" },
    { key: "afternoonStart", label: "Afternoon (The Far Side) from", type: "time" },
    { key: "eveningStart", label: "Evening (puzzles) from", type: "time" },
    { key: "eveningItems", label: "Evening reminders, separated by commas", placeholder: "Crossword, Word Salad" },
    ...LOCATION, UNITS, TIME_FORMAT,
    { key: "wordSource", label: "Word of the day from",
      options: [["feed", "Merriam-Webster (the word list when it can't be reached)"], ["list", "The word list on the frame only"]] },
    { key: "calendarURLs[]", label: "Calendar addresses (private ICS links)", type: "list",
      placeholder: "https://… or webcal://…",
      hint: "Days with events are underlined, and the next events are listed. Saved addresses are shown shortened." }],
  clock: [
    { key: "selectedClockFace", label: "Clock face",
      options: [["Digital Clock", "Digital"], ["Gradient Clock", "Gradient"], ["Divided Clock", "Divided"], ["Word Clock", "Word"]] },
    { key: "primaryColor", label: "Primary colour", type: "color" },
    { key: "secondaryColor", label: "Secondary colour", type: "color" }],
};

function optionField(option, value, id) {
  if (option.options) {
    return el("select", { id }, ...option.options.map(([v, text]) => el("option", { value: v, text, selected: v === value })));
  }
  if (option.type === "list") {
    const rows = el("div", { class: "option-list" });
    const addRow = (text) => rows.appendChild(el("div", { class: "row" },
      el("input", { class: "grow", type: "text", value: text, placeholder: option.placeholder || "", autocomplete: "off",
        "aria-label": option.label }),
      el("button", { type: "button", class: "small", text: "✕", "aria-label": "Remove",
        onclick: (e) => e.currentTarget.parentElement.remove() })));
    (value && value.length ? value : [""]).forEach(addRow);
    return el("div", { id }, rows, el("button", { type: "button", class: "small", text: "Add another", onclick: () => addRow("") }));
  }
  if (option.type === "lists") {
    const box = el("div", { id, class: "option-list" }, el("span", { class: "meta", text: "Loading lists…" }));
    apiGet("/todos").then((lists) => box.replaceChildren(...lists.map((list) => el("label", { class: "check" },
      el("input", { type: "checkbox", value: String(list.id), checked: (value || []).includes(String(list.id)) }), list.name))))
      .catch((e) => box.replaceChildren(el("span", { class: "meta", text: e.message })));
    return box;
  }
  return el("input", { id, type: option.type || "text", value: value === undefined ? "" : String(value),
    placeholder: option.placeholder || "", min: option.min, max: option.max, autocomplete: "off" });
}

function readField(option, id) {
  const node = document.getElementById(id);
  if (option.type === "list") return [...node.querySelectorAll("input")].map((i) => i.value.trim()).filter(Boolean);
  if (option.type === "lists") return [...node.querySelectorAll("input:checked")].map((i) => i.value);
  return node.value.trim();
}

let optionsOpened = 0;   // numbers each opened form, so field ids stay unique when several are open

async function toggleOptions(button, mode, holder) {
  if (!holder.hidden) { holder.hidden = true; holder.replaceChildren(); return; }
  await withButton(button, async () => {
    const screen = await apiGet(`/screens/${encodeURIComponent(mode.mode_id)}/settings`);
    const options = SCREEN_OPTIONS[screen.plugin_id];
    holder.replaceChildren();
    if (!screen.editable || !options) {
      holder.appendChild(el("p", { class: "muted", text: screen.editable
        ? "This screen's options can only be changed in InkyPi's own pages." : "This screen's options are set by the frame." }));
    } else {
      const form = el("form", { class: "settings-form" });
      const prefix = `opt${++optionsOpened}`;
      options.forEach((option, i) => {
        const id = `${prefix}-${i}`;
        form.appendChild(el("div", {}, el("label", { for: id, text: option.label }),
          optionField(option, screen.settings[option.key], id), option.hint ? el("div", { class: "hint", text: option.hint }) : null));
      });
      form.appendChild(el("button", { type: "submit", class: "primary wide", text: "Save" }));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const changes = Object.fromEntries(options.map((option, i) => [option.key, readField(option, `${prefix}-${i}`)]));
        withButton(event.submitter, async () => {
          await apiSend("PUT", `/screens/${encodeURIComponent(mode.mode_id)}/settings`, changes);
          toast("Saved");
          holder.hidden = true;
          holder.replaceChildren();
        });
      });
      holder.appendChild(form);
    }
    holder.hidden = false;
  });
}

let modes = [];

async function patchMode(button, modeId, changes) {
  await withButton(button, async () => {
    await apiSend("PATCH", `/modes/${encodeURIComponent(modeId)}`, changes);
    await loadModes();
  });
}

function renderModes() {
  const list = document.getElementById("modes");
  list.replaceChildren();
  modes.forEach((mode, index) => {
    const label = el("input", { type: "text", value: mode.label, maxlength: "40", "aria-label": "Name" });
    label.addEventListener("change", () => patchMode(null, mode.mode_id, { label: label.value }));
    const minutes = el("input", { type: "number", min: "3", step: "1", value: String(Math.round(mode.refresh_seconds / 60)),
      "aria-label": "Redraw every, minutes", style: "width: 90px" });
    minutes.addEventListener("change", () => patchMode(null, mode.mode_id, { refresh_seconds: Math.round(Number(minutes.value) * 60) }));
    const rotation = el("input", { type: "checkbox", checked: mode.in_rotation });
    rotation.addEventListener("change", () => patchMode(null, mode.mode_id, { in_rotation: rotation.checked }));
    const enabled = el("input", { type: "checkbox", checked: mode.enabled });
    enabled.addEventListener("change", () => patchMode(null, mode.mode_id, { enabled: enabled.checked }));
    const up = el("button", { type: "button", class: "small", text: "↑", "aria-label": "Move up", disabled: index === 0,
      onclick: (e) => move(e.currentTarget, index, -1) });
    const down = el("button", { type: "button", class: "small", text: "↓", "aria-label": "Move down", disabled: index === modes.length - 1,
      onclick: (e) => move(e.currentTarget, index, 1) });
    const holder = el("div", { class: "screen-options", hidden: true });
    const optionsButton = el("button", { type: "button", class: "small", text: "Options",
      onclick: (e) => toggleOptions(e.currentTarget, mode, holder) });
    list.appendChild(el("li", {},
      el("div", { class: "row" }, el("div", { class: "grow" }, label), up, down),
      el("div", { class: "row" },
        el("label", { class: "check" }, rotation, "In Auto"),
        el("label", { class: "check" }, enabled, "On"),
        el("label", { class: "check" }, "Redraw every", minutes, "min")),
      el("div", { class: "row" }, el("div", { class: "meta grow", text: mode.mode_id }), optionsButton),
      holder));
  });
}

async function move(button, index, delta) {
  const order = modes.map((m) => m.mode_id);
  const [moved] = order.splice(index, 1);
  order.splice(index + delta, 0, moved);
  await withButton(button, async () => {
    for (let i = 0; i < order.length; i++) {
      await apiSend("PATCH", `/modes/${encodeURIComponent(order[i])}`, { position: i });
    }
    await loadModes();
  });
}

async function loadModes() {
  modes = await apiGet("/modes");
  renderModes();
}

async function loadSettings() {
  const values = await apiGet("/settings");
  const form = document.getElementById("settings-form");
  form.replaceChildren();
  for (const [name, [text, unit]] of Object.entries(SETTING_LABELS)) {
    if (!(name in values)) continue;
    const input = el("input", { type: "number", id: `s-${name}`, value: String(values[name]), step: "1", inputmode: "numeric" });
    input.addEventListener("change", async () => {
      try {
        await apiSend("PATCH", "/settings", { [name]: Number(input.value) });
        toast("Saved");
      } catch (e) {
        toast(e.message);
        input.value = String(values[name]);
      }
    });
    form.appendChild(el("div", {}, el("label", { for: `s-${name}`, text }), input, el("div", { class: "hint", text: unit })));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("rescan").addEventListener("click", (event) =>
    withButton(event.currentTarget, async () => { modes = await apiSend("POST", "/modes/rescan"); renderModes(); toast("Screens re-read"); }));
  loadModes().catch((e) => toast(e.message));
  loadSettings().catch((e) => toast(e.message));
});
