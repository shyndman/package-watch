# Phase 1: Carrier Tracking Core - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver reliable FedEx and UPS tracking behavior with the same resilience guarantees already expected in the extension: status transitions appear, unaffected carriers continue when one carrier fails, and delivered FedEx/UPS entries expire after 7 days.

This phase is about carrier tracking core behavior only. Shared intake UX, context-menu flow, and MQTT outputs remain in later phases.

</domain>

<decisions>
## Implementation Decisions

### Scrape Discovery Workflow
- Selector discovery workflow is locked to **Camoufox + Playwright**.
- Do **not** rely on active DevTools sessions for selector discovery.
- Assumption for this phase: runtime scraping in a normal human browser session should be treated as the baseline behavior.

### Evidence and Fixtures
- Keep **HTML snapshots + expected parsed fields** as source-of-truth artifacts for scraping behavior.
- Carrier selector changes should include **before/after fixture proof** plus parsed output changes.
- If fixture expectations and live behavior conflict, **live behavior wins after manual review**.

### Validation Gate
- A carrier scrape change is considered acceptable only when both pass:
  - live run validation, and
  - fixture-based validation.

### Coverage Strategy
- Do not block progress on a full ideal state matrix.
- Start with whatever real carrier states are available, then expand coverage incrementally as new real-world examples appear.
- Reason captured from discussion: package volume is limited, so complete state coverage may not be immediately attainable.

### Claude's Discretion
- Exact mechanics for fixture capture/update tooling inside the Camoufox + Playwright workflow.
- Exact cadence and process for adding new fixture states over time.

</decisions>

<specifics>
## Specific Ideas

- Practical focus is on a workable, repeatable selector-development system rather than theoretical completeness.
- Keep research/planning grounded in real observed pages and evidence artifacts.

</specifics>

<deferred>
## Deferred Ideas

- Explicit anti-bot/challenge-specific product behavior and fallback policy are deferred until they are observed as a real problem in this milestone.

</deferred>

---

*Phase: 01-carrier-tracking-core*
*Context gathered: 2026-02-09*
