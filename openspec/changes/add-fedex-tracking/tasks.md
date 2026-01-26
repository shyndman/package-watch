## 1. Foundations
- [ ] 1.1 Extend shared enums/types/constants:
   - Add `fedex` to `OrderSite`, parse-failure phases, scheduler label/interval maps, and storage key maps.
   - Update any exhaustive `switch`/`Record<OrderSite,...>` helpers plus associated unit tests.
- [ ] 1.2 Define FedEx storage schema + helpers:
   - Create `storage.fedex.queue` (tracking entries + labels + timestamps + scrape status flags).
   - Expose helper functions (`getFedexQueue`, `addFedexTrackingNumber`, `updateFedexLabel`, `removeFedexTrackingNumber`, `getFedexScrapeStatus`, `setFedexScrapeStatus`).
   - Ensure helpers run validation (digits-only, length, duplicates) so popup/background share the same rules.
   - Reuse the existing delivered-order retention logic so FedEx orders auto-expire after 7 days without bespoke cleanup.
- [ ] 1.3 Instrument scheduler metadata:
   - Add FedEx entry to site config arrays used by popup header stats.
   - Update logging to include `[FedEx Orders]` labels and confirm `scheduleNextCheck('fedex', ...)` uses the new intervals.

## 2. FedEx scrape pipeline
- [ ] 2.1 Background adapter:
   - Create `fedex.ts` module that exports `scrapeFedex()` hooking into the shared single-tab orchestration.
   - Iterate queue entries in deterministic order, track the current tracking number for progress logging, and skip entries flagged as deleted.
   - Normalize content-script messages into `OrderStatus` objects (inject label/tracking deep-link), run through `detectChanges`, `saveOrders`, and `scheduleNextCheck`.
   - Update per-tracking metadata (`lastScrapedAt`, `lastResultStatus`, `lastErrorMessage`) after each attempt.
- [ ] 2.2 Content script implementation:
   - Register via `defineScrapingScript` for `*://www.fedex.com/fedextrack/*` and run at `document_idle`.
   - Poll every 300 ms (up to `SCRAPE_TIMEOUT_MS`) for `[data-testid="trackingSummary-content"]`; timeout triggers `ParseFailureError('FedEx: Timed out waiting for tracking summary')`.
   - Parse required fields with explicit selectors: status header (`[data-testid="trackingSummary-statusHeader"]`), description, scheduled delivery `<time datetime>` node, delivered flag derived from status/detail, and optional last-updated `<time>`.
   - Detect the “tracking errors” banner (`[data-testid="trackingSummary-error"]`) and convert it into a parse failure that includes the banner text.
   - Send `fedex:trackingResult` messages containing `{trackingNumber,status,statusDetail,estimatedDeliveryIso,delivered,lastUpdatedIso}` and throw if the background responds with `{ok:false}`.
- [ ] 2.3 Error handling + retries:
   - Ensure parse failures abort the remaining queue, close the tab, and surface notifications identical to other sites.
   - Log each tracking number start/end with its outcome so the popup can report the last processed item.
   - Persist `lastScrapedAt`, `lastResultStatus`, and any error message per tracking number for future UX.
   - On navigation/network errors, record a timeout status, close the tab, and let the scheduler reschedule using the default interval.
- [ ] 2.4 Tests:
   - Add unit/integration tests covering sequential iteration order, DOM parsing success/failure paths, normalization to `OrderStatus`, change detection parity, delivered sound triggers, and popup warning badges for failed scrapes.

## 3. Popup input + label editing
- [ ] 3.1 Tracking-number form:
   - Add labeled input + Add button, inputmode numeric, placeholder text, and inline error slot.
   - Implement validation (digits-only, length 12–22, duplicate detection). Disable button until valid.
   - On submit, call background via `fedex:addTrackingNumber`, handle success (clear input, refresh list) and error (show message, keep input value).
- [ ] 3.2 Header stats + empty state:
   - Include FedEx in the site stats ribbon (count, last check, in-progress pill).
   - Add an empty-state message specific to FedEx when no numbers are stored.
- [ ] 3.3 Shipment list rendering:
   - Render FedEx shipments in the main list with consistent card UI (status headline, detail, label placeholder, tracking number, delivered chip, view link, delete button).
   - Show inline scrape error badges when `lastResultStatus` is `parse-failure`/`timeout` to prompt manual refresh.
- [ ] 3.4 Label editing UX:
   - Implement span → input toggle, keyboard accessibility, placeholder text, and trimmed persistence via `fedex:updateLabel` message.
   - Handle blur/Enter/Escape properly, show loading/error states if background update fails, and refresh popup state when label updates arrive.
- [ ] 3.5 Removal + deep-link actions:
   - Wire trash icon to `fedex:removeTrackingNumber`, confirm background deletes entries + stored orders.
   - Ensure “View on FedEx” opens the tracking URL and closes the popup.

## 4. Validation + docs
- [ ] 4.1 Update `openspec/specs/order-tracking/spec.md` Purpose once feature ships, archive change, etc.
- [ ] 4.2 Run `pnpm test run`, lint, and typecheck; add any missing unit/E2E coverage.
- [ ] 4.3 Document ToS risk + manual refresh fallback in README or release notes if required.
