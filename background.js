const STATE_KEY = 'scxDebugEvents';
const MAX_EVENTS = 300;
const MAX_PENDING_CAPTURES = 50;
const MAX_SENT_FINGERPRINTS = 200;
const PROD_BASE_URL = 'https://tools.tornevall.net';
const DEV_BASE_URL = 'https://tools.tornevall.com';
const SOUNDCLOUD_INGEST_PATH = '/api/social-media-tools/soundcloud/ingest';
let debugWindowId = null;
let eventsCache = [];
let tabStatusCache = {};

function getToolsBaseUrl(devMode) {
  return devMode ? DEV_BASE_URL : PROD_BASE_URL;
}

function supportedOperationToDataset(opName) {
  return {
    TopTracksByWindow: 'tracks',
    TopTracksByRange: 'tracks',
    TopCountriesByWindow: 'countries',
    TopCitiesByWindow: 'cities',
    TopPlaylistsByWindow: 'playlists',
    TotalsByWindow: 'totals',
    IsrcsWithTracks: 'isrcs',
    TrackByPermalink: 'lookup',
  }[String(opName || '').trim()] || null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractCollectionItems(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    if (Array.isArray(value.collection)) {
      return value.collection;
    }
    if (Array.isArray(value.items)) {
      return value.items;
    }
    if (Array.isArray(value.nodes)) {
      return value.nodes;
    }
    if (Array.isArray(value.results)) {
      return value.results;
    }
  }

  return [];
}

function sumMetric(rows, keys) {
  return safeArray(rows).reduce((sum, row) => {
    if (!row || typeof row !== 'object') {
      return sum;
    }

    const normalizedKeys = Array.isArray(keys) ? keys : [keys];
    for (let index = 0; index < normalizedKeys.length; index += 1) {
      const value = row[normalizedKeys[index]];
      if (typeof value !== 'undefined' && !isNaN(Number(value))) {
        return sum + Number(value);
      }
    }

    return sum;
  }, 0);
}

function formatMetricLabel(metricKey) {
  return String(metricKey || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildSimpleHash(value) {
  const input = String(value || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }

  return 'scx_' + Math.abs(hash).toString(36);
}

function buildCaptureFingerprint(normalizedPayload) {
  if (!normalizedPayload || typeof normalizedPayload !== 'object') {
    return '';
  }

  return buildSimpleHash(JSON.stringify({
    source_url: normalizedPayload.source_url || '',
    dataset_key: normalizedPayload.dataset_key || '',
    operation_name: normalizedPayload.operation_name || '',
    window_label: normalizedPayload.window_label || '',
    rows: Array.isArray(normalizedPayload.rows) ? normalizedPayload.rows : [],
  }));
}

function normalizeCaptureForIngest(payload) {
  const opName = payload && payload.opName ? String(payload.opName).trim() : '';
  const datasetKey = supportedOperationToDataset(opName);
  if (!datasetKey) {
    return null;
  }

  const variables = payload && payload.variables && typeof payload.variables === 'object' ? payload.variables : {};
  const data = payload && payload.data && typeof payload.data === 'object' ? payload.data : {};
  const meta = payload && payload.meta && typeof payload.meta === 'object' ? payload.meta : {};

  // Use only the origin (scheme + host) so that every capture from the same
  // SoundCloud insights site maps to ONE stable source, regardless of which
  // sub-page (tracks, countries, a specific track URL, …) the user was on.
  let sourceUrl = '';
  try {
    sourceUrl = meta.frame ? new URL(String(meta.frame)).origin : '';
  } catch (_e) {
    sourceUrl = String(meta.frame || '').trim();
  }
  if (!sourceUrl) {
    return null;
  }

  let rows = [];
  let totalMetric = null;
  switch (datasetKey) {
    case 'tracks': {
      rows = extractCollectionItems(data.topTracksByWindow || data.topTracksByRange).map((item) => {
        const track = item && item.track && typeof item.track === 'object' ? item.track : {};
        return {
          urn: track.urn ? String(track.urn) : '',
          title: track.title ? String(track.title) : '',
          plays: item && typeof item.count !== 'undefined' ? Number(item.count) || 0 : 0,
          url: track.permalinkUrl ? String(track.permalinkUrl) : '',
          permalink: track.permalink ? String(track.permalink) : '',
          artwork: track.artworkUrl ? String(track.artworkUrl) : '',
          created_at: track.createdAt ? String(track.createdAt) : '',
          timeseries_by_window: Array.isArray(track.timeseriesByWindow) ? track.timeseriesByWindow : [],
        };
      });
      totalMetric = sumMetric(rows, ['plays']) || null;
      break;
    }
    case 'countries': {
      rows = extractCollectionItems(data.topCountriesByWindow).map((item) => ({
        country: item && item.country && item.country.name ? item.country.name : '',
        code: item && item.country && item.country.countryCode ? item.country.countryCode : '',
        country_code: item && item.country && item.country.countryCode ? item.country.countryCode : '',
        plays: item && typeof item.count !== 'undefined' ? Number(item.count) || 0 : 0,
      }));
      totalMetric = sumMetric(rows, ['plays']) || null;
      break;
    }
    case 'cities': {
      rows = extractCollectionItems(data.topCitiesByWindow).map((item) => ({
        city: item && item.city && item.city.name ? item.city.name : '',
        country: item && item.city && item.city.country && item.city.country.name ? item.city.country.name : '',
        code: item && item.city && item.city.country && item.city.country.countryCode ? item.city.country.countryCode : '',
        country_code: item && item.city && item.city.country && item.city.country.countryCode ? item.city.country.countryCode : '',
        plays: item && typeof item.count !== 'undefined' ? Number(item.count) || 0 : 0,
      }));
      totalMetric = sumMetric(rows, ['plays']) || null;
      break;
    }
    case 'playlists': {
      rows = extractCollectionItems(data.topPlaylistsByWindow).map((item) => {
        const playlist = item && item.playlist && typeof item.playlist === 'object' ? item.playlist : {};
        return {
          urn: playlist.urn ? String(playlist.urn) : '',
          playlist: playlist.title ? String(playlist.title) : '',
          user: playlist.user && playlist.user.username ? String(playlist.user.username) : '',
          count: item && typeof item.count !== 'undefined' ? Number(item.count) || 0 : 0,
          url: playlist.permalinkUrl ? String(playlist.permalinkUrl) : '',
          artwork: playlist.artworkUrl ? String(playlist.artworkUrl) : '',
        };
      });
      totalMetric = sumMetric(rows, ['count']) || null;
      break;
    }
    case 'totals': {
      const totals = data && data.totalsByWindow && typeof data.totalsByWindow === 'object'
        ? data.totalsByWindow
        : {};
      rows = Object.keys(totals).map((metricKey) => {
        if (typeof totals[metricKey] === 'undefined' || isNaN(Number(totals[metricKey]))) {
          return null;
        }

        return {
          label: formatMetricLabel(metricKey),
          metric_key: String(metricKey),
          metric_value: Number(totals[metricKey]) || 0,
          count: Number(totals[metricKey]) || 0,
        };
      }).filter(Boolean);
      totalMetric = sumMetric(rows, ['metric_value', 'count']) || null;
      break;
    }
    case 'isrcs': {
      rows = extractCollectionItems(data && data.isrcsWithTracks).map((item) => {
        const track = item && item.track && typeof item.track === 'object' ? item.track : {};
        const metadata = item && item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        return {
          isrc: item && item.isrc ? String(item.isrc) : '',
          sc_track_id: metadata && metadata.scTrackId ? String(metadata.scTrackId) : '',
          title: metadata && metadata.title ? String(metadata.title) : (track && track.title ? String(track.title) : ''),
          track_title: track && track.title ? String(track.title) : '',
          urn: track && track.urn ? String(track.urn) : '',
          url: track && track.permalinkUrl ? String(track.permalinkUrl) : '',
          permalink: track && track.permalink ? String(track.permalink) : '',
          artwork: metadata && metadata.artworkUrl ? String(metadata.artworkUrl) : (track && track.artworkUrl ? String(track.artworkUrl) : ''),
          released_at: metadata && metadata.releasedAt ? String(metadata.releasedAt) : '',
          release_date: track && track.releaseDate ? String(track.releaseDate) : '',
          has_track: !!(track && Object.keys(track).length),
        };
      });
      totalMetric = null;
      break;
    }
    case 'lookup': {
      rows = data && data.trackByPermalink && typeof data.trackByPermalink === 'object' ? [data.trackByPermalink] : [];
      break;
    }
  }

  return {
    source_url: sourceUrl,
    source_label: 'SoundCloud 4 Artists',
    source_type: 'soundcloud_4artists',
    dataset_key: datasetKey,
    operation_name: opName,
    window_label: variables && (variables.timeWindow || variables.window || variables.selectedWindow) ? String(variables.timeWindow || variables.window || variables.selectedWindow) : '',
    captured_at: new Date().toISOString(),
    account_urn: variables && variables.urn ? String(variables.urn) : '',
    account_username: variables && variables.username ? String(variables.username) : '',
    account_permalink_url: variables && variables.permalinkUrl ? String(variables.permalinkUrl) : '',
    // When SoundCloud calls TopCountriesByWindow / TopCitiesByWindow / TotalsByWindow /
    // TopPlaylistsByWindow for a specific track it passes trackUrn in the GraphQL variables.
    // Promote it to a dedicated top-level field so the backend can use it without
    // having to dig through the opaque variables object.
    filter_track_urn: variables && variables.trackUrn ? String(variables.trackUrn) : '',
    rows,
    row_count: rows.length,
    total_metric: totalMetric,
    variables,
    meta,
    summary: {
      row_count: rows.length,
      total_metric: totalMetric,
    },
  };
}

async function ingestNormalizedCapture(payload) {
  return callSoundCloudIngest(payload);
}

async function callSoundCloudIngest(payload, explicitSettings) {
  const settings = explicitSettings || await chrome.storage.sync.get([
    'scxToolsToken',
    'scxDevMode',
  ]);

  if (!settings.scxToolsToken) {
    return { attempted: false, ok: false, reason: 'missing_tools_token' };
  }

  try {
    const response = await fetch(getToolsBaseUrl(!!settings.scxDevMode) + SOUNDCLOUD_INGEST_PATH, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.scxToolsToken,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    return {
      attempted: true,
      ok: !!(response.ok && data && data.ok !== false),
      status: response.status,
      message: data && (data.message || data.error) ? String(data.message || data.error) : '',
      event_id: data && data.event ? data.event.id : null,
      source_id: data && data.source ? data.source.id : null,
      duplicate_detected: !!(data && data.duplicate_detected),
      payload_hash: data && data.payload_hash ? data.payload_hash : null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: 0,
      message: error && error.message ? error.message : 'Network request failed.',
    };
  }
}

function ensureTabCollections(status) {
  if (!status || typeof status !== 'object') {
    return;
  }

  if (!Array.isArray(status.pendingCaptures)) {
    status.pendingCaptures = [];
  }
  if (!Array.isArray(status.sentFingerprints)) {
    status.sentFingerprints = [];
  }
  status.pendingCaptureCount = Array.isArray(status.pendingCaptures) ? status.pendingCaptures.length : 0;
  status.duplicateCaptureCount = typeof status.duplicateCaptureCount === 'number' ? status.duplicateCaptureCount : 0;
}

function rememberSentFingerprint(status, fingerprint) {
  if (!status || !fingerprint) {
    return;
  }

  ensureTabCollections(status);
  status.sentFingerprints = status.sentFingerprints.filter((existingFingerprint) => existingFingerprint !== fingerprint);
  status.sentFingerprints.unshift(fingerprint);
  if (status.sentFingerprints.length > MAX_SENT_FINGERPRINTS) {
    status.sentFingerprints = status.sentFingerprints.slice(0, MAX_SENT_FINGERPRINTS);
  }
}

function queuePendingCapture(tabId, rawPayload, normalizedPayload) {
  const status = ensureTabStatus(tabId);
  const fingerprint = buildCaptureFingerprint(normalizedPayload);

  ensureTabCollections(status);

  if (!fingerprint) {
    return {
      queued: false,
      duplicate: false,
      reason: 'missing_fingerprint',
      fingerprint: '',
      pending_count: status.pendingCaptureCount,
    };
  }

  if (status.sentFingerprints.indexOf(fingerprint) !== -1) {
    status.duplicateCaptureCount += 1;
    return {
      queued: false,
      duplicate: true,
      reason: 'already_ingested',
      fingerprint,
      pending_count: status.pendingCaptureCount,
    };
  }

  if (status.pendingCaptures.some((entry) => entry && entry.fingerprint === fingerprint)) {
    status.duplicateCaptureCount += 1;
    return {
      queued: false,
      duplicate: true,
      reason: 'already_buffered',
      fingerprint,
      pending_count: status.pendingCaptureCount,
    };
  }

  status.pendingCaptures.unshift({
    fingerprint,
    normalizedPayload,
    rawPayload: rawPayload || null,
    capturedAt: normalizedPayload && normalizedPayload.captured_at ? normalizedPayload.captured_at : new Date().toISOString(),
  });
  if (status.pendingCaptures.length > MAX_PENDING_CAPTURES) {
    status.pendingCaptures = status.pendingCaptures.slice(0, MAX_PENDING_CAPTURES);
  }
  status.pendingCaptureCount = status.pendingCaptures.length;

  return {
    queued: true,
    duplicate: false,
    reason: '',
    fingerprint,
    pending_count: status.pendingCaptureCount,
  };
}

async function flushPendingCapturesForTab(tabId, explicitSettings) {
  const status = ensureTabStatus(tabId);
  const settings = explicitSettings || await chrome.storage.sync.get([
    'scxToolsToken',
    'scxDevMode',
  ]);

  ensureTabCollections(status);

  if (!status.pendingCaptures.length) {
    status.lastFlush = {
      attempted: false,
      ok: true,
      reason: 'nothing_pending',
      flushed_count: 0,
      duplicate_count: 0,
      failed_count: 0,
      remaining_count: 0,
      flushed_at: new Date().toISOString(),
    };
    return status.lastFlush;
  }

  const pendingEntries = status.pendingCaptures.slice();
  const remainingEntries = [];
  let flushedCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;
  let lastResult = null;

  for (let index = 0; index < pendingEntries.length; index += 1) {
    const entry = pendingEntries[index];
    if (!entry || !entry.normalizedPayload) {
      continue;
    }

    const ingestResult = await callSoundCloudIngest(entry.normalizedPayload, settings);
    lastResult = ingestResult;

    if (ingestResult && ingestResult.ok) {
      flushedCount += 1;
      if (ingestResult.duplicate_detected) {
        duplicateCount += 1;
      }
      rememberSentFingerprint(status, entry.fingerprint);
      continue;
    }

    failedCount += 1;
    remainingEntries.push(entry);
  }

  status.pendingCaptures = remainingEntries;
  status.pendingCaptureCount = remainingEntries.length;
  status.lastFlush = {
    attempted: true,
    ok: failedCount === 0,
    flushed_count: flushedCount,
    duplicate_count: duplicateCount,
    failed_count: failedCount,
    remaining_count: remainingEntries.length,
    flushed_at: new Date().toISOString(),
    last_result: lastResult,
  };

  return status.lastFlush;
}

async function flushAllPendingCaptures(explicitSettings) {
  const keys = Object.keys(tabStatusCache);
  for (let index = 0; index < keys.length; index += 1) {
    const status = tabStatusCache[keys[index]];
    await flushPendingCapturesForTab(status ? status.tabId : null, explicitSettings);
  }
}

async function loadEvents() {
  try {
    const store = await chrome.storage.session.get(STATE_KEY);
    eventsCache = Array.isArray(store[STATE_KEY]) ? store[STATE_KEY] : [];
  } catch {
    eventsCache = [];
  }
  return eventsCache;
}

async function saveEvents() {
  try {
    await chrome.storage.session.set({ [STATE_KEY]: eventsCache });
  } catch {
    // Ignore storage issues in the background worker.
  }
}

async function ensureLoaded() {
  if (!Array.isArray(eventsCache) || eventsCache.length === 0) {
    await loadEvents();
  }
}

async function openDebugWindow() {
  const debugUrl = chrome.runtime.getURL('debug.html');

  if (debugWindowId !== null) {
    try {
      await chrome.windows.update(debugWindowId, { focused: true });
      return { reused: true, windowId: debugWindowId };
    } catch {
      debugWindowId = null;
    }
  }

  const created = await chrome.windows.create({
    url: debugUrl,
    type: 'popup',
    width: 1200,
    height: 850,
    focused: true,
  });

  debugWindowId = created && typeof created.id !== 'undefined' ? created.id : null;
  return { reused: false, windowId: debugWindowId };
}

async function addEvent(payload, sender) {
  await ensureLoaded();

  const event = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    capturedAt: new Date().toISOString(),
    tabId: sender && sender.tab ? sender.tab.id : null,
    frameId: sender && typeof sender.frameId !== 'undefined' ? sender.frameId : null,
    payload,
  };

  eventsCache.unshift(event);
  if (eventsCache.length > MAX_EVENTS) {
    eventsCache = eventsCache.slice(0, MAX_EVENTS);
  }

  await saveEvents();

  try {
    await chrome.runtime.sendMessage({ type: 'scx-debug-event', payload: event });
  } catch {
    // No live listener attached.
  }

  return event;
}

function ensureTabStatus(tabId) {
  const key = typeof tabId === 'number' ? String(tabId) : 'unknown';
  if (!tabStatusCache[key]) {
    tabStatusCache[key] = {
      tabId: typeof tabId === 'number' ? tabId : null,
      updatedAt: null,
      pageUrl: '',
      title: '',
      hookReady: false,
      overlayMounted: false,
      overlayVisible: false,
      hasVisibleData: false,
      isRelevantInsightsPage: false,
      activeDataset: null,
      datasetCount: 0,
      visibleRowCount: 0,
      lastCapture: null,
      lastIngest: null,
      lastFlush: null,
      pendingCaptureCount: 0,
      duplicateCaptureCount: 0,
      pendingCaptures: [],
      sentFingerprints: [],
    };
  }
  ensureTabCollections(tabStatusCache[key]);
  return tabStatusCache[key];
}

function updateTabStatus(tabId, patch) {
  const status = ensureTabStatus(tabId);
  Object.assign(status, patch || {}, {
    updatedAt: new Date().toISOString(),
  });
  return status;
}

function buildActiveTabDiagnostics(tab) {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  const status = tabId !== null ? ensureTabStatus(tabId) : ensureTabStatus(null);
  const recentEvents = tabId === null
    ? []
    : eventsCache.filter((event) => event && event.tabId === tabId).slice(0, 5).map((event) => ({
        capturedAt: event.capturedAt,
        opName: event && event.payload ? event.payload.opName || null : null,
        datasetKey: event && event.payload && event.payload.normalized_dataset ? event.payload.normalized_dataset.dataset_key : null,
        ingest: event && event.payload ? event.payload.ingest || null : null,
      }));

  return {
    ok: true,
    activeTab: tab ? {
      id: tab.id,
      url: tab.url || status.pageUrl || '',
      title: tab.title || status.title || '',
    } : null,
    status,
    recentEvents,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  loadEvents();
});

chrome.runtime.onStartup.addListener(() => {
  loadEvents();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === debugWindowId) {
    debugWindowId = null;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStatusCache[String(tabId)];
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  let shouldTryFlush = false;
  if (changes.scxAutoIngestEnabled && changes.scxAutoIngestEnabled.newValue === true) {
    shouldTryFlush = true;
  }
  if (changes.scxToolsToken && changes.scxToolsToken.newValue) {
    shouldTryFlush = true;
  }
  if (changes.scxDevMode) {
    shouldTryFlush = true;
  }

  if (!shouldTryFlush) {
    return;
  }

  chrome.storage.sync.get(['scxToolsToken', 'scxDevMode', 'scxAutoIngestEnabled']).then((settings) => {
    if (settings.scxAutoIngestEnabled === false || !settings.scxToolsToken) {
      return;
    }
    return flushAllPendingCaptures(settings);
  }).catch(() => {
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'scx-open-debug-window') {
    openDebugWindow().then((result) => sendResponse({ ok: true, ...result }));
    return true;
  }

  if (message.type === 'scx-tab-status-update') {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    const payload = message.payload && typeof message.payload === 'object' ? message.payload : {};
    const updated = updateTabStatus(tabId, Object.assign({}, payload, {
      pageUrl: payload.pageUrl || (sender && sender.tab ? sender.tab.url || '' : ''),
      title: payload.title || (sender && sender.tab ? sender.tab.title || '' : ''),
    }));
    sendResponse({ ok: true, status: updated });
    return true;
  }

  if (message.type === 'scx-graphql-capture') {
    const rawPayload = message.payload || {};
    const normalized = normalizeCaptureForIngest(rawPayload);
    Promise.resolve(chrome.storage.sync.get(['scxToolsToken', 'scxDevMode', 'scxAutoIngestEnabled']))
      .then(async (settings) => {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        let ingest = { attempted: false, ok: false, reason: 'unsupported_operation' };
        let queueResult = null;

        if (normalized) {
          if (normalized.dataset_key !== 'lookup' && (!normalized.row_count || !Array.isArray(normalized.rows) || !normalized.rows.length)) {
            ingest = { attempted: false, ok: false, reason: 'empty_normalized_rows' };
          } else {
            queueResult = queuePendingCapture(tabId, rawPayload, normalized);
            if (queueResult.duplicate) {
              ingest = {
                attempted: false,
                ok: true,
                reason: queueResult.reason,
                duplicate_detected: true,
                buffered_count: queueResult.pending_count,
              };
            } else if (settings.scxAutoIngestEnabled === false) {
              ingest = {
                attempted: false,
                ok: false,
                reason: 'auto_ingest_disabled',
                buffered_count: queueResult.pending_count,
              };
            } else if (!settings.scxToolsToken) {
              ingest = {
                attempted: false,
                ok: false,
                reason: 'missing_tools_token',
                buffered_count: queueResult.pending_count,
              };
            } else {
              ingest = await flushPendingCapturesForTab(tabId, settings);
            }
          }
        }

        const currentStatus = ensureTabStatus(tabId);
        updateTabStatus(tabId, {
          pageUrl: rawPayload && rawPayload.meta ? rawPayload.meta.frame || currentStatus.pageUrl || '' : currentStatus.pageUrl,
          title: sender && sender.tab ? sender.tab.title || currentStatus.title || '' : currentStatus.title,
          isRelevantInsightsPage: true,
          lastCapture: normalized ? {
            opName: normalized.operation_name,
            datasetKey: normalized.dataset_key,
            rowCount: normalized.row_count,
            totalMetric: normalized.total_metric,
            capturedAt: normalized.captured_at,
          } : {
            opName: rawPayload && rawPayload.opName ? rawPayload.opName : null,
            datasetKey: null,
            rowCount: 0,
            totalMetric: null,
            capturedAt: new Date().toISOString(),
          },
          lastIngest: ingest,
          pendingCaptureCount: currentStatus.pendingCaptureCount || 0,
          duplicateCaptureCount: currentStatus.duplicateCaptureCount || 0,
          lastFlush: currentStatus.lastFlush || null,
        });

        return ingest;
      })
      .then((ingest) => {
        const tabId = sender && sender.tab ? sender.tab.id : null;
        updateTabStatus(tabId, {
          pageUrl: rawPayload && rawPayload.meta ? rawPayload.meta.frame || '' : '',
          lastCapture: normalized ? {
            opName: normalized.operation_name,
            datasetKey: normalized.dataset_key,
            rowCount: normalized.row_count,
            totalMetric: normalized.total_metric,
            capturedAt: normalized.captured_at,
          } : {
            opName: rawPayload && rawPayload.opName ? rawPayload.opName : null,
            datasetKey: null,
            rowCount: 0,
            totalMetric: null,
            capturedAt: new Date().toISOString(),
          },
          lastIngest: ingest,
          pendingCaptureCount: ensureTabStatus(tabId).pendingCaptureCount || 0,
          duplicateCaptureCount: ensureTabStatus(tabId).duplicateCaptureCount || 0,
          lastFlush: ensureTabStatus(tabId).lastFlush || null,
        });
        return ingest;
      })
      .then((ingest) => addEvent(Object.assign({}, rawPayload, {
        normalized_dataset: normalized ? {
          dataset_key: normalized.dataset_key,
          operation_name: normalized.operation_name,
          row_count: normalized.row_count,
          total_metric: normalized.total_metric,
          source_url: normalized.source_url,
        } : null,
        ingest,
      }), sender))
      .then((event) => sendResponse({ ok: true, eventId: event.id }));
    return true;
  }

  if (message.type === 'scx-get-active-tab-status') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = Array.isArray(tabs) && tabs.length ? tabs[0] : null;
      await ensureLoaded();
      sendResponse(buildActiveTabDiagnostics(tab));
    });
    return true;
  }

  if (message.type === 'scx-get-debug-events') {
    ensureLoaded().then(() => sendResponse({ ok: true, events: eventsCache }));
    return true;
  }

  if (message.type === 'scx-clear-debug-events') {
    eventsCache = [];
    saveEvents().then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

