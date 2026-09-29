// The Notes page: send a note, and pin or delete the current ones.
"use strict";

let notesRevision = null;

function noteItem(note) {
  const pin = el("button", { type: "button", class: "small", "aria-pressed": String(note.pinned),
    text: note.pinned ? "Pinned" : "Pin",
    onclick: (e) => withButton(e.currentTarget, async () => {
      await apiSend("PATCH", `/notes/${note.id}`, { pinned: !note.pinned });
      await loadNotes();
    }) });
  const remove = el("button", { type: "button", class: "small danger", text: "Delete",
    onclick: (e) => withButton(e.currentTarget, async () => {
      if (!confirm("Delete this note?")) return;
      await apiSend("DELETE", `/notes/${note.id}`);
      await loadNotes();
    }) });
  const bits = [note.author_name || "Someone", `sent ${formatWhen(note.created_at)}`];
  if (note.expires_at) bits.push(`until ${formatWhen(note.expires_at)}`);
  return el("li", {},
    el("div", { text: note.body, style: "white-space: pre-wrap; overflow-wrap: anywhere" }),
    el("div", { class: "row" }, el("span", { class: "meta grow", text: bits.join(" · ") }), pin, remove));
}

function formatWhen(iso) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? formatTime(iso) : date.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

async function loadNotes() {
  const notes = await apiGet("/notes");
  const list = document.getElementById("notes");
  list.replaceChildren(...notes.map(noteItem));
  document.getElementById("notes-empty").hidden = notes.length > 0;
}

function updateCount() {
  const box = document.getElementById("note-body");
  document.getElementById("note-count").textContent = `${box.value.length} / ${box.maxLength}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const box = document.getElementById("note-body");
  box.addEventListener("input", updateCount);
  document.getElementById("note-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = box.value.trim();
    if (!text) return;
    await withButton(document.getElementById("note-send"), async () => {
      const result = await apiSend("POST", "/notes", {
        body: text,
        expires: document.getElementById("note-expires").value,
        show_now: document.getElementById("note-show-now").checked,
        pinned: document.getElementById("note-pinned").checked,
      });
      box.value = "";
      updateCount();
      document.getElementById("note-show-now").checked = false;
      document.getElementById("note-pinned").checked = false;
      toast(result.takeover ? "Sent. It will show on the frame shortly." : "Sent.");
      await loadNotes();
    });
  });
  loadNotes().catch((e) => toast(e.message));
  onState((state) => {
    if (notesRevision !== null && state.revisions.notes !== notesRevision) loadNotes().catch(() => {});
    notesRevision = state.revisions.notes;
  });
});
