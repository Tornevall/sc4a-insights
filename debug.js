function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
}

function looksPostLike(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }

  const keys = Object.keys(obj);
  const hasTitle = typeof obj.title === 'string' && obj.title.trim() !== '';
  const hasBody = ['body', 'text', 'message', 'content', 'description', 'caption'].some((key) => typeof obj[key] === 'string' && obj[key].trim() !== '');
  const hasUrl = ['url', 'permalinkUrl', 'permalink', 'link'].some((key) => typeof obj[key] === 'string' && /^https?:/i.test(obj[key]));
  const socialish = keys.some((key) => /post|thread|message|story|article|entry|note/i.test(key));

  return (hasTitle && (hasBody || hasUrl)) || (hasBody && hasUrl) || socialish;
}

function collectPostCandidates(value, seen = new WeakSet(), output = []) {
  if (!value || typeof value !== 'object') {
    return output;
  }
  if (seen.has(value)) {
    return output;
  }
  seen.add(value);

  if (looksPostLike(value)) {
    output.push(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPostCandidates(item, seen, output);
    }
    return output;
  }

  for (const child of Object.values(value)) {
    collectPostCandidates(child, seen, output);
  }

  return output;
}

function renderEvent(event) {
  const detail = event && event.payload ? event.payload : {};
  const data = detail && detail.data ? detail.data : {};
  const candidates = collectPostCandidates(data).slice(0, 10);
  const meta = detail && detail.meta ? detail.meta : {};
  const normalizedDataset = detail && detail.normalized_dataset ? detail.normalized_dataset : null;
  const ingest = detail && detail.ingest ? detail.ingest : null;

  return `
    <article class="event">
      <div class="event-head">
        <div>
          <div><strong>${escapeHtml(detail.opName || '(unknown operation)')}</strong></div>
          <div class="event-meta">${escapeHtml((event && event.capturedAt) || '')}</div>
        </div>
        <div class="chips">
          <span class="chip">${escapeHtml(meta.via || 'unknown')}</span>
          <span class="chip">tab ${escapeHtml(event && event.tabId != null ? event.tabId : 'n/a')}</span>
          <span class="chip">${escapeHtml(meta.host || '')}</span>
        </div>
      </div>
      <div class="event-body">
        <section class="section">
          <h3>Normalization / ingest</h3>
          <pre>${escapeHtml(safeJson({ normalized_dataset: normalizedDataset, ingest }))}</pre>
        </section>
        <section class="section">
          <h3>Variables</h3>
          <pre>${escapeHtml(safeJson(detail && typeof detail.variables !== 'undefined' ? detail.variables : null))}</pre>
        </section>
        <section class="section">
          <h3>Potential post-like objects (${candidates.length})</h3>
          <pre>${escapeHtml(safeJson(candidates))}</pre>
        </section>
        <section class="section">
          <h3>Raw response data</h3>
          <pre>${escapeHtml(safeJson(data))}</pre>
        </section>
        <section class="section">
          <h3>Capture metadata</h3>
          <pre>${escapeHtml(safeJson(meta))}</pre>
        </section>
      </div>
    </article>
  `;
}

async function fetchEvents() {
  const response = await chrome.runtime.sendMessage({ type: 'scx-get-debug-events' });
  return response && Array.isArray(response.events) ? response.events : [];
}

async function clearEvents() {
  await chrome.runtime.sendMessage({ type: 'scx-clear-debug-events' });
}

function render(events) {
  const root = document.getElementById('events');
  const summary = document.getElementById('summary');
  summary.textContent = `${events.length} captured GraphQL event(s)`;

  if (!events.length) {
    root.innerHTML = '<div class="empty">No captures yet. Trigger GraphQL/XHR calls in SoundCloud and they will appear here in real time.</div>';
    return;
  }

  root.innerHTML = events.map(renderEvent).join('');
}

async function refresh() {
  render(await fetchEvents());
}

document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('clear').addEventListener('click', async () => {
  await clearEvents();
  await refresh();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'scx-debug-event') {
    refresh();
  }
});

refresh();

