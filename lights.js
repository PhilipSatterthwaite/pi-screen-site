// The Lights page: the room's LED strip and lamp, driven through the frame with the LED app's own commands,
// and the colours the frame sets by itself when a note or reminder pops up or puzzle time starts.
"use strict";

const COLOURS = [
  ["r", "Red", "#FF0000"], ["g", "Green", "#00FF00"], ["b", "Blue", "#0000FF"], ["w", "White", "#FFFFFF"],
  ["wm", "Warm", "#FFA239"], ["y", "Yellow", "#FFEA00"], ["p", "Purple", "#5F00A0"], ["lg", "Light green", "#228B22"],
  ["lb", "Light blue", "#00FFFF"], ["a", "Aqua", "#00BFFF"], ["c", "Cobalt", "#0047AB"],
];
const RAINBOW = "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";
const SCENES = [["rb", "Rainbow"], ["cy", "Cycle"], ["wo", "Worm"], ["w4", "4 Worms"]];
const EVENTS = [["note", "A note pops up"], ["reminder", "A reminder is due"], ["puzzles", "Puzzle time starts"]];

let lightSettings = null;

async function sendCommand(button, command) {
  await withButton(button, async () => {
    await apiSend("POST", "/lights/send", { command });
  });
}

function hexCommand(hex) { return "h" + hex.replace("#", "").toUpperCase(); }

function commandColour(command) {
  const named = COLOURS.find(([c]) => c === command);
  if (named) return named[2];
  if (/^h[0-9A-F]{6}$/i.test(command || "")) return "#" + command.slice(1);
  return command === "rb" ? RAINBOW : "#ffffff";
}

function renderControls() {
  const swatches = document.getElementById("swatches");
  swatches.replaceChildren(
    ...COLOURS.map(([command, label, hex]) => el("button", { type: "button", class: "swatch", "aria-label": label,
      title: label, style: `background:${hex}`, onclick: (e) => sendCommand(e.currentTarget, command) })),
    el("button", { type: "button", class: "swatch", "aria-label": "Rainbow", title: "Rainbow",
      style: `background:${RAINBOW}`, onclick: (e) => sendCommand(e.currentTarget, "rb") }));
  document.getElementById("scenes").replaceChildren(...SCENES.filter(([c]) => c !== "rb").map(([command, label]) =>
    el("button", { type: "button", text: label, onclick: (e) => sendCommand(e.currentTarget, command) })));
}

function eventRow(event, label) {
  const current = lightSettings[event] || "";
  const select = el("select", { "aria-label": `Colour when ${label.toLowerCase()}` },
    el("option", { value: "", text: "Leave the lights alone", selected: !current }),
    ...COLOURS.map(([c, name]) => el("option", { value: c, text: name, selected: c === current })),
    ...SCENES.map(([c, name]) => el("option", { value: c, text: name, selected: c === current })),
    el("option", { value: "custom", text: "Another colour…", selected: /^h/.test(current) }));
  const picker = el("input", { type: "color", value: /^h/.test(current) ? "#" + current.slice(1) : "#ff8800",
    hidden: !/^h/.test(current), "aria-label": "Custom colour" });
  const dot = el("span", { class: "dot", style: `background:${commandColour(current)}` });
  const save = async () => {
    const command = select.value === "custom" ? hexCommand(picker.value) : select.value;
    picker.hidden = select.value !== "custom";
    try {
      lightSettings = await apiSend("PATCH", "/lights", { [event]: command });
      dot.style.background = commandColour(command);
      toast("Saved");
    } catch (e) { toast(e.message); }
  };
  select.addEventListener("change", save);
  picker.addEventListener("change", save);
  const tryIt = el("button", { type: "button", class: "small", text: "Try",
    onclick: (e) => withButton(e.currentTarget, async () => { await apiSend("POST", "/lights/send", { event }); }) });
  return el("li", {}, el("div", { class: "row" }, dot, el("div", { class: "grow", text: label }), tryIt),
    el("div", { class: "row" }, select, picker));
}

function renderAutomatic() {
  const list = document.getElementById("events");
  list.replaceChildren(...EVENTS.map(([event, label]) => eventRow(event, label)));
  const enabled = document.getElementById("lights-enabled");
  enabled.checked = lightSettings.enabled;
  document.getElementById("lights-topic").value = lightSettings.topic;
  document.getElementById("lights-broker").value = lightSettings.broker;
  document.getElementById("lights-port").value = String(lightSettings.port);
  document.getElementById("not-set-up").hidden = !!lightSettings.topic;
}

async function patchSetting(input, changes) {
  try {
    lightSettings = await apiSend("PATCH", "/lights", changes);
    renderAutomatic();
    toast("Saved");
  } catch (e) {
    toast(e.message);
    renderAutomatic();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderControls();
  document.getElementById("on").addEventListener("click", (e) => sendCommand(e.currentTarget, "on"));
  document.getElementById("off").addEventListener("click", (e) => sendCommand(e.currentTarget, "off"));
  const slider = document.getElementById("brightness");
  const value = document.getElementById("brightness-value");
  slider.addEventListener("input", () => { value.textContent = slider.value; });
  slider.addEventListener("change", () => sendCommand(null, "v" + slider.value));   // on release: one command
  const wheel = document.getElementById("wheel");
  wheel.addEventListener("change", () => sendCommand(null, hexCommand(wheel.value)));

  document.getElementById("lights-enabled").addEventListener("change", (e) =>
    patchSetting(e.target, { enabled: e.target.checked }));
  document.getElementById("lights-topic").addEventListener("change", (e) =>
    patchSetting(e.target, { topic: e.target.value }));
  document.getElementById("lights-broker").addEventListener("change", (e) =>
    patchSetting(e.target, { broker: e.target.value }));
  document.getElementById("lights-port").addEventListener("change", (e) =>
    patchSetting(e.target, { port: Number(e.target.value) }));

  apiGet("/lights").then((values) => { lightSettings = values; renderAutomatic(); }).catch((e) => toast(e.message));
});
