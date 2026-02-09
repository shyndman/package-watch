# Feature Landscape

**Domain:** Browser Extension Package Tracking + Home Assistant Automation
**Researched:** 2026-02-08
**Confidence:** HIGH

## Table Stakes

Features users expect from a package tracking extension. Missing these = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **FedEx tracking support** | Major carrier, essential for NA deliveries | MEDIUM | Sequential DOM scrape from `fedex.com/fedextrack`. Reuse existing background/content script architecture. Requires content script with status/detail/ETA selectors |
| **UPS tracking support** | Major carrier, essential for NA deliveries | MEDIUM | Parity with FedEx behavior. Shared intake form with format detection. DOM scraping from UPS consumer site |
| **Manual tracking number entry** | Primary intake method without backend | LOW | Form validation for 12–22 digit numbers. Digits-only enforcement. Duplicate detection |
| **Carrier auto-detection** | UX improvement over manual carrier selection | LOW | Pattern matching on tracking number format. Requires research on FedEx/UPS format overlaps for ambiguous cases |
| **Status display in popup** | Core visibility into tracked packages | LOW | Reuse existing `OrderStatus` display components. FedEx/UPS use label + tracking number as product title |
| **Change detection & notifications** | Alert users when packages move | LOW | Already exists for Amazon/AliExpress. FedEx/UPS normalize to `OrderStatus` and flow through shared pipeline |
| **Delivered order retention** | Auto-cleanup of old data | LOW | 7-day TTL on delivered orders. Already implemented via `saveOrders()` retention logic |
| **Delete/remove tracking numbers** | User control over tracked items | LOW | Immediate removal from storage. Affects both queue and stored shipments |
| **Last check timestamp display** | Trust signal that tracking is working | LOW | Per-site scrape metadata already stored. Display in popup header |
| **In-flight count badge** | Quick status without opening popup | LOW | Already implemented. Extends to count FedEx/UPS undelivered packages |

## Differentiators

Features that set this implementation apart. Not required, but deliver unique value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Home Assistant MQTT integration** | Trigger automations when packages deliver (lights, announcements) | MEDIUM | Connect-per-publish model. 24h retry TTL. Events include items array + vendor. Requires WebSocket host permissions |
| **Aggregate MQTT counters** | Automation-friendly sensors (packages in-flight, arriving today) | MEDIUM | Publishes counts with JSON attributes. Enables dashboard cards without complex templates |
| **Selected-text context-menu intake** | Right-click tracking number on any page → add to tracking | MEDIUM | Browser contextMenus API. Parse selection for tracking-like patterns. Show quick-add popup |
| **Shared carrier-intake form** | One form for FedEx + UPS, auto-detects carrier | LOW | Reduces UI duplication. Validation happens client-side before storage. Fallback selector for ambiguous cases |
| **Inline label editing** | Identify packages without product data from carriers | LOW | Click-to-edit in popup list. Ghosted placeholder when empty. Enter/Blur to save, Escape to cancel |
| **Per-row scrape status indicators** | Know when automation is failing for specific packages | LOW | Display error badges on rows with parse failures. Deep link to carrier site for manual refresh |
| **Adaptive polling intervals** | Check more frequently when delivery is expected today | LOW | 10min during 7AM-10PM window when ETA is today. 120min default. Already implemented for existing carriers |
| **First-run suppression** | No notification spam when adding new tracking numbers | LOW | Baseline established without alerts. Already exists for Amazon/AliExpress |

## Anti-Features

Features commonly requested but intentionally excluded to maintain scope and simplicity.

| Anti-Feature | Why Requested | Why Problematic | What to Do Instead |
|--------------|---------------|-----------------|-------------------|
| **FedEx/UPS API integration with OAuth** | More reliable than scraping | Credential management burden, backend proxy required, ToS complexity | Use DOM scraping with parse failure telemetry. Provide manual "View on [Carrier]" fallback links |
| **Support for arbitrary carriers (DHL, USPS API, etc.)** | "Why not support everything?" | Explodes scope, each carrier needs research + scraping logic + testing | Milestone-driven carrier additions. Stick to FedEx + UPS for this milestone |
| **Real-time tracking updates** | Users want instant status changes | Would require constant polling or webhook infrastructure. Browser extension environment limits | Adaptive polling (10min when delivery today). Good enough for delivery automation use case |
| **History dashboard / delivered shipment archive** | Users want to see past deliveries | Storage bloat, unclear value for automation use case | 7-day retention only. Delivered packages auto-expire. Focus on active tracking |
| **Backend service for credential proxy** | Solves scraping fragility | Operational burden, cost, security surface | Pure browser-based approach. Accept scraping brittleness as trade-off for zero-ops |
| **Public productization with onboarding flows** | Makes it usable by others | Documentation, support burden, generalization reduces fit for specific HA setup | Optimize for personal workflow first. README with setup notes sufficient |
| **Email/notification integrations beyond browser** | "Can it text me?" | Requires external services (Twilio, SendGrid), credentials, cost | Browser notifications + HA MQTT events. HA handles notification routing |
| **Predictive delivery ML** | Cool tech demo | No clear automation value, requires training data, complexity | Stick to actual carrier status. HA automations trigger on real delivered events |

## Feature Dependencies

```
Carrier Auto-Detection
    └──requires──> Shared Intake Form
                        └──requires──> Manual Entry Validation

MQTT Delivery Events
    └──requires──> Change Detection
                        └──requires──> FedEx/UPS Scraping

MQTT Aggregate Counters
    └──requires──> MQTT Delivery Events
                        └──requires──> In-Flight Count Logic

Context-Menu Intake
    └──requires──> Manual Entry Flow (reuses validation)
                        └──requires──> Shared Intake Form

Inline Label Editing
    └──requires──> FedEx/UPS Storage Schema (label field)
                        └──requires──> Popup List Display

Adaptive Polling
    └──requires──> Delivery Date Parsing (ETA extraction)
                        └──requires──> FedEx/UPS Scraping
```

### Dependency Notes

- **Carrier Auto-Detection requires Shared Intake Form**: Auto-detection only valuable if both carriers use same UI. Single form reduces complexity.
- **MQTT Aggregate Counters requires Delivery Events**: Counter updates piggyback on same change detection pipeline that triggers delivery events.
- **Context-Menu Intake reuses Manual Entry**: Right-click flow validates same way as manual form, reducing code duplication.
- **Inline Label Editing requires Schema Change**: `FedExQueueEntry` and `UPSQueueEntry` need `label` field. Existing Amazon/AliExpress don't need this (they have product titles from scraping).

## MVP Definition

### Launch With (v1)

Minimum viable for validating FedEx + UPS tracking with HA automation:

- [ ] **FedEx tracking end-to-end** — Sequential DOM scrape, status extraction, notification on change. Core carrier coverage.
- [ ] **UPS tracking end-to-end** — Parity with FedEx. Second major carrier for complete NA coverage.
- [ ] **Shared intake form with carrier detection** — One form, auto-detects carrier from number format. Reduces UI complexity.
- [ ] **MQTT delivery events** — Publishes when packages deliver. Enables HA automation triggers.
- [ ] **MQTT aggregate counters** — In-flight count + arriving-today count. Useful for dashboard sensors.
- [ ] **Context-menu selected-text intake** — Right-click tracking numbers on any page. Critical UX for adding packages found in email/websites.

### Add After Validation (v1.x)

Once core flow is proven working:

- [ ] **UPS format detection refinement** — Research and handle any format overlaps with FedEx. Add fallback selector for ambiguous cases.
- [ ] **Enhanced MQTT attributes** — Additional useful fields in counter payloads (estimated delivery window, carrier breakdown).
- [ ] **Parse failure telemetry** — Better visibility into when carrier sites break scraping. Optional: report to self-hosted endpoint.

### Future Consideration (v2+)

Defer until core tracking + HA integration is solid:

- [ ] **Additional carriers** — DHL, USPS direct, etc. Only if personal workflow needs them.
- [ ] **Delivery history / analytics** — Track delivery patterns, carrier performance. Requires persistent storage beyond 7 days.
- [ ] **Package grouping** — Associate multiple tracking numbers with single "shipment". Complex UI, unclear automation value.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| FedEx tracking | HIGH | MEDIUM | P1 |
| UPS tracking | HIGH | MEDIUM | P1 |
| Shared intake form | MEDIUM | LOW | P1 |
| MQTT delivery events | HIGH | MEDIUM | P1 |
| MQTT aggregate counters | MEDIUM | MEDIUM | P1 |
| Context-menu intake | HIGH | MEDIUM | P1 |
| Carrier auto-detection | MEDIUM | LOW | P1 |
| Inline label editing | MEDIUM | LOW | P2 |
| Per-row scrape status | LOW | LOW | P2 |
| Parse failure telemetry | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch (milestone definition)
- P2: Should have, add when P1 complete
- P3: Nice to have, future consideration

## Phase Ordering Rationale

Based on feature dependencies and milestone priorities:

1. **FedEx foundation** → Establishes scraping pattern for new carrier type (manual queue vs site auth)
2. **UPS parity** → Reuses FedEx patterns, validates abstraction
3. **Shared intake + carrier detection** → Consolidates entry UX after both carriers work
4. **MQTT events** → Builds on change detection already working for all carriers
5. **MQTT counters** → Extends MQTT with aggregate data
6. **Context-menu** → Final UX polish for intake flow

## Sources

- OpenSpec proposals: `openspec/changes/add-fedex-tracking/`, `openspec/changes/add-mqtt-delivery-events/`
- Project context: `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`
- Existing spec: `openspec/specs/order-tracking/spec.md`
- Codebase analysis: `lib/types.ts`, `lib/storage.ts`, `lib/background/scheduler.ts`

---
*Feature research for: Package Watch Carrier Expansion + Home Assistant*
*Researched: 2026-02-08*
