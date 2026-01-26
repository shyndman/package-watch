# Change: FedEx tracking without backend credentials

## Why
- Users currently get end-to-end automation only for Amazon and AliExpress orders; FedEx packages must be checked manually even though they are also time-sensitive.
- The popup already surfaces site-level telemetry, so adding FedEx should feel identical, including delivery sounds, editable metadata, and change detection.
- There is no appetite for a backend proxy that could hold OAuth credentials, so we need a pure browser-based approach that still minimizes ToS risk and code duplication while setting expectations for scraping fragility.
- Junior engineers need a complete walkthrough (UI → storage → background scraping → popup render → notification) to implement this safely without breaking other carriers.

## What Changes
- Add FedEx as a first-class site in the shared scheduler/tab orchestration so its scrape cadence, logging, alarms, storage, and popup stats reuse the exact helpers Amazon/AliExpress already use (no forks).
- Provide a deterministic popup flow that lets users enter 12–22 digit FedEx tracking numbers, validates/sanitizes input, persists `{trackingNumber,label,createdAt}` entries, and exposes inline-editable labels with placeholder text + keyboard handling (Enter/blur commit, Escape revert, empty → placeholder).
- Implement a single-tab DOM scraping pipeline (background adapter + content script) for `https://www.fedex.com/fedextrack/?trknbr=…` that (a) iterates tracking numbers sequentially, (b) waits for the SPA’s status card to render, (c) extracts status/detail/dates/delivered flag, (d) normalizes into `OrderStatus`, (e) routes through shared change detection + notifications, and (f) logs progress + failures so the scheduler can recover cleanly.
- Persist FedEx-specific state (queue, per-number scrape metadata, label map, last alarm timestamps, last successful scrape, parse failures) under new `storage.fedex.*` keys, auto-expiring delivered entries after the shared 7-day retention window while still allowing manual removal at any time.
- Document the residual risk of consumer-site scraping (ToS, Akamai blocking), specify the fallback “Open in FedEx” action, and outline light-touch telemetry/logging so we can detect breakage.

## Impact
- Specs: `order-tracking`
- Code: background scheduler/orchestrator, FedEx content script, background FedEx adapter, popup `App.vue`, storage helpers, notification pipeline tests, storage message handlers, validation/UX edge cases, documentation of ToS risk.
