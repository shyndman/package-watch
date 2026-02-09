# Project Research Summary

**Project:** Package Watch Milestone: Carrier Expansion + Home Assistant
**Domain:** Browser extension package tracking + Home Assistant automation
**Researched:** 2026-02-08
**Confidence:** HIGH

## Executive Summary

Package Watch should be built as a browser-native automation tool, not a mini SaaS. The research consistently points to reusing the existing extension pipeline (background scheduler, content-script scraping, normalized `OrderStatus`, shared change detection) and extending it with a new carrier-intake model for FedEx/UPS. Experts in this space avoid backend/API integrations for this milestone because the operational and credential burden is disproportionate to value for a personal Home Assistant workflow.

The recommended approach is: implement a single shared FedEx/UPS intake queue first, normalize carrier results into the same order model used by Amazon/AliExpress, and then attach MQTT publishing as a side effect of existing change detection. For MQTT, use browser WebSocket transport, stateless connect-per-publish, and a pending retry queue with TTL. This keeps the architecture resilient to extension suspension and avoids over-engineered connection state management.

The biggest risks are not feature volume; they are correctness and fragility at integration edges: carrier format ambiguity, selector drift/anti-bot behavior on FedEx/UPS, and Home Assistant payload contract mismatches. Mitigation is clear: add explicit disambiguation UX for uncertain tracking numbers, build selector fallbacks with parse-failure handling from day one, enforce pacing/backoff in scraping, and validate HA payload shape in integration testing before rollout.

## Key Findings

### Recommended Stack

Stack guidance is strong and practical: keep the existing WXT + TypeScript + Vue foundation, add only targeted dependencies, and preserve extension-compatible patterns.

**Core technologies:**
- `mqtt@5.15.0`: MQTT over WebSocket from browser context - actively maintained, TypeScript-first, extension-friendly bundling.
- `@webext-core/messaging` (existing): background/content coordination - reuse current message architecture instead of adding transport layers.
- `@wxt-dev/storage` (existing): queue/state persistence - supports pending MQTT retries and carrier queue metadata.
- Custom carrier detection regex (no new package): format detection for FedEx/UPS - lower risk than adding thin third-party wrappers for static pattern data.

**Critical version/config requirements:**
- MQTT must run over `ws://`/`wss://` only (no raw TCP in browsers).
- Add `contextMenus` permission and WebSocket host permission for the broker.
- Prefer QoS 1 + pending queue retry for delivery events unless HA testing proves QoS 0 sufficient for this setup.

### Expected Features

Feature research is aligned around a tight v1: carrier parity (FedEx + UPS), shared intake UX, and Home Assistant automation outputs.

**Must have (table stakes):**
- FedEx tracking end-to-end (intake, scrape, normalize, notify).
- UPS tracking end-to-end with behavioral parity to FedEx.
- Shared manual intake form with carrier auto-detection and duplicate handling.
- Core popup visibility, change notifications, delete flow, and retention behavior extended to new carriers.

**Should have (differentiators):**
- MQTT delivery events for HA automation triggers.
- MQTT aggregate counters (`in_flight`, `arriving_today`) for dashboards/automations.
- Selected-text context menu intake that routes into the shared validation flow.
- Inline label editing and per-row scrape health indicators for carrier-tracked packages.

**Defer (v2+):**
- Additional carriers beyond FedEx/UPS.
- Delivery history/analytics dashboards.
- Backend proxy/OAuth carrier API integrations.

### Architecture Approach

Architecture should stay pipeline-centric: intake writes to a tracking queue, carrier handlers scrape sequentially and normalize to `OrderStatus`, and shared change detection fans out to notifications, badge updates, and MQTT publishing. This keeps one source of truth for state transitions and prevents per-carrier logic forks.

**Major components:**
1. **Tracking intake boundary** - shared form + context menu + carrier detection writing to queue storage.
2. **Carrier execution boundary** - FedEx/UPS handlers + content scripts performing sequential, isolated scraping.
3. **Unified post-processing boundary** - shared change detection driving notification, badge, and MQTT side effects.
4. **MQTT reliability boundary** - stateless publisher + pending queue with TTL and dedupe controls.

### Critical Pitfalls

1. **Tracking-number ambiguity** - treat detection as confidence-based; require explicit carrier selection for ambiguous numeric formats.
2. **Selector drift + anti-bot blocking** - use stable selectors/fallbacks, add parse-failure guards, and enforce request pacing/jitter/backoff.
3. **MQTT payload contract mismatch with HA** - require `event_type` payload schema validation and end-to-end HA verification.
4. **Duplicate MQTT replay storms** - add idempotency keys/dedupe window and clear pending entries only after successful publish.
5. **Cross-carrier cascade failure** - isolate carrier scrape loops/alarms so one failure never blocks the rest of the extension.

## Implications for Roadmap

Based on dependencies and risk concentration, this milestone should run in five phases.

### Phase 1: Foundation Contracts
**Rationale:** Every downstream feature depends on stable types, storage contracts, and message schemas.
**Delivers:** `OrderSite` extension, tracking queue schema, pending MQTT queue schema, messaging additions, manifest permission updates.
**Addresses:** Shared intake prerequisite, carrier handler prerequisites, MQTT reliability prerequisites.
**Avoids:** Late schema churn, broken cross-component wiring, context menu permission regressions.

### Phase 2: Carrier Tracking Core (FedEx + UPS)
**Rationale:** Carrier scraping is the milestone anchor and highest technical risk; prove it early.
**Delivers:** FedEx/UPS content scripts + background handlers, normalized `OrderStatus` outputs, per-carrier isolation, sequential single-tab orchestration.
**Addresses:** FedEx/UPS table-stakes coverage; change-detection compatibility.
**Avoids:** Selector brittleness surprises, anti-bot lockouts, single failure halting all tracking.

### Phase 3: Unified Intake UX
**Rationale:** Once scraping works, optimize how tracking numbers enter the system.
**Delivers:** Shared manual form, auto-detect + ambiguity fallback selector, context-menu selected-text flow, label editing.
**Addresses:** Manual intake, auto-detection, context-menu differentiator, UX control.
**Avoids:** Wrong-carrier inserts, silent async context menu failures, duplicate queue entries.

### Phase 4: MQTT Automation Integration
**Rationale:** MQTT is valuable only when change detection from carriers is reliable.
**Delivers:** Delivery event publish path, aggregate counter publishing, pending retry queue/TTL, payload validation.
**Addresses:** HA event triggers and dashboard-friendly counts.
**Avoids:** Silent HA non-triggering, duplicate automation storms, publish-loss during broker outages.

### Phase 5: Hardening and Operational Guardrails
**Rationale:** Stabilize real-world behavior after full feature wiring.
**Delivers:** scrape telemetry/health indicators, retry/backoff tuning, popup status polish, failure visibility.
**Addresses:** per-row scrape status, parse failure clarity, long-term maintainability.
**Avoids:** "works locally" fragility, hidden integration failures, operational blind spots.

### Phase Ordering Rationale

- Data contracts first prevent rework across popup, background, and content scripts.
- Scraping core before UX polish de-risks the most brittle external integrations early.
- MQTT follows proven change detection to keep automation logic accurate and idempotent.
- Hardening last captures real integration behavior and closes the loop on known pitfalls.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Carrier Tracking Core):** UPS selector stability and anti-bot behavior need targeted validation in live pages.
- **Phase 4 (MQTT Integration):** HA event schema/topic/QoS contract must be tested end-to-end in the target HA setup.

Phases with standard patterns (can usually skip extra research):
- **Phase 1 (Foundation Contracts):** straightforward extension schema and messaging evolution.
- **Phase 3 (Unified Intake UX):** standard WebExtensions context menu + popup form patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strong primary sources for MQTT.js and extension constraints; clear implementation fit. |
| Features | HIGH | Backed by milestone requirements plus dependency mapping in research docs. |
| Architecture | HIGH | Consistent with existing codebase patterns and explicit phase dependency graph. |
| Pitfalls | MEDIUM-HIGH | Risks are well-identified, but several depend on live carrier behavior and HA instance specifics. |

**Overall confidence:** HIGH

### Gaps to Address

- **MQTT contract inconsistency across research docs:** finalize canonical topics and QoS in implementation spec (some docs reference QoS 1 + `deliveries/...`, others QoS 0 + `package-watch/...`).
- **UPS ambiguous numeric formats:** validate real-world overlap behavior and lock disambiguation UX criteria before shipping auto-detect defaults.
- **Carrier anti-bot thresholds:** tune request pacing/backoff from observed failures rather than fixed assumptions.
- **HA event entity assumptions:** verify required `event_type` declarations and payload fields against the exact Home Assistant configuration in use.

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` - MQTT stack/version recommendations, carrier pattern baselines, permissions/config guidance.
- `.planning/research/FEATURES.md` - table-stakes vs differentiators, dependency map, MVP/v1.x/v2 boundaries.
- `.planning/research/ARCHITECTURE.md` - component boundaries, normalized data flow, phase dependency graph.
- `.planning/research/PITFALLS.md` - failure modes, prevention strategies, phase-to-pitfall mapping.
- MQTT.js documentation and package metadata (`mqtt@5.15.0`) - browser compatibility and client configuration.
- WebExtensions docs (context menus) - permission and lifecycle behavior for context menu flows.

### Secondary (MEDIUM confidence)
- Home Assistant MQTT eventstream/community patterns - payload shape and automation usage conventions.
- `jkeen/tracking_number_data` - carrier format references for detection heuristics.

### Tertiary (LOW confidence)
- Anti-bot/blog synthesis sources - useful risk signals but environment-specific and requires in-situ validation.

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
