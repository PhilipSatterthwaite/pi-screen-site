// The Reminders page: add, edit and delete reminders.
"use strict";

let editingId = null;
let remindersRevision = null;
const REPEAT_TEXT = { daily: "every day", weekly: "every week", monthly: "every month", yearly: "every year" };

function reminderItem(r) {
  const bits = [r.due_label];
  if (REPEAT_TEXT[r.repeat]) bits.push(REPEAT_TEXT[r.repeat]);
  if (r.snoozed_label) bits.push(`snoozed until ${r.snoozed_label}`);
  if (r.state === "showing") bits.push("on the frame now");
  bits.push(`by ${r.created_by_name || "someone"}`);
  return el("li", {},
    el("div", {}, el("b", { text: r.title })),
    r.details ? el("div", { class: "meta", text: r.details }) : null,
    el("div", { class: "row" },
      el("span", { class: "meta grow", text: bits.join(" · ") }),
      el("button", { type: "button", class: "small", text: "Edit", onclick: () => startEdit(r) }),
      el("button", { type: "button", class: "small danger", text: "Delete",
        onclick: (e) => withButton(e.currentTarget, async () => {
          if (!confirm(`Delete "${r.title}"?`)) return;
          await apiSend("DELETE", `/reminders/${r.id}`);
          await load();
        }) })));
}

async function load() {
  const all = await apiGet("/reminders?states=scheduled,showing,missed");
  const upcoming = all.filter((r) => r.state !== "missed");
  const missed = all.filter((r) => r.state === "missed");
  document.getElementById("upcoming").replaceChildren(...upcoming.map(reminderItem));
  document.getElementById("upcoming-empty").hidden = upcoming.length > 0;
  document.getElementById("missed").replaceChildren(...missed.map(reminderItem));
  document.getElementById("missed-section").hidden = missed.length === 0;
}

function field(id) { return document.getElementById(id); }

function startEdit(r) {
  editingId = r.id;
  field("r-title").value = r.title;
  field("r-details").value = r.details || "";
  field("r-date").value = r.due_date;
  field("r-time").value = r.due_time;
  field("r-repeat").value = r.repeat;
  field("r-hold").value = r.takeover_minutes ? String(r.takeover_minutes) : "";
  field("r-save").textContent = "Save changes";
  field("r-cancel").hidden = false;
  field("r-title").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  editingId = null;
  field("reminder-form").reset();
  setDefaultTime();
  field("r-save").textContent = "Add reminder";
  field("r-cancel").hidden = true;
}

function setDefaultTime() {
  const soon = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  field("r-date").value = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`;
  field("r-time").value = `${pad(soon.getHours())}:00`;
}

document.addEventListener("DOMContentLoaded", () => {
  setDefaultTime();
  field("r-cancel").addEventListener("click", resetForm);
  field("reminder-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const hold = field("r-hold").value;
    const body = {
      title: field("r-title").value.trim(), details: field("r-details").value.trim(),
      date: field("r-date").value, time: field("r-time").value.slice(0, 5), repeat: field("r-repeat").value,
      takeover_minutes: hold ? Number(hold) : null,
    };
    await withButton(field("r-save"), async () => {
      if (editingId) await apiSend("PATCH", `/reminders/${editingId}`, body);
      else await apiSend("POST", "/reminders", body);
      toast(editingId ? "Saved." : "Reminder added.");
      resetForm();
      await load();
    });
  });
  load().catch((e) => toast(e.message));
  onState((state) => {
    if (remindersRevision !== null && state.revisions.reminders !== remindersRevision) load().catch(() => {});
    remindersRevision = state.revisions.reminders;
  });
});
