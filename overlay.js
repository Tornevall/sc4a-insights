// overlay.js
// Render a floating overlay and populate tables based on intercepted GraphQL events.
// All comments in English per request.

 (function () {
  "use strict";

  const OVERLAY_SETTINGS_KEYS = ['scxOverlayEnabled', 'scxOverlayStartsCollapsed'];
  const IS_TOP_FRAME = window.top === window.self;

  // ---------- State ----------
  const state = {
    datasets: {
      Tracks: [],
      Countries: [],
      Cities: [],
      Playlists: [],
      Totals: [],
      ISRCs: [],
      Lookup: []
    },
    active: "Tracks",
    mounted: false,
    collapsed: true,
    overlayEnabled: true,
    overlayStartsCollapsed: true,
    hookReady: false,
    lastCaptureMeta: null,
  };

  // ---------- Utils ----------
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
      lines.push(keys.map(k => JSON.stringify(typeof row[k] === "undefined" ? "" : row[k])).join(","));
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

  function isRelevantInsightsPage() {
    const host = String(location.hostname || '').toLowerCase();
    const path = String(location.pathname || '').toLowerCase();
    return host.includes('insights')
      || host.includes('artists')
      || /\/insights(?:\/|$)/.test(path)
      || /\/stats(?:\/|$)/.test(path)
      || /\/you\/insights(?:\/|$)/.test(path)
      || /\/for-artists(?:\/|$)/.test(path);
  }

  function reportTabStatus(extra) {
    if (!IS_TOP_FRAME) return;
    try {
      chrome.runtime.sendMessage({
        type: 'scx-tab-status-update',
        payload: Object.assign({
          pageUrl: location.href,
          title: document.title || '',
          hookReady: !!state.hookReady,
          overlayMounted: !!state.mounted,
          overlayVisible: !!(state.overlayEnabled && hasVisibleData()),
          hasVisibleData: hasVisibleData(),
          isRelevantInsightsPage: isRelevantInsightsPage(),
          activeDataset: state.active,
          datasetCount: Object.values(state.datasets).filter((rows) => Array.isArray(rows) && rows.length > 0).length,
          visibleRowCount: Array.isArray(state.datasets[state.active]) ? state.datasets[state.active].length : 0,
          lastCapture: state.lastCaptureMeta ? {
            opName: state.lastCaptureMeta.opName || null,
            host: state.lastCaptureMeta.host || null,
          } : null,
        }, extra || {}),
      });
    } catch (error) {
    }
  }

  function hasVisibleData() {
    return Object.values(state.datasets).some((rows) => Array.isArray(rows) && rows.length > 0);
  }

  function toCollectionItems(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      if (Array.isArray(value.collection)) return value.collection;
      if (Array.isArray(value.items)) return value.items;
      if (Array.isArray(value.nodes)) return value.nodes;
      if (Array.isArray(value.results)) return value.results;
    }
    return [];
  }

  // ---------- DOM / Overlay ----------
  function buildOverlay() {
    if (state.mounted) return;

    const wrap = document.createElement("div");
    const brandIconUrl = chrome.runtime.getURL("scx-insights-mark.svg");
    wrap.id = "scx-overlay";
    wrap.className = "scx-overlay";
    wrap.innerHTML = `
      <div class="scx-head" id="scx-head">
        <div class="scx-title-wrap">
          <img class="scx-title-icon" src="${brandIconUrl}" alt="SoundCloud Insights icon">
          <div class="scx-title">SoundCloud Insights</div>
        </div>
        <div class="scx-actions">
          <button id="scx-debug-window">Debug Window</button>
          <button id="scx-hide">Hide</button>
        </div>
      </div>
      <div class="scx-tabs" id="scx-tabs"></div>
      <div class="scx-body" id="scx-body"></div>
      <div class="scx-summary" id="scx-summary"></div>
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

    $("#scx-debug-window").addEventListener("click", async () => {
      try {
        await chrome.runtime.sendMessage({ type: "scx-open-debug-window" });
      } catch (err) {
        console.error("Failed to open debug window", err);
      }
    });

    $("#scx-hide").addEventListener("click", () => {
      state.collapsed = !state.collapsed;
      updateOverlayVisibility();
      render();
    });

    state.mounted = true;
    updateOverlayVisibility();
    reportTabStatus();
  }

  function $(sel) { return document.getElementById(sel.replace(/^#/, "")); }

  function render() {
    if (!state.overlayEnabled || !hasVisibleData()) {
      destroyOverlay();
      return;
    }
    if (!state.mounted) buildOverlay();
    updateOverlayVisibility();

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

    const body = $("#scx-body");
    const summary = $("#scx-summary");
    const rows = state.datasets[state.active] || [];
    body.innerHTML = "";
    summary.textContent = buildSummaryText();

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
  }

  function destroyOverlay() {
    const wrap = $("#scx-overlay");
    if (wrap && wrap.parentNode) {
      wrap.parentNode.removeChild(wrap);
    }
    state.mounted = false;
    reportTabStatus({ overlayMounted: false, overlayVisible: false, hasVisibleData: hasVisibleData() });
  }

  function updateOverlayVisibility() {
    const wrap = $("#scx-overlay");
    if (!wrap) return;
    const body = $("#scx-body");
    const tabs = $("#scx-tabs");
    const hideBtn = $("#scx-hide");
    wrap.classList.toggle('hidden', !state.overlayEnabled || !hasVisibleData());
    wrap.classList.toggle('scx-collapsed', !!state.collapsed);
    if (body) {
      body.classList.toggle('hidden', !!state.collapsed);
    }
    if (tabs) {
      tabs.classList.toggle('hidden', !!state.collapsed);
    }
    if (hideBtn) {
      hideBtn.textContent = state.collapsed ? 'Show' : 'Hide';
    }
    reportTabStatus();
  }

  function buildSummaryText() {
    const datasetCount = Object.values(state.datasets).filter((rows) => Array.isArray(rows) && rows.length > 0).length;
    const activeRows = Array.isArray(state.datasets[state.active]) ? state.datasets[state.active].length : 0;
    const meta = state.lastCaptureMeta || {};
    return `${datasetCount} dataset(s) available · ${state.active}: ${activeRows} row(s)`
      + (meta.opName ? ` · Last op: ${meta.opName}` : '')
      + (meta.host ? ` · ${meta.host}` : '');
  }

  async function loadOverlaySettings() {
    try {
      const settings = await chrome.storage.sync.get(OVERLAY_SETTINGS_KEYS);
      state.overlayEnabled = settings.scxOverlayEnabled !== false;
      state.overlayStartsCollapsed = settings.scxOverlayStartsCollapsed !== false;
      if (!state.mounted) {
        state.collapsed = state.overlayStartsCollapsed;
      }
      if (!state.overlayEnabled) {
        destroyOverlay();
      } else if (hasVisibleData()) {
        render();
      }
    } catch (error) {
      state.overlayEnabled = true;
      state.overlayStartsCollapsed = true;
    }
  }

  function escapeHtml(v) {
    if (v === null || v === undefined) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function forwardCapture(detail) {
    try {
      chrome.runtime.sendMessage({
        type: "scx-graphql-capture",
        payload: detail,
      });
    } catch (err) {
      console.error("Failed to forward GraphQL capture", err);
    }
  }

  // ---------- Parser ----------
  function ingestPayload(detail) {
    const op = detail && detail.opName ? detail.opName : "";
    const data = detail && detail.data ? detail.data : {};

    if (!op) return;

    switch (op) {
      case "TopTracksByWindow":
      case "TopTracksByRange": {
        const arr = toCollectionItems(data.topTracksByWindow || data.topTracksByRange);
        state.datasets.Tracks = arr.map((t) => ({
          urn: t && t.track && t.track.urn ? t.track.urn : "",
          title: t && t.track && t.track.title ? t.track.title : "",
          plays: t && typeof t.count !== "undefined" ? t.count : 0,
          url: t && t.track && t.track.permalinkUrl ? t.track.permalinkUrl : "",
          artwork: t && t.track && t.track.artworkUrl ? t.track.artworkUrl : "",
          created_at: t && t.track && t.track.createdAt ? t.track.createdAt : "",
          timeseries_by_window: t && t.track && Array.isArray(t.track.timeseriesByWindow) ? JSON.stringify(t.track.timeseriesByWindow) : "[]"
        }));
        state.active = "Tracks";
        break;
      }

      case "TopCountriesByWindow": {
        const arr = Array.isArray(data.topCountriesByWindow) ? data.topCountriesByWindow : [];
        state.datasets.Countries = arr.map((c) => ({
          country: c && c.country && c.country.name ? c.country.name : "",
          code: c && c.country && c.country.countryCode ? c.country.countryCode : "",
          plays: c && typeof c.count !== "undefined" ? c.count : 0
        }));
        state.active = "Countries";
        break;
      }

      case "TopCitiesByWindow": {
        const arr = Array.isArray(data.topCitiesByWindow) ? data.topCitiesByWindow : [];
        state.datasets.Cities = arr.map((c) => ({
          city: c && c.city && c.city.name ? c.city.name : "",
          country: c && c.city && c.city.country && c.city.country.name ? c.city.country.name : "",
          code: c && c.city && c.city.country && c.city.country.countryCode ? c.city.country.countryCode : "",
          plays: c && typeof c.count !== "undefined" ? c.count : 0
        }));
        state.active = "Cities";
        break;
      }

      case "TopPlaylistsByWindow": {
        const arr = toCollectionItems(data.topPlaylistsByWindow);
        state.datasets.Playlists = arr.map((p) => ({
          urn: p && p.playlist && p.playlist.urn ? p.playlist.urn : "",
          playlist: p && p.playlist && p.playlist.title ? p.playlist.title : "(null)",
          user: p && p.playlist && p.playlist.user && p.playlist.user.username ? p.playlist.user.username : "(unknown)",
          count: p && typeof p.count !== "undefined" ? p.count : 0,
          url: p && p.playlist && p.playlist.permalinkUrl ? p.playlist.permalinkUrl : "",
          artwork: p && p.playlist && p.playlist.artworkUrl ? p.playlist.artworkUrl : ""
        }));
        state.active = "Playlists";
        break;
      }

      case "TotalsByWindow": {
        const totals = data && data.totalsByWindow && typeof data.totalsByWindow === 'object' ? data.totalsByWindow : {};
        state.datasets.Totals = Object.keys(totals).map((metricKey) => ({
          label: String(metricKey).replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
          metric_key: metricKey,
          metric_value: typeof totals[metricKey] !== 'undefined' ? totals[metricKey] : '',
        }));
        state.active = "Totals";
        break;
      }

      case "IsrcsWithTracks": {
        const arr = toCollectionItems(data && data.isrcsWithTracks);
        state.datasets.ISRCs = arr.map((item) => ({
          isrc: item && item.isrc ? item.isrc : "",
          sc_track_id: item && item.metadata && item.metadata.scTrackId ? item.metadata.scTrackId : "",
          title: item && item.metadata && item.metadata.title ? item.metadata.title : (item && item.track && item.track.title ? item.track.title : ""),
          track_title: item && item.track && item.track.title ? item.track.title : "",
          urn: item && item.track && item.track.urn ? item.track.urn : "",
          url: item && item.track && item.track.permalinkUrl ? item.track.permalinkUrl : "",
          artwork: item && item.metadata && item.metadata.artworkUrl ? item.metadata.artworkUrl : (item && item.track && item.track.artworkUrl ? item.track.artworkUrl : ""),
          released_at: item && item.metadata && item.metadata.releasedAt ? item.metadata.releasedAt : "",
          release_date: item && item.track && item.track.releaseDate ? item.track.releaseDate : "",
        }));
        state.active = "ISRCs";
        break;
      }

      case "TrackByPermalink": {
        // Often returns just a URN. Still expose it.
        const obj = data && data.trackByPermalink ? data.trackByPermalink : {};
        state.datasets.Lookup = [obj];
        state.active = "Lookup";
        break;
      }

      default:
        break;
    }

    state.lastCaptureMeta = detail && detail.meta ? Object.assign({ opName: op }, detail.meta) : { opName: op };
    if (!hasVisibleData() && !isRelevantInsightsPage()) {
      reportTabStatus({
        lastCapture: { opName: op, host: state.lastCaptureMeta.host || null },
        hookReady: !!state.hookReady,
      });
      return;
    }
    if (!state.mounted) {
      state.collapsed = state.overlayStartsCollapsed;
    }
    render();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }
    if (changes.scxOverlayEnabled) {
      state.overlayEnabled = changes.scxOverlayEnabled.newValue !== false;
    }
    if (changes.scxOverlayStartsCollapsed) {
      state.overlayStartsCollapsed = changes.scxOverlayStartsCollapsed.newValue !== false;
    }
    if (!state.overlayEnabled) {
      destroyOverlay();
      return;
    }
    if (hasVisibleData()) {
      render();
    }
  });

  window.addEventListener("scx-hook-ready", () => {
    state.hookReady = true;
    reportTabStatus({ hookReady: true, isRelevantInsightsPage: isRelevantInsightsPage() });
  });

  window.addEventListener("scx-graphql-capture", (e) => {
    forwardCapture(e.detail);
    ingestPayload(e.detail);
  });

  loadOverlaySettings().then(() => {
    state.hookReady = !!state.hookReady;
    reportTabStatus({ hookReady: false, isRelevantInsightsPage: isRelevantInsightsPage() });
  });

})();
