# Changelog

## 1.0.2 - 2026-03-18

### Added
- A dedicated packaged icon set for the SoundCloud insights companion module, including 16/32/48/128 px extension icons and refreshed popup branding

## 1.0.1 - 2026-03-18

### Added
- Local buffered SoundCloud ingest queue with fingerprint-based duplicate protection before forwarding captures into Tools
- Support for additional normalized SoundCloud datasets including `TopTracksByRange`, `TotalsByWindow`, and `IsrcsWithTracks`
- Popup diagnostics now show pending capture count, duplicate count, and buffered flush results

### Changed
- `sc4a-insights` is now framed more clearly as the SoundCloud-specific companion module for Tools-backed ingest instead of a pure overlay-only helper
- Track and playlist normalization now keeps more entity metadata such as URNs, permalinks, and timestamps for later backend enrichment

