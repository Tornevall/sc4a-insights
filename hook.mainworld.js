// hook.mainworld.js
// Intercept fetch & XHR in the page's MAIN world and emit CustomEvents with parsed payloads.

// Guard against double-injection
if (!window.__scx_hook_installed__) {
  window.__scx_hook_installed__ = true;

  (function () {
    const TARGET_SUBSTR = "graph.soundcloud.com/graphql";

    function safeParseJSON(txt) {
      try { return JSON.parse(txt); } catch { return null; }
    }

    function emit(opName, variables, data, meta) {
      try {
        const detail = { opName, variables, data, meta };
        window.dispatchEvent(new CustomEvent("scx-graphql-capture", { detail }));
      } catch (e) {
        // Ignore serialization errors
      }
    }

    // -------------------- FETCH HOOK --------------------
    const _fetch = window.fetch;
    window.fetch = async function (...args) {
      const [url, options] = args;
      const isTarget = typeof url === "string" && url.includes(TARGET_SUBSTR);

      let opName = null;
      let variables = null;

      if (isTarget && options && typeof options.body === "string") {
        const req = safeParseJSON(options.body);
        opName = req && req.operationName ? req.operationName : null;
        variables = req && req.variables ? req.variables : null;
        // Debug hook
        // console.log("➡️ [fetch:req]", location.hostname, opName, req);
      }

      const resp = await _fetch.apply(this, args);

      if (isTarget) {
        try {
          const clone = resp.clone();
          clone.json().then((json) => {
            const data = json && typeof json.data !== "undefined" ? json.data : (typeof json !== "undefined" ? json : null);
            emit(opName, variables, data, {
              frame: location.href,
              host: location.hostname,
              via: "fetch"
            });
            // console.log("⬅️ [fetch:res]", location.hostname, opName, data);
          }).catch(() => {
            // not JSON, ignore
          });
        } catch { /* noop */ }
      }

      return resp;
    };

// --- XHR HOOK (fallback) ---
const _open = XMLHttpRequest.prototype.open;
const _send = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (...args) {
  this.__scx_url = args[1];
  return _open.apply(this, args);
};

XMLHttpRequest.prototype.send = function (body) {
  const isTarget = typeof this.__scx_url === "string" && this.__scx_url.includes("graph.soundcloud.com/graphql");
  let opName = null;
  let variables = null;

  if (isTarget && typeof body === "string") {
    const req = safeParseJSON(body);
    opName = req && req.operationName ? req.operationName : null;
    variables = req && req.variables ? req.variables : null;
  }

  if (isTarget) {
    this.addEventListener("load", function () {
      try {
        if (this.responseType === "" || this.responseType === "text") {
          const json = safeParseJSON(this.responseText);
          emit(opName, variables, json && typeof json.data !== "undefined" ? json.data : json, {
            frame: location.href,
            host: location.hostname,
            via: "xhr"
          });
        } else if (this.responseType === "blob" && this.response instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const json = safeParseJSON(reader.result);
            emit(opName, variables, json && typeof json.data !== "undefined" ? json.data : json, {
              frame: location.href,
              host: location.hostname,
              via: "xhr-blob"
            });
          };
          reader.readAsText(this.response);
        } else {
          // Not text/blob we care about
        }
      } catch (e) {
        console.warn("❌ XHR intercept error", e);
      }
    });
  }

  return _send.apply(this, arguments);
};

    // Signal up that hook is alive
    try {
      window.dispatchEvent(new CustomEvent("scx-hook-ready", {
        detail: { host: location.hostname, href: location.href }
      }));
    } catch {}
  })();
}
