## Context
- Extension already tracks Amazon + AliExpress orders by reusing a background scheduler, single-tab orchestrator, shared storage helpers, and popup list.
- Users now want FedEx coverage without provisioning FedEx API credentials or running any backend proxy.
- FedEx’s public SPA fetches tracking details server-side and renders them into the DOM; scraping that DOM from an extension tab is viable but brittle. We must describe how to detect DOM readiness, which selectors to read, and how to fail fast if markup changes.

- Goals: (1) Add FedEx as a third site in the scheduler/alarm system, (2) Scrape `fedex.com/fedextrack/?trknbr=…` sequentially for a small user-managed list, (3) Reuse the existing change detection + notification stack, (4) Let users label each FedEx tracking number inline in the popup, (5) Keep storage boundaries clear so tests remain isolated, (6) Provide explicit message flows + storage schemas so a junior engineer can wire popup ↔ background ↔ content without guessing, (7) Spell out telemetry/logging expectations for scrape failures, (8) Match the existing 7-day delivered-order retention so FedEx entries auto-expire without bespoke cleanup logic.
- Non-Goals: (1) Implement any FedEx OAuth/API integration or backend proxy, (2) Generalize to arbitrary carriers, (3) Build history/export tooling for delivered FedEx shipments, (4) Handle authenticated FedEx accounts.

## Decisions
1. **Single-tab DOM scrape** – Follow the AliExpress pattern: the background process opens one hidden tab and walks through each tracking number. Rationale: avoids Akamai header spoofing and lets real browser cookies satisfy anti-bot checks. Alternative (direct gateway POST) was rejected because it would require reproducing FedEx’s bot-mitigation tokens and risks more frequent blocking. Implementation specifics:
   - Entry point: existing scrapers call a shared `runSiteScrape(site, handler)` helper; we add a `FedExScraper` that conforms to the same interface.
   - Lifecycle: `openTab()` (existing helper) navigates to the first FedEx tracking URL with `?trknbr=` query, `waitForReady()` resolves when the DOM contains `.trackingContent` (or fails after `SCRAPE_TIMEOUT_MS`), content script posts results, background calls `navigate()` with the next tracking number, repeat.
   - Failure handling: any timeout, parse failure, or navigation error triggers `closeTab()` and surfaces through the shared parse-failure path.
2. **Normalize to `OrderStatus`** – The content script extracts `status`, `statusDetail`, `isDelivered`, `estimatedDelivery`, `trackingNumber`, `lastUpdated`, and the background injects the editable label (if present) as the lone `productTitles[0]`. Implementation details:
   - Content script posts `{type:'fedex-tracking-result', trackingNumber, status, detail, estimatedDeliveryISO|null, delivered:boolean, rawTimestampISO}` to background.
   - Background merges the stored label from `storage.fedex.queue` to render the `productTitles` / `productUrls` fields (tracking deep-link) so existing `OrderStatus` sorting works.
   - `isDeliveryExpectedToday` is derived by comparing estimated delivery (if present) or “On vehicle for delivery” statuses against today’s date using Temporal.
3. **Inline label editing** – Because FedEx responses lack product titles, each popup row exposes a ghosted label span that toggles into an input on click.
   - Popup component tree: each FedEx card receives `{trackingNumber,label,status,statusDetail,eta,isDelivered,lastUpdated}`.
   - Events: clicking the label sets `editingId = trackingNumber`, renders an `<input>` with `v-model` bound to `draftLabel`. Enter submits via `browser.runtime.sendMessage({type:'fedex:updateLabel', trackingNumber, label: normalizedDraft })`, blur triggers the same handler, Escape restores the previous label without sending.
   - Background handles `fedex:updateLabel` by updating `storage.fedex.queue[trackingNumber].label` and re-saving; on success it emits a `fedex:labelUpdated` message so the popup can refresh state without reloading.
4. **Sequential queue management** – FedEx tracking numbers live in a queue record (`storage.fedex.queue`). Each alarm run iterates this queue serially, logging progress after each number so mid-run crashes can safely resume from the first number on the next alarm. Delivered shipments age out automatically after 7 days through the shared `saveOrders()` retention logic, but queue entries remain so users can continue checking tracking history unless they delete them.
   - Storage shape: `{ entries: Record<trackingNumber, { label: string, createdAt: string, lastScrapedAt: string|null, lastResultStatus: 'success'|'parse-failure'|'timeout'|null }> }`.
   - Background keeps `storage.fedex.scrapeState = { lastAlarmFiredAt, isScrapeInProgress, lastProcessedTrackingNumber|null }` so we can report progress in the popup and know where a failure occurred.
   - The queue is iterated in deterministic order (sorted by createdAt) each alarm; removing a number deletes it from both queue + stored shipments.

5. **Popup UX parity** – The popup must (a) show FedEx header stats (last check timestamp, in-flight count, in-progress chip), (b) render FedEx shipments inline with Amazon/Ali cards but with label editing affordances, (c) expose errors inline (invalid entry, duplicate number, scrape failure message), (d) include per-row actions (“View on FedEx”, delete icon, label input) and keyboard guidance for screen readers. Implementation details include:
   - Form: `<label>FedEx tracking number</label>` + `<input type="text" inputmode="numeric" pattern="\d{12,22}">` + Add button disabled while empty/invalid.
   - Validation order: trim whitespace, reject non-digits, enforce 12–22 digits, reject duplicates. Errors appear as inline text under the input.
   - Submissions send `fedex:addTrackingNumber` to background, which verifies again (defense in depth) before writing to storage and returning success/failure so the popup can show toast/error.
   - List rows: show `label || ghosted placeholder`, `trackingNumber`, `status/statusDetail`, `ETA/delivery date`, `Delivered` chip, `View on FedEx` link, trash icon. Delivered rows remain but show muted background.
   - Label editing accessibility: add `role="button"` + `tabindex="0"` on the label span so keyboard users can enter edit mode via Enter/Space. Input enforces max length (50 chars) and trims on save.

## Risks / Trade-offs
- **ToS and anti-bot risk** – Scraping consumer pages may violate FedEx’s terms and could trigger Akamai blocks. Mitigation: limit scrape frequency (matching existing cadence), keep a single genuine tab, and expose “Open in FedEx” links for manual refresh.
- **DOM drift** – FedEx can change markup without notice. Mitigation: content script includes schema guards and telemetry logging so we can triage parse failures quickly.
- **Label persistence UX** – Inline editing introduces more popup state management. Mitigation: reuse Vue’s controlled form patterns, keep validation minimal (max length, trim whitespace).
- **Queue growth** – There’s a risk users add dozens of numbers despite “small list” guidance. Mitigation: rely on documentation to set expectations, keep sequential scraping (one tab) so the impact is known, and log queue length to help diagnose slow runs if needed.
- **Data mismatch** – Without real product data, we rely on user-provided labels. We must ensure notifications use label when available and otherwise fall back to the tracking number so users know which package changed.

## Open Questions
None—requirements are fully captured above.

## FedEx DOM scraping blueprint
1. **Tab orchestration**
   - Background uses the shared `runSiteScrape` helper to open exactly one hidden tab, navigate to `https://www.fedex.com/fedextrack/?trknbr={trackingNumber}&cntry_code=us`, and reuse that tab for every tracking number in the queue.
   - Before each navigation we log `[FedEx] Tracking {trackingNumber}: start` and store `currentTrackingNumber` in the scrape state so failures can be surfaced in the popup.
   - After the content script reports success/failure we either navigate to the next tracking number or close the tab if the queue is exhausted.

2. **Content script lifecycle**
   - Registered via `defineScrapingScript` with `matches: ['*://www.fedex.com/fedextrack/*']` and runs at `document_idle`.
   - Poll every 300ms (up to the shared `SCRAPE_TIMEOUT_MS` of 30s) for `document.querySelector('[data-testid="trackingSummary-content"]')`. This container anchors the rest of the selectors below.
   - If the poll exceeds the timeout, throw `ParseFailureError('FedEx: Timed out waiting for tracking summary', undefined, location.href)` so the background parse-failure alert fires.

3. **Selectors + parsing**
   - **Status**: `[data-testid="trackingSummary-statusHeader"]`. Required; missing node → parse failure.
   - **Status detail**: `[data-testid="trackingSummary-statusDescription"]` (concatenate text nodes, collapse whitespace).
   - **Scheduled / estimated delivery**: `[data-testid="trackingSummary-scheduledDelivery"] time` (ISO `datetime`). If present but missing `datetime`, treat as parse failure.
   - **Delivered flag**: `status.toLowerCase().includes('delivered') || detail.toLowerCase().includes('delivered')`.
   - **Last updated timestamp**: `[data-testid="trackingSummary-lastUpdated"] time` (optional, stored for debugging but not critical).
   - **Error banner**: `[data-testid="trackingSummary-error"]` indicates FedEx could not find the shipment; treat as parse failure with the banner text as `reason` so the popup can show “FedEx could not find that tracking number”.

4. **Message flow**
   - Content script sends `sendMessage('fedex:trackingResult', { trackingNumber, status, statusDetail, estimatedDeliveryIso, delivered, lastUpdatedIso })`.
   - Background responds with `{ ok: true }` or `{ ok:false, reason }`; unsuccessful responses cause the script to throw `ParseFailureError(reason)` so upstream handling stays consistent.

5. **Normalization + storage**
   - Background maps the payload to `OrderStatus` as described earlier, stamps `orderId = trackingNumber`, `productTitles = [label || trackingNumber]`, `productUrls = [tracking link]`, `deliveredAt` assigned when `isDelivered` transitions true.
   - After each tracking number finishes, update `storage.fedex.queue[trackingNumber].lastScrapedAt` and `lastResultStatus` (“success”, “parse-failure”, “timeout”).

6. **Failure propagation**
   - Any thrown `ParseFailureError` triggers `sendMessage('scrape:parseFailure', { site:'fedex', phase:'fedex-tracking', reason, url })` exactly like other sites.
   - Background stops the remaining queue, closes the tab, marks `lastResultStatus = 'parse-failure'`, and surfaces the reason inside the popup row.

7. **Timeout / navigation errors**
   - If the tab navigation errors (network, 5xx), record `lastResultStatus = 'timeout'` with the error message and reschedule using the default interval.
   - Popup rows display a warning badge for non-success statuses encouraging the user to open the manual FedEx link.
