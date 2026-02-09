# Requirements: Package Watch Milestone - Carrier Expansion + Home Assistant

**Defined:** 2026-02-09
**Core Value:** When a tracked package changes state (especially delivered), the extension should reliably detect it and make that change immediately useful in Home Assistant automations.

## v1 Requirements

Requirements for this milestone release. Each maps to exactly one roadmap phase.

### Carrier Tracking

- [ ] **CARR-01**: User can track FedEx shipment status changes from stored tracking numbers
- [ ] **CARR-02**: User can track UPS shipment status changes from stored tracking numbers
- [ ] **CARR-03**: User can keep receiving updates from unaffected carriers when one carrier scrape fails
- [ ] **CARR-04**: User sees delivered FedEx/UPS shipments auto-expire after 7 days, matching existing retention behavior

### Intake and Label Management

- [ ] **INTK-01**: User can add either FedEx or UPS tracking numbers from one shared manual-add form
- [ ] **INTK-02**: User can submit a valid tracking number and have the extension route it to the correct carrier via format detection
- [ ] **INTK-03**: User can see validation errors for invalid or duplicate tracking numbers before they are added
- [ ] **INTK-04**: User can edit a custom package label inline from the popup list
- [ ] **INTK-05**: User can delete a tracked FedEx/UPS number and stop future checks for it

### Context Menu Intake

- [ ] **CTXM-01**: User can select tracking-like text on any page and add it through a context-menu action
- [ ] **CTXM-02**: User can have the selected text parsed for the tracking token before add is attempted
- [ ] **CTXM-03**: User gets the same validation and duplicate-protection behavior for context-menu adds as manual form adds

### Home Assistant MQTT Automation

- [ ] **MQTT-01**: Home Assistant can receive a delivery event when a tracked package transitions to delivered
- [ ] **MQTT-02**: Home Assistant can receive an aggregate in-flight package count update
- [ ] **MQTT-03**: Home Assistant can receive an aggregate arriving-today package count update
- [ ] **MQTT-04**: Home Assistant can consume JSON attributes on MQTT count payloads with useful package context
- [ ] **MQTT-05**: User can verify topic/QoS/payload compatibility against their actual Home Assistant setup before milestone completion

## v2 Requirements

Deferred to a follow-up milestone.

### Intake and UX Refinement

- **INTK-06**: User can choose the carrier explicitly when tracking-number format detection is ambiguous
- **CTXM-04**: User can see explicit success/failure feedback from context-menu adds without reopening popup state

### MQTT Reliability Enhancements

- **MQTT-06**: User can rely on persisted MQTT retry queue behavior with TTL and duplicate suppression semantics

### Observability and Scrape Hardening

- **OBSV-01**: User can see per-row scrape health indicators and actionable failure details for FedEx/UPS entries
- **OBSV-02**: User can benefit from tuned pacing/backoff and telemetry for anti-bot and selector-drift failures

## Out of Scope

Explicit exclusions for this milestone.

| Feature | Reason |
|---------|--------|
| FedEx/UPS API + OAuth integration | Adds credential and backend complexity; not needed for personal HA-first milestone |
| Backend proxy service | Increases operational burden and security surface; extension-only model is preferred |
| Additional carriers beyond FedEx/UPS | Scope control: milestone is focused on closing the two major carrier gaps |
| Full public productization/onboarding system | Current target is personal workflow effectiveness first |
| Delivery analytics/history dashboards | Lower immediate automation value than reliable tracking + MQTT outputs |

## Traceability

Roadmap mapping for current milestone.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CARR-01 | Phase 1 | Pending |
| CARR-02 | Phase 1 | Pending |
| CARR-03 | Phase 1 | Pending |
| CARR-04 | Phase 1 | Pending |
| INTK-01 | Phase 2 | Pending |
| INTK-02 | Phase 2 | Pending |
| INTK-03 | Phase 2 | Pending |
| INTK-04 | Phase 2 | Pending |
| INTK-05 | Phase 2 | Pending |
| CTXM-01 | Phase 3 | Pending |
| CTXM-02 | Phase 3 | Pending |
| CTXM-03 | Phase 3 | Pending |
| MQTT-01 | Phase 4 | Pending |
| MQTT-02 | Phase 4 | Pending |
| MQTT-03 | Phase 4 | Pending |
| MQTT-04 | Phase 4 | Pending |
| MQTT-05 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-02-09*
*Last updated: 2026-02-09 after roadmap creation*
