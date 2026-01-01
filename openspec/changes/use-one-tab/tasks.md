# Tasks: use-one-tab

## Implementation Order

1. [ ] **Refactor AliExpress scrape state management**
   - Remove `pendingAliExpressOrderDetails` and `pendingAliExpressTracking` Maps from `lib/background/aliexpress.ts`
   - Add single-request pending state tracking
   - Update `AliExpressDependencies` type: remove `openOrderDetailsTab`/`openTrackingTab`, add `navigateScrapeTab`

2. [ ] **Update orchestration in handleAliExpressOrdersDiscovered**
   - Remove immediate `closeScrapeTab()` call after order list received
   - Refactor `scrapeAliExpressOrderDetailsForOrders` to navigate existing tab instead of creating new tabs
   - Refactor `scrapeAliExpressTrackingForOrders` to navigate existing tab instead of creating new tabs
   - Add tab closure at end of successful scrape

3. [ ] **Update message handlers**
   - `handleAliExpressOrderDetailsMessage`: remove `closeScrapeTab()` call
   - `handleAliExpressTrackingMessage`: remove `closeScrapeTab()` call
   - Both: still resolve pending promise and clear timeout

4. [ ] **Update background.ts dependencies**
   - Remove `openOrderDetailsTab` and `openTrackingTab` functions
   - Add `navigateScrapeTab` function using `browser.tabs.update()`
   - Update `getAliExpressDeps()` to provide new dependency

5. [ ] **Update error handling paths**
   - `handleAliExpressOrderDetailsParseFailure`: close the scrape tab and abort
   - `handleAliExpressTrackingParseFailure`: close the scrape tab and abort
   - Timeout handling: close single tab instead of per-request tab

6. [ ] **Add unit tests for orchestration** (`lib/background/aliexpress.test.ts`)
   - Test: tab created once, navigated N+M times, closed once at end
   - Test: navigation URLs are correct and in expected order (list → details × N → tracking × M)
   - Test: scrape completes successfully and returns combined results

7. [ ] **Add unit tests for message handlers**
   - Test: `handleAliExpressOrderDetailsMessage` resolves pending promise without closing tab
   - Test: `handleAliExpressTrackingMessage` resolves pending promise without closing tab

8. [ ] **Add unit tests for error paths**
   - Test: parse failure during details phase closes tab and aborts
   - Test: parse failure during tracking phase closes tab and aborts
   - Test: timeout closes tab and aborts

9. [ ] **Add integration test** (extend `lib/background-status.test.ts`)
   - Test: full AliExpress scrape flow uses single tab lifecycle
   - Verify: `tabs.create` called once, `tabs.update` called for navigations, `tabs.remove` called once

10. [ ] **Manual testing**
   - Verify single tab persists through entire AliExpress scrape
   - Verify order details are collected correctly
   - Verify tracking info is collected correctly
   - Verify tab closes after successful scrape
   - Verify tab closes on parse failure
   - Verify tab closes on timeout
