# Package Watch Milestone: Carrier Expansion + Home Assistant

## What This Is

This milestone extends the existing Package Watch browser extension with two new carriers (FedEx and UPS) and tighter Home Assistant automation support via MQTT. The immediate focus is your own workflow and HA setup: quickly add tracking numbers, monitor status changes in the popup, and drive automations when deliveries happen. The milestone builds on the existing Amazon and AliExpress architecture rather than introducing backend services.

## Core Value

When a tracked package changes state (especially delivered), the extension should reliably detect it and make that change immediately useful in Home Assistant automations.

## Requirements

### Validated

- ✓ Multi-site scraping pipeline already works for Amazon and AliExpress with background orchestration + content scripts — existing
- ✓ Popup already presents tracked shipments with status, delivery context, and per-site scrape metadata — existing
- ✓ Scheduler, change detection, notifications, and delivered-order retention are already implemented and in daily use — existing
- ✓ In-flight toolbar badge behavior exists and reflects current undelivered package count — existing

### Active

- [ ] Add FedEx tracking support end-to-end (intake, scraping, storage, popup rendering, notifications)
- [ ] Add UPS tracking support end-to-end with parity to FedEx behavior where practical
- [ ] Implement one shared manual-add form for FedEx/UPS tracking numbers with carrier auto-detection by format
- [ ] Research/validate ambiguous tracking-number overlaps before finalizing fallback behavior for uncertain detection
- [ ] Ship full context-menu flow for selected text -> add tracking number
- [ ] Integrate MQTT delivery event publishing for Home Assistant automation triggers
- [ ] Publish aggregate MQTT counters for in-flight and arriving-today package counts, with useful JSON attributes for automation context
- [ ] Include a proper design pass for representing dynamic package data in HA-friendly payloads/entities

### Out of Scope

- Carrier OAuth/API credential integration or backend proxy services — avoid ops/credential burden for this milestone
- Generalized support for arbitrary carriers beyond Amazon, AliExpress, FedEx, and UPS — keep scope tightly milestone-driven
- Full productization for broad public onboarding/documentation flows — optimize for your setup first
- Advanced analytics/history dashboards outside immediate tracking + automation value — defer until core flow is proven

## Context

The extension is a TypeScript + WXT + Vue codebase with a proven background/content-script scraping architecture and shared storage/change-detection pipeline. Current production behavior already handles Amazon and AliExpress polling, parse-failure handling, notifications, and popup status surfaces, so this milestone should reuse those mechanisms instead of introducing parallel subsystems.

You already drafted concrete direction in `openspec/changes/add-fedex-tracking/` and have a prior proposal/design for MQTT event publishing in `openspec/changes/add-mqtt-delivery-events/`. The current milestone sharpens and combines those efforts with two important adjustments: UPS is in-scope now, and MQTT should include aggregate automation-friendly counts/attributes (not events only).

## Constraints

- **Architecture**: Browser extension only (background + content scripts + popup) — stay within existing WXT/WebExtension model
- **Integration**: Home Assistant MQTT over broker-accessible WebSocket — no new backend services
- **Scope Priority**: Carrier coverage first — FedEx + UPS tracking UX/reliability is the milestone anchor
- **UX Shape**: Shared intake path for FedEx/UPS — avoid duplicate per-carrier forms
- **Delivery**: Context-menu add flow is required to ship (not design-only)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build FedEx and UPS in the same milestone | You want both carriers delivered together, not staggered | — Pending |
| Use a single shared manual-add form with carrier auto-detection | Reduces UI duplication and keeps intake simple | — Pending |
| Ship full context-menu selected-text -> add flow | Discussion concluded minimal vs full delta is small enough to ship full | — Pending |
| Prioritize your own HA setup first | Faster validation loop and clearer definition of useful automation output | — Pending |
| MQTT contract includes delivery events plus aggregate counts/attributes | Better fit for real automations than event-only payloads | — Pending |
| Carrier-number ambiguity handling requires research before lock-in | Avoid designing fallback behavior on assumptions about format overlap | — Pending |

---
*Last updated: 2026-02-08 after initialization*
