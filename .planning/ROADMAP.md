# Roadmap: Package Watch Milestone - Carrier Expansion + Home Assistant

## Overview

This milestone extends Package Watch from two carriers to four while keeping the existing browser-extension architecture intact. The delivery path starts with reliable FedEx/UPS tracking, then improves intake paths, then adds Home Assistant MQTT automation outputs and real-environment compatibility validation. Each phase is scoped to a user-visible capability with explicit requirement coverage.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Carrier Tracking Core** - Deliver end-to-end FedEx/UPS tracking with resilient scraping and retention parity.
- [ ] **Phase 2: Unified Manual Intake and Package Management** - Deliver one shared add flow plus inline label/edit-delete controls for FedEx/UPS entries.
- [ ] **Phase 3: Context Menu Intake Flow** - Deliver selected-text to tracking flow with shared validation behavior.
- [ ] **Phase 4: Home Assistant MQTT Outputs** - Deliver delivery events and aggregate counters with HA-friendly payload attributes.
- [ ] **Phase 5: Home Assistant Compatibility Validation** - Validate topic/QoS/payload behavior against the target Home Assistant setup before completion.

## Phase Details

### Phase 1: Carrier Tracking Core
**Goal**: Users can reliably track FedEx and UPS shipments with the same resilience guarantees already present for existing carriers.
**Depends on**: Nothing (first phase)
**Requirements**: CARR-01, CARR-02, CARR-03, CARR-04
**Success Criteria** (what must be TRUE):
  1. User can add a valid FedEx tracking number and later see status transitions reflected in the popup.
  2. User can add a valid UPS tracking number and later see status transitions reflected in the popup.
  3. User continues receiving updates from unaffected carriers even when one carrier scrape fails.
  4. User sees delivered FedEx/UPS shipments automatically expire after 7 days.
**Plans**: TBD

Plans:
- [ ] 01-01: TBD during phase planning

### Phase 2: Unified Manual Intake and Package Management
**Goal**: Users can manage FedEx/UPS tracking entries from one shared manual workflow without duplicated carrier-specific UI.
**Depends on**: Phase 1
**Requirements**: INTK-01, INTK-02, INTK-03, INTK-04, INTK-05
**Success Criteria** (what must be TRUE):
  1. User can submit FedEx or UPS tracking numbers from one shared manual-add form.
  2. User can submit a valid tracking number and have it routed to the correct carrier via format detection.
  3. User sees clear validation feedback for invalid or duplicate tracking numbers before add succeeds.
  4. User can edit a custom package label inline in the popup list and see the update persist.
  5. User can delete a tracked FedEx/UPS number and it no longer receives future checks.
**Plans**: TBD

Plans:
- [ ] 02-01: TBD during phase planning

### Phase 3: Context Menu Intake Flow
**Goal**: Users can add tracking numbers directly from selected page text with the same protections as manual intake.
**Depends on**: Phase 2
**Requirements**: CTXM-01, CTXM-02, CTXM-03
**Success Criteria** (what must be TRUE):
  1. User can select tracking-like text on a page and invoke a context-menu action to start add flow.
  2. User has selected text parsed to extract the tracking token before add is attempted.
  3. User gets the same invalid/duplicate validation behavior as the shared manual-add form.
**Plans**: TBD

Plans:
- [ ] 03-01: TBD during phase planning

### Phase 4: Home Assistant MQTT Outputs
**Goal**: Home Assistant can consume package state changes as both event triggers and aggregate automation context.
**Depends on**: Phase 1
**Requirements**: MQTT-01, MQTT-02, MQTT-03, MQTT-04
**Success Criteria** (what must be TRUE):
  1. Home Assistant receives a delivery event when a tracked package transitions to delivered.
  2. Home Assistant receives aggregate in-flight package count updates.
  3. Home Assistant receives aggregate arriving-today package count updates.
  4. Home Assistant can consume JSON attributes on count payloads with useful package context.
**Plans**: TBD

Plans:
- [ ] 04-01: TBD during phase planning

### Phase 5: Home Assistant Compatibility Validation
**Goal**: User can verify MQTT topic/QoS/payload compatibility in the real Home Assistant environment before milestone sign-off.
**Depends on**: Phase 4
**Requirements**: MQTT-05
**Success Criteria** (what must be TRUE):
  1. User can run end-to-end validation in their Home Assistant setup and confirm delivery events trigger expected automations.
  2. User can confirm aggregate count topics, QoS settings, and payload shapes are accepted by their Home Assistant configuration.
**Plans**: TBD

Plans:
- [ ] 05-01: TBD during phase planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Carrier Tracking Core | 0/TBD | Not started | - |
| 2. Unified Manual Intake and Package Management | 0/TBD | Not started | - |
| 3. Context Menu Intake Flow | 0/TBD | Not started | - |
| 4. Home Assistant MQTT Outputs | 0/TBD | Not started | - |
| 5. Home Assistant Compatibility Validation | 0/TBD | Not started | - |
