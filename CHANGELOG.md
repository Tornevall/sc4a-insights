# Changelog

## 2.0.0 - 2026-03-22

### Added
- Full **Tools integration** via personal bearer token setup in the popup, targeting `https://tools.tornevall.net/api/social-media-tools/soundcloud/ingest` or `https://tools.tornevall.com/api/social-media-tools/soundcloud/ingest` in dev mode
- Background service-worker pipeline that normalizes supported SoundCloud 4 Artists GraphQL captures before forwarding them to Tools
- Local **pending-capture queue** with fingerprint-based duplicate protection so captures can be retried instead of being lost when auto-ingest is disabled, the token is missing, or the Tools API is temporarily unavailable
- Popup-based **active-tab diagnostics** showing hook state, overlay state, dataset count, pending queue size, duplicate count, and latest ingest result
- Dedicated **debug window** for inspecting recent captured GraphQL events and their normalized ingest state
- Support for additional normalized datasets beyond the original overlay release, including:
  - `TopTracksByRange`
  - `TotalsByWindow`
  - `IsrcsWithTracks`
  - `TrackByPermalink`
- Packaged extension branding assets and icon set (`16/32/48/128`)

### Changed
- `sc4a-insights` is now the dedicated **SoundCloud companion module for Tools**, not just a local overlay helper
- Overlay behavior is now configurable from the popup:
  - enable/disable overlay entirely
  - start collapsed by default
  - open a debug window directly from the overlay
- Overlay visibility is now tied to relevant SoundCloud insights pages and actual captured data instead of always behaving like a generic floating table
- Track, playlist, ISRC, totals, and lookup normalization now preserves richer metadata such as URNs, permalinks, artwork, timestamps, and row summaries so Tools receives more useful context
- The popup now acts as the main control surface for token handling, dev/prod host switching, auto-ingest, overlay preferences, and diagnostics

### Fixed
- GraphQL captures are now buffered and deduplicated locally before ingest, reducing accidental duplicate submissions to Tools
- Capture handling is more robust across both `fetch` and `XMLHttpRequest` GraphQL traffic
- Source URLs are stabilized to the SoundCloud insights origin so one SoundCloud source stays grouped consistently in Tools even when users browse different insights sub-pages

## 1.0.2 - 2026-03-18

### Added
- Dedicated packaged icon set for the SoundCloud insights companion module, including `16/32/48/128` extension icons and refreshed popup branding

## 1.0.1 - 2026-03-18

### Added
- Local buffered SoundCloud ingest queue with fingerprint-based duplicate protection before forwarding captures into Tools
- Support for additional normalized SoundCloud datasets including `TopTracksByRange`, `TotalsByWindow`, and `IsrcsWithTracks`
- Popup diagnostics showing pending capture count, duplicate count, and buffered flush results

### Changed
- `sc4a-insights` began the transition from pure overlay helper to **Tools-backed SoundCloud companion module**
- Track and playlist normalization now keeps more entity metadata such as URNs, permalinks, and timestamps for later backend use

## 1.0.0 - 2025-09-05

### Added
- Initial release of the **SoundCloud Insights Overlay**
- Main-world GraphQL interception for supported SoundCloud insights pages
- On-page overlay with dataset tabs for Tracks, Countries, Cities, Playlists, and Lookup
- CSV export and clipboard copy directly from the overlay

### Scope
- This first release was a **local overlay/export tool only**
- No Tools bearer-token setup, debug window, buffered ingest queue, or Tools API forwarding existed yet

