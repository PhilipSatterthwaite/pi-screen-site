// The Photos page: shrink photos in the browser, upload them one at a time, and delete them.
"use strict";

let photosRevision = null;

// Draw the photo on a canvas no larger than maxEdge and export a JPEG. Resolves to null when the browser
// cannot decode the file; the original is then sent and the frame tries.
function shrinkInBrowser(file, maxEdge) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);   // browsers apply the photo's rotation
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// Upload with progress. XMLHttpRequest, because fetch cannot report upload progress.
function send(blob, name, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("photo", blob, name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/photos`);
    xhr.setRequestHeader("X-Piscreen", "1");
    xhr.setRequestHeader("X-Piscreen-Name", encodeURIComponent(window.piscreenName || getPhoneName()));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let payload = null;
      try { payload = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
      if (payload && payload.ok) resolve(payload.data);
      else if (xhr.status === 413) reject(new Error("That photo is too large."));
      else reject(new Error(payload && payload.error ? payload.error.message : `The frame answered ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new Error("Can't reach the frame. Is Tailscale on?"));
    xhr.send(form);
  });
}

async function uploadOne(file, row, maxEdge, maxMb) {
  const status = row.querySelector(".meta");
  status.textContent = "Shrinking…";
  const shrunk = await shrinkInBrowser(file, maxEdge);
  const blob = shrunk || file;
  if (blob.size > maxMb * 1024 * 1024) throw new Error(`Larger than ${maxMb} MB.`);
  await send(blob, "photo.jpg", (fraction) => { status.textContent = `Sending ${Math.round(fraction * 100)}%`; });
  status.textContent = "Done";
}

async function uploadAll(files) {
  const input = document.getElementById("photo-input");
  const maxEdge = Number(input.dataset.maxEdge);
  const maxMb = Number(input.dataset.maxMb);
  const progress = document.getElementById("progress");
  const rows = files.map((file) => el("li", { class: "row" }, el("span", { class: "grow", text: file.name }),
    el("span", { class: "meta", text: "Waiting" })));
  progress.replaceChildren(...rows);
  for (let i = 0; i < files.length; i++) {       // one at a time: the frame decodes one photo at a time
    try { await uploadOne(files[i], rows[i], maxEdge, maxMb); }
    catch (e) { rows[i].querySelector(".meta").textContent = e.message; }
    await load().catch(() => {});
  }
}

async function load() {
  const photos = await apiGet("/photos");
  document.getElementById("thumbs").replaceChildren(...photos.map((p) => el("figure", {},
    el("img", { src: `${API}/photos/${encodeURIComponent(p.name)}/thumb`, alt: "", loading: "lazy" }),
    el("figcaption", {},
      el("span", { class: "meta", text: new Date(p.date).toLocaleDateString() }),
      el("button", { type: "button", class: "small danger", text: "Delete",
        onclick: (e) => withButton(e.currentTarget, async () => {
          if (!confirm("Delete this photo from the frame?")) return;
          await apiSend("DELETE", `/photos/${encodeURIComponent(p.name)}`);
          await load();
        }) })))));
  document.getElementById("photos-empty").hidden = photos.length > 0;
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("photo-input");
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    if (files.length) uploadAll(files);
  });
  load().catch((e) => toast(e.message));
  onState((state) => {
    if (photosRevision !== null && state.revisions.photos !== photosRevision) load().catch(() => {});
    photosRevision = state.revisions.photos;
  });
});
