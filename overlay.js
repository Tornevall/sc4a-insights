// overlay.js
// Render a floating overlay and populate tables based on intercepted GraphQL events.
// All comments in English per request.

(function () {
  "use strict";

  // ---------- State ----------
  const state = {
    datasets: {
      Tracks: [],
      Countries: [],
      Cities: [],
      Playlists: [],
      Lookup: []
    },
    active: "Tracks",
    mounted: false,
  };

  // ---------- Utils ----------
  const $$ = (sel, root = document) => root.querySelector(sel);

  function nowStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function jsonToCsv(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const keys = Object.keys(arr[0]);
    const lines = [keys.join(",")];
    for (const row of arr) {
      lines.push(keys.map(k => JSON.stringify(row[k] ?? "")).join(","));
    }
    return lines.join("\n");
  }

  function downloadCSV(rows, filename) {
    const blob = new Blob([jsonToCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- DOM / Overlay ----------
  function buildOverlay() {
    if (state.mounted) return;

    // Container
    const wrap = document.createElement("div");
    wrap.id = "scx-overlay";
    wrap.className = "scx-overlay";
    wrap.innerHTML = `
      <div class="scx-head" id="scx-head">
        <div class="scx-title">SoundCloud Insights</div>
        <div class="scx-actions">
          <button id="scx-hide">Hide</button>
        </div>
      </div>
      <div class="scx-tabs" id="scx-tabs"></div>
      <div class="scx-body" id="scx-body"></div>
    `;
    document.documentElement.appendChild(wrap);

    // Drag support
    const head = $("#scx-head");
    let drag = { down: false, x: 0, y: 0, left: 0, top: 0 };
    head.addEventListener("mousedown", (e) => {
      drag.down = true;
      const r = wrap.getBoundingClientRect();
      drag.left = r.left;
      drag.top = r.top;
      drag.x = e.clientX;
      drag.y = e.clientY;
      wrap.classList.add("dragging");
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag.down) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      wrap.style.left = `${drag.left + dx}px`;
      wrap.style.top = `${drag.top + dy}px`;
      wrap.style.right = "auto";
      wrap.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => {
      drag.down = false;
      wrap.classList.remove("dragging");
    });

    // Hide/Show
    $("#scx-hide").addEventListener("click", () => {
      const b = $("#scx-body");
      const t = $("#scx-tabs");
      const hidden = b.classList.toggle("hidden");
      t.classList.toggle("hidden", hidden);
      $("#scx-hide").textContent = hidden ? "Show" : "Hide";
    });

    state.mounted = true;
    render();
  }

  function $(sel) { return document.getElementById(sel.replace(/^#/, "")); }

  function render() {
    if (!state.mounted) buildOverlay();

    // Tabs
    const tabs = $("#scx-tabs");
    tabs.innerHTML = "";
    Object.keys(state.datasets).forEach((key) => {
      const tab = document.createElement("div");
      tab.className = "scx-tab" + (state.active === key ? " active" : "");
      tab.textContent = key;
      tab.addEventListener("click", () => {
        state.active = key;
        render();
      });
      tabs.appendChild(tab);
    });

    // Body
    const body = $("#scx-body");
    const rows = state.datasets[state.active] || [];
    body.innerHTML = "";

    if (rows.length === 0) {
      body.innerHTML = `<div class="scx-empty">No data for ${state.active} yet. Trigger Insights panels to fetch.</div>`;
      return;
    }

    // Table
    const keys = Object.keys(rows[0]);
    const table = document.createElement("table");
    table.className = "scx-table";

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join("")}</tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = keys.map(k => `<td>${escapeHtml(r[k])}</td>`).join("");
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    body.appendChild(table);

// Export + Copy
const exp = document.createElement("div");
exp.className = "scx-export";

const btnCsv = document.createElement("button");
btnCsv.textContent = "Export CSV";
btnCsv.addEventListener("click", () => {
  downloadCSV(rows, `sc_${state.active}_${nowStamp()}.csv`);
});
exp.appendChild(btnCsv);

const btnCopy = document.createElement("button");
btnCopy.textContent = "Copy CSV";
btnCopy.style.marginLeft = "6px";
btnCopy.addEventListener("click", async () => {
  try {
    const text = jsonToCsv(rows);
    await navigator.clipboard.writeText(text);
    btnCopy.textContent = "Copied!";
    setTimeout(() => (btnCopy.textContent = "Copy CSV"), 1500);
  } catch (err) {
    console.error("Clipboard copy failed", err);
    alert("Failed to copy to clipboard");
  }
});
exp.appendChild(btnCopy);

body.appendChild(exp);

    body.appendChild(exp);
  }

  function escapeHtml(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ---------- Parser ----------
  function ingestPayload(detail) {
    // detail: { opName, variables, data, meta }
    const op = detail?.opName || "";
    const data = detail?.data || {};

    if (!op) return;

    switch (op) {
      case "TopTracksByWindow": {
        const arr = Array.isArray(data.topTracksByWindow) ? data.topTracksByWindow : [];
        state.datasets.Tracks = arr.map((t) => ({
          title: t?.track?.title ?? "",
          plays: t?.count ?? 0,
          url: t?.track?.permalinkUrl ?? "",
          artwork: t?.track?.artworkUrl ?? ""
        }));
        state.active = "Tracks";
        break;
      }

      case "TopCountriesByWindow": {
        const arr = Array.isArray(data.topCountriesByWindow) ? data.topCountriesByWindow : [];
        state.datasets.Countries = arr.map((c) => ({
          country: c?.country?.name ?? "",
          code: c?.country?.countryCode ?? "",
          plays: c?.count ?? 0
        }));
        state.active = "Countries";
        break;
      }

      case "TopCitiesByWindow": {
        const arr = Array.isArray(data.topCitiesByWindow) ? data.topCitiesByWindow : [];
        state.datasets.Cities = arr.map((c) => ({
          city: c?.city?.name ?? "",
          country: c?.city?.country?.name ?? "",
          code: c?.city?.country?.countryCode ?? "",
          plays: c?.count ?? 0
        }));
        state.active = "Cities";
        break;
      }

      case "TopPlaylistsByWindow": {
        const arr = Array.isArray(data.topPlaylistsByWindow) ? data.topPlaylistsByWindow : [];
        state.datasets.Playlists = arr.map((p) => ({
          playlist: p?.playlist?.title ?? "(null)",
          user: p?.playlist?.user?.username ?? "(unknown)",
          count: p?.count ?? 0,
          url: p?.playlist?.permalinkUrl ?? "",
          artwork: p?.playlist?.artworkUrl ?? ""
        }));
        state.active = "Playlists";
        break;
      }

      case "TrackByPermalink": {
        // Often returns just a URN. Still expose it.
        const obj = data?.trackByPermalink ?? {};
        state.datasets.Lookup = [obj];
        state.active = "Lookup";
        break;
      }

      default:
        // Unhandled op names are ignored on purpose
        break;
    }

    render();
  }

  // ---------- Boot ----------
  buildOverlay();

  // Listen for hook readiness (optional visual confirmation)
  window.addEventListener("scx-hook-ready", (e) => {
    // Could show a small toast if needed.
    // console.log("Hook ready in frame:", e?.detail);
  });

  // Main data channel from MAIN-world hook
  window.addEventListener("scx-graphql-capture", (e) => {
    ingestPayload(e.detail);
  });

})();
