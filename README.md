# sc4a-insights

`sc4a-insights` is the dedicated **SoundCloud 4 Artists companion extension** for Tools.

It captures supported SoundCloud insights GraphQL responses in the browser, shows them locally in an on-page overlay, and can forward normalized datasets into your personal Tools account.

## Why this exists as a separate extension

The original idea was to keep this functionality inside the main Tools Chrome extension.

That changed once it became clear that **scraping/intercepting SoundCloud insights traffic was a bad fit for a general-purpose extension** that might eventually be published in the Chrome Web Store.

So the SoundCloud-specific capture work was moved here instead:

- into a separate companion module
- meant for personal/manual use
- not intended to be a public Web Store-style extension

In short: the main Tools extension stays cleaner and safer, while `sc4a-insights` owns the SoundCloud-specific capture pipeline.

## What it does

- captures supported **SoundCloud 4 Artists** insight views directly in the browser
- shows captured data in a floating on-page overlay
- supports **CSV export** and **Copy CSV** for local use
- forwards normalized datasets to Tools via:
  - production: `https://tools.tornevall.net/api/social-media-tools/soundcloud/ingest`
  - dev/beta: `https://tools.tornevall.com/api/social-media-tools/soundcloud/ingest`
- keeps a small **local pending queue** so captures are not lost when:
  - auto-ingest is disabled
  - your Tools token is missing
  - the Tools API is temporarily unavailable
- includes popup diagnostics and a dedicated **debug window** for troubleshooting

## Supported datasets

The extension currently understands and normalizes these SoundCloud operations:

- `TopTracksByWindow`
- `TopTracksByRange`
- `TopCountriesByWindow`
- `TopCitiesByWindow`
- `TopPlaylistsByWindow`
- `TotalsByWindow`
- `IsrcsWithTracks`
- `TrackByPermalink`

## What you need

- a Chromium-based browser that supports Manifest V3 extensions
- access to **SoundCloud 4 Artists / Insights** pages
- a personal **Tools bearer token** with access to the SoundCloud ingest endpoint

## Install

### Load unpacked

1. Open your browser's extensions page.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `sc4a-insights` folder.

## Configure

Open the extension popup and set:

- **Tools bearer token** – your personal token from Tools
- **Use dev/beta Tools host** – enable this only if you want to send to `tools.tornevall.com`
- **Auto-ingest** – when enabled, supported captures are pushed to Tools automatically
- **Enable on-page overlay** – controls whether the floating overlay is shown when relevant captured data exists
- **Start overlay minimized** – lets the overlay stay collapsed until you open it

## Typical workflow

1. Open a supported **SoundCloud 4 Artists** insights page.
2. Browse a view such as tracks, countries, cities, playlists, totals, or a permalink lookup.
3. The extension intercepts supported GraphQL responses.
4. If the overlay is enabled, the captured rows appear in the floating overlay.
5. If **Auto-ingest** is enabled and your Tools token is configured, normalized rows are forwarded to Tools.
6. If ingest cannot happen immediately, the capture is buffered locally and retried later when possible.

## Popup diagnostics

The popup includes **Active tab diagnostics** that help you confirm whether the extension is working on the current page.

It reports things like:

- whether the current page looks like a relevant SoundCloud insights page
- whether the GraphQL hook has reported itself as ready
- whether the overlay is mounted/visible
- how many datasets and rows are currently visible
- how many captures are pending locally
- how many duplicates were ignored
- the latest ingest result

## Debug window

Use the **Debug window** button from the popup or overlay when you need more detail.

The debug window shows recent captured events, including:

- operation name
- normalized dataset key
- captured time
- ingest result
- raw payload sections for troubleshooting

## Tools integration notes

This extension is the SoundCloud-specific ingest companion for the Tools backend.

It sends normalized SoundCloud insight payloads to the public Tools SoundCloud ingest API and is intended to work alongside the SoundCloud analytics views available in Tools.

## Important note about the main Social Media Tools extension

SoundCloud 4 Artists capture is no longer handled by the main `socialgpt-chrome` extension.

If you want SoundCloud insights capture and Tools ingest, use **`sc4a-insights`** for that purpose.

## Files of interest

- `manifest.json` – extension manifest
- `hook.mainworld.js` – intercepts GraphQL traffic in the page context
- `overlay.js` / `overlay.css` – local overlay UI
- `background.js` – normalization, queueing, and Tools ingest pipeline
- `popup.html` / `popup.js` – settings, diagnostics, and debug entry point
- `debug.html` / `debug.js` – detailed event inspection window
