// The Lists page. Changes show at once, then are corrected from the frame's answer.
"use strict";

const LIST_KEY = "piscreen.list";
let lists = [];
let currentId = null;
let todosRevision = null;
let pending = 0;            // requests in flight; polling waits for them before reloading

function currentList() { return lists.find((l) => l.id === currentId) || null; }

function rememberList(id) {
  currentId = id;
  try { localStorage.setItem(LIST_KEY, String(id)); } catch (e) { /* ignore */ }
}

async function load() {
  lists = await apiGet("/todos");
  if (!currentList()) {
    let saved = null;
    try { saved = Number(localStorage.getItem(LIST_KEY)); } catch (e) { /* ignore */ }
    rememberList((lists.find((l) => l.id === saved) || lists[0] || {}).id ?? null);
  }
  render();
}

// Send a change. Apply it locally first; on failure, reload and say so.
async function change(method, path, body, applyLocally) {
  if (applyLocally) { applyLocally(); render(); }
  pending++;
  try {
    return await apiSend(method, path, body);
  } catch (e) {
    toast(`${e.message} The list has been reloaded.`);
    await load().catch(() => {});
    return null;
  } finally {
    pending--;
  }
}

function renderTabs() {
  const tabs = document.getElementById("list-tabs");
  tabs.replaceChildren(...lists.map((l) => el("button", {
    type: "button", role: "tab", "aria-selected": String(l.id === currentId), "aria-pressed": String(l.id === currentId),
    text: `${l.name} (${l.items.filter((i) => !i.done).length})`,
    onclick: () => { rememberList(l.id); render(); },
  })));
}

function renderItems() {
  const list = currentList();
  document.getElementById("list-view").hidden = !list;
  if (!list) return;
  const items = document.getElementById("items");
  items.replaceChildren(...list.items.map((item, index) => {
    const toggle = el("button", { type: "button", class: `check-button${item.done ? " done" : ""}`,
      "aria-pressed": String(item.done),
      onclick: () => change("PATCH", `/todos/items/${item.id}`, { done: !item.done }, () => { item.done = !item.done; }) },
      el("span", { class: "box", "aria-hidden": "true", text: item.done ? "✓" : "" }),
      el("span", { class: "item-text", text: item.text }));
    const tools = el("span", { class: "tools" },
      el("button", { type: "button", text: "↑", "aria-label": "Move up", disabled: index === 0,
        onclick: () => moveItem(list, index, -1) }),
      el("button", { type: "button", text: "↓", "aria-label": "Move down", disabled: index === list.items.length - 1,
        onclick: () => moveItem(list, index, 1) }),
      el("button", { type: "button", class: "danger", text: "✕", "aria-label": `Delete ${item.text}`,
        onclick: () => change("DELETE", `/todos/items/${item.id}`, undefined,
          () => { list.items = list.items.filter((i) => i.id !== item.id); }) }));
    return el("li", { title: item.done && item.done_by_name ? `Done by ${item.done_by_name}` : `Added by ${item.created_by_name}` }, toggle, tools);
  }));
  document.getElementById("items-empty").hidden = list.items.length > 0;
  document.getElementById("clear-done").hidden = !list.items.some((i) => i.done);
}

function moveItem(list, index, delta) {
  const moved = list.items.splice(index, 1)[0];
  list.items.splice(index + delta, 0, moved);
  render();
  change("POST", `/todos/lists/${list.id}/reorder`, { ids: list.items.map((i) => i.id) });
}

function render() { renderTabs(); renderItems(); }

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("add-text");
  document.getElementById("add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const list = currentList();
    const text = input.value.trim();
    if (!list || !text) return;
    input.value = "";
    input.focus();                               // stay ready for the next item
    const temp = { id: -Date.now(), text, done: false, created_by_name: window.piscreenName };
    const saved = await change("POST", `/todos/lists/${list.id}/items`, { text }, () => list.items.push(temp));
    if (saved) { Object.assign(temp, saved); render(); }
  });
  document.getElementById("clear-done").addEventListener("click", () => {
    const list = currentList();
    if (list) change("POST", `/todos/lists/${list.id}/clear_done`, {}, () => { list.items = list.items.filter((i) => !i.done); });
  });
  document.getElementById("new-list-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const box = document.getElementById("new-list-name");
    const name = box.value.trim();
    if (!name) return;
    const created = await change("POST", "/todos/lists", { name });
    if (created) { box.value = ""; lists.push(created); rememberList(created.id); render(); }
  });
  document.getElementById("rename-list").addEventListener("click", async () => {
    const list = currentList();
    const name = list && prompt("New name for this list", list.name);
    if (name && name.trim()) change("PATCH", `/todos/lists/${list.id}`, { name: name.trim() }, () => { list.name = name.trim(); });
  });
  for (const [id, delta] of [["move-list-left", -1], ["move-list-right", 1]]) {
    document.getElementById(id).addEventListener("click", async () => {
      const index = lists.indexOf(currentList());
      const target = index + delta;
      if (index < 0 || target < 0 || target >= lists.length) return;
      await change("PATCH", `/todos/lists/${currentId}`, { position: target }, () => {
        const [moved] = lists.splice(index, 1);
        lists.splice(target, 0, moved);
      });
    });
  }
  document.getElementById("delete-list").addEventListener("click", async () => {
    const list = currentList();
    if (!list || !confirm(`Delete the list "${list.name}" and everything on it?`)) return;
    await change("DELETE", `/todos/lists/${list.id}`, undefined, () => {
      lists = lists.filter((l) => l.id !== list.id);
      rememberList(lists[0] ? lists[0].id : null);
    });
  });
  load().catch((e) => toast(e.message));
  onState((state) => {
    if (state.revisions.todos === todosRevision || pending > 0) return;   // try again on the next poll
    if (todosRevision !== null) load().catch(() => {});
    todosRevision = state.revisions.todos;
  });
});
