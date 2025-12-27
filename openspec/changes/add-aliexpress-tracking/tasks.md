## 1. Types and Storage Foundation

- [ ] 1.1 Add `OrderSite` type (`'amazon' | 'aliexpress'`) to `lib/types.ts`
- [ ] 1.2 Add `site` field to `OrderStatus` interface
- [ ] 1.3 Add AliExpress-specific message types (`ALIEXPRESS_ORDERS_DISCOVERED`, `ALIEXPRESS_TRACKING_SCRAPED`)
- [ ] 1.4 Update `lib/storage.ts` with site-namespaced keys and per-site getters/setters
- [ ] 1.5 Update `detectChanges()` to accept site parameter

## 2. AliExpress Content Scripts

- [ ] 2.1 Create `entrypoints/aliexpress-orders.content.ts` for order list page parsing
  - Match: `*://www.aliexpress.com/p/order/index.html*`
  - Extract: order ID, high-level status, order date, product titles
  - Detect: auth failure (login prompt instead of orders)
- [ ] 2.2 Create `entrypoints/aliexpress-tracking.content.ts` for tracking page parsing
  - Match: `*://www.aliexpress.com/p/tracking/index.html*`
  - Extract: order ID from URL, current status, status detail, isDelivered flag
  - Extract: estimated delivery date if present

## 3. Background Script Multi-Site Support

- [ ] 3.1 Add site configuration constants (URLs, intervals)
- [ ] 3.2 Convert `scrapeTabIds` to `Map<OrderSite, Set<number>>`
- [ ] 3.3 Create separate alarms per site (`scrape-amazon`, `scrape-aliexpress`)
- [ ] 3.4 Implement `performAliExpressScrape()` with two-phase flow
- [ ] 3.5 Add message handlers for AliExpress message types
- [ ] 3.6 Update `scheduleNextCheck()` to work per-site
- [ ] 3.7 Update notification logic: all changes for AliExpress, no sound

## 4. Manifest and Permissions

- [ ] 4.1 Add `*://www.aliexpress.com/*` to host_permissions in `wxt.config.ts`

## 5. Amazon Compatibility

- [ ] 5.1 Update Amazon content script to include `site: 'amazon'` in messages
- [ ] 5.2 Update Amazon message handler to use new storage API
- [ ] 5.3 Verify existing Amazon functionality unchanged

## 6. Parse Failure Notifications

- [ ] 6.1 Add notification when zero orders parsed (for both sites)
- [ ] 6.2 Ensure individual order parse errors are logged with details

## 7. Validation

- [ ] 7.1 Type-check with `pnpm compile`
- [ ] 7.2 Build with `pnpm build:firefox`
- [ ] 7.3 Manual test: Amazon order detection still works
- [ ] 7.4 Manual test: AliExpress order list scraping
- [ ] 7.5 Manual test: AliExpress tracking page scraping
- [ ] 7.6 Manual test: Status change notifications fire correctly
- [ ] 7.7 Manual test: Parse failure notification works
