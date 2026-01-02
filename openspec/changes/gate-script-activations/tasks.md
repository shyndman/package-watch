# Tasks: Gate Content Script Activations

## 1. Dependencies

- [ ] 1.1 Install `@webext-core/messaging` as direct dependency
- [ ] 1.2 Remove `@webext-core/proxy-service` dependency

## 2. Activation Infrastructure

- [ ] 2.1 Create `lib/scrape-activation.ts` with typed messaging protocol
  - Define `ProtocolMap` with `scrape:checkActivation` message type
  - Export `sendMessage` and `onMessage` from `defineExtensionMessaging`

- [ ] 2.2 Create `lib/define-scraping-script.ts` wrapper
  - Define `ScrapingScriptConfig` type (same as `ContentScriptConfig` but `scrape` instead of `main`)
  - Implement `defineScrapingScript` that wraps `defineContentScript`
  - In `main()`: call `sendMessage('scrape:checkActivation')`, return early if false, otherwise call `scrape()`

- [ ] 2.3 Write tests for `defineScrapingScript`
  - Test: when activation check returns false, `scrape()` is not called
  - Test: when activation check returns true, `scrape()` is called
  - Test: logs debug message when staying inert

## 3. Background Script Updates

- [ ] 3.1 Register activation message handler at top of `defineBackground`
  - Import `onMessage` from `lib/scrape-activation`
  - Handler checks `sender.tab?.id` against `scrapeTabIds` set
  - Return boolean result

- [ ] 3.2 Write tests for activation handler
  - Test: returns true when tab ID is in scrapeTabIds
  - Test: returns false when tab ID is not in scrapeTabIds
  - Test: returns false when sender.tab is undefined

- [ ] 3.3 Simplify tab tracking to single `Set<number>`
  - Replace `scrapeTabIdsBySite: Map<OrderSite, Set<number>>` with `scrapeTabIds: Set<number>`
  - Update `openScrapeTab` to add to the set
  - Update `closeScrapeTab` to remove from the set (remove site parameter)
  - Update all call sites

- [ ] 3.4 Remove redundant tab ownership checks from message handlers
  - Remove checks that verify tab is in scrape set before processing messages
  - Messages now only arrive from activated tabs

## 4. Content Script Migration

- [ ] 4.1 Migrate `entrypoints/amazon-orders.content.ts`
  - Replace `defineContentScript` with `defineScrapingScript`
  - Rename `main()` to `scrape()`
  - Keep all scrape logic unchanged

- [ ] 4.2 Migrate `entrypoints/aliexpress-orders.content.ts`
  - Replace `defineContentScript` with `defineScrapingScript`
  - Rename `main()` to `scrape()`
  - Keep all scrape logic unchanged

- [ ] 4.3 Migrate `entrypoints/aliexpress-order-details.content.ts`
  - Replace `defineContentScript` with `defineScrapingScript`
  - Rename `main()` to `scrape()`
  - Keep all scrape logic unchanged

- [ ] 4.4 Migrate `entrypoints/aliexpress-tracking.content.ts`
  - Replace `defineContentScript` with `defineScrapingScript`
  - Rename `main()` to `scrape()`
  - Keep all scrape logic unchanged

## 5. Verification

- [ ] 5.1 Run tests: `pnpm test`
- [ ] 5.2 Build and type-check: `pnpm compile`
- [ ] 5.3 Manual test: open AliExpress order page manually, verify content script stays inert
- [ ] 5.4 Manual test: trigger scheduled scrape, verify scraping works normally
