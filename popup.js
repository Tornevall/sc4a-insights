const PROD_BASE_URL = 'https://tools.tornevall.net';
const DEV_BASE_URL = 'https://tools.tornevall.com';
const DEFAULTS = {
  scxToolsToken: '',
  scxDevMode: false,
  scxAutoIngestEnabled: true,
  scxOverlayEnabled: true,
  scxOverlayStartsCollapsed: true,
};

function setStatus(message, isError) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.color = isError ? '#b91c1c' : '#047857';
}

function getBaseUrl(devMode) {
  return devMode ? DEV_BASE_URL : PROD_BASE_URL;
}

function formatIngestResult(ingest) {
  if (!ingest) {
    return 'No ingest attempt recorded yet.';
  }
  if (typeof ingest.flushed_count === 'number') {
    return 'Buffered flush '
      + (ingest.ok ? 'OK' : 'partial')
      + ' · flushed=' + ingest.flushed_count
      + ' · duplicates=' + (ingest.duplicate_count || 0)
      + ' · remaining=' + (ingest.remaining_count || 0)
      + (ingest.failed_count ? ' · failed=' + ingest.failed_count : '');
  }
  if (ingest.attempted === false) {
    if (ingest.reason === 'empty_normalized_rows') {
      return 'Ingest not attempted: the captured SoundCloud dataset contained no normalized rows yet.';
    }
    if (ingest.reason === 'unsupported_operation') {
      return 'Ingest not attempted: this GraphQL operation is not mapped to a supported dataset yet.';
    }
    if (ingest.reason === 'already_buffered') {
      return 'Capture already buffered locally.';
    }
    if (ingest.reason === 'already_ingested') {
      return 'Duplicate capture ignored because it was already ingested.';
    }
    return 'Ingest not attempted: ' + (ingest.reason || 'unknown reason') + '.';
  }
  if (ingest.ok) {
    return 'Ingest OK' + (ingest.status ? ' · HTTP ' + ingest.status : '') + (ingest.event_id ? ' · event #' + ingest.event_id : '');
  }
  return 'Ingest failed' + (ingest.status ? ' · HTTP ' + ingest.status : '') + (ingest.message ? ' · ' + ingest.message : '');
}

function renderDiagnostics(result) {
  const tabState = document.getElementById('diagTabState');
  const pipelineState = document.getElementById('diagPipelineState');
  const recentEvents = document.getElementById('diagRecentEvents');
  if (!tabState || !pipelineState || !recentEvents) {
    return;
  }

  if (!result || !result.ok) {
    tabState.textContent = 'Could not read active-tab diagnostics.';
    pipelineState.textContent = result && result.error ? result.error : 'No background status available.';
    recentEvents.innerHTML = '<div class="diag-line diag-muted">No captures from the active tab yet.</div>';
    return;
  }

  const tab = result.activeTab || {};
  const status = result.status || {};
  const events = Array.isArray(result.recentEvents) ? result.recentEvents : [];
  const pageLabel = tab.url || status.pageUrl || 'Unknown tab';
  const pageType = status.isRelevantInsightsPage
    ? 'Relevant SoundCloud insights page detected.'
    : 'Current tab does not look like a supported SoundCloud insights page.';
  const hookState = status.hookReady ? 'Hook ready' : 'Hook not reported yet';
  const overlayState = status.overlayMounted
    ? (status.overlayVisible ? 'Overlay visible' : 'Overlay mounted but hidden')
    : 'Overlay not mounted';

  tabState.textContent = pageType + ' ' + hookState + ' · ' + overlayState;
  pipelineState.textContent = pageLabel
    + ' · datasets=' + (status.datasetCount || 0)
    + ' · active=' + (status.activeDataset || '—')
    + ' · rows=' + (status.visibleRowCount || 0)
    + ' · pending=' + (status.pendingCaptureCount || 0)
    + ' · duplicates=' + (status.duplicateCaptureCount || 0)
    + ' · ' + formatIngestResult(status.lastIngest);

  if (!events.length) {
    recentEvents.innerHTML = '<div class="diag-line diag-muted">No GraphQL captures from the active tab yet.</div>';
    return;
  }

  recentEvents.innerHTML = events.map((event) => {
    const pill = event.datasetKey
      ? '<span class="pill">' + event.datasetKey + '</span>'
      : '<span class="pill">raw</span>';
    return '<div class="diag-item">'
      + '<div>' + pill + (event.opName || 'Unknown operation') + '</div>'
      + '<div class="diag-muted" style="margin-top:4px;">'
      + (event.capturedAt || 'Unknown time') + ' · ' + formatIngestResult(event.ingest)
      + '</div>'
      + '</div>';
  }).join('');
}

async function refreshDiagnostics() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'scx-get-active-tab-status' });
    renderDiagnostics(result);
  } catch (error) {
    renderDiagnostics({ ok: false, error: error && error.message ? error.message : 'Could not query active tab diagnostics.' });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const tokenField = document.getElementById('toolsToken');
  const devModeField = document.getElementById('devMode');
  const autoIngestField = document.getElementById('autoIngestEnabled');
  const overlayEnabledField = document.getElementById('overlayEnabled');
  const overlayStartsCollapsedField = document.getElementById('overlayStartsCollapsed');
  const saveBtn = document.getElementById('saveBtn');
  const debugBtn = document.getElementById('debugBtn');

  const stored = await chrome.storage.sync.get(Object.keys(DEFAULTS));
  tokenField.value = stored.scxToolsToken || DEFAULTS.scxToolsToken;
  devModeField.checked = !!stored.scxDevMode;
  autoIngestField.checked = typeof stored.scxAutoIngestEnabled === 'boolean' ? stored.scxAutoIngestEnabled : DEFAULTS.scxAutoIngestEnabled;
  overlayEnabledField.checked = typeof stored.scxOverlayEnabled === 'boolean' ? stored.scxOverlayEnabled : DEFAULTS.scxOverlayEnabled;
  overlayStartsCollapsedField.checked = typeof stored.scxOverlayStartsCollapsed === 'boolean' ? stored.scxOverlayStartsCollapsed : DEFAULTS.scxOverlayStartsCollapsed;

  saveBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({
      scxToolsToken: tokenField.value.trim(),
      scxDevMode: !!devModeField.checked,
      scxAutoIngestEnabled: !!autoIngestField.checked,
      scxOverlayEnabled: !!overlayEnabledField.checked,
      scxOverlayStartsCollapsed: !!overlayStartsCollapsedField.checked,
    });

    setStatus(
      'Saved. Auto-ingest is ' + (autoIngestField.checked ? 'enabled' : 'disabled')
      + ' and requests will target ' + getBaseUrl(devModeField.checked) + '.',
      false
    );
  });

  debugBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'scx-open-debug-window' });
      setStatus('Debug window opened.', false);
    } catch (error) {
      setStatus('Could not open debug window.', true);
    }
  });

  await refreshDiagnostics();
  window.addEventListener('focus', refreshDiagnostics);
  const diagnosticsTimer = window.setInterval(refreshDiagnostics, 3000);
  window.addEventListener('beforeunload', () => window.clearInterval(diagnosticsTimer));
});

