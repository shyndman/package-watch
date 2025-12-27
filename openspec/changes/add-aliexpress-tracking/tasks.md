## 1. Types and Storage Foundation

- [x] 1.1 Add `OrderSite` type (`'amazon' | 'aliexpress'`) to `lib/types.ts`
- [x] 1.2 Add `site` field to `OrderStatus` interface
- [x] 1.3 Add AliExpress-specific message types (`ALIEXPRESS_ORDERS_DISCOVERED`, `ALIEXPRESS_TRACKING_SCRAPED`)
- [x] 1.4 Update `lib/storage.ts` with site-namespaced keys and per-site getters/setters
- [x] 1.5 Update `detectChanges()` to accept site parameter
- [ ] 1.6 Add AliExpress order-details message type and result type
- [ ] 1.7 Update `AliExpressDiscoveredOrder` to store order details URL (and remove product titles/urls)
- [ ] 1.8 Add `aliexpress-order-details` parse failure phase

## 2. AliExpress Content Scripts

- [ ] 2.1 Update `entrypoints/aliexpress-orders.content.ts` for order list page parsing
  - Match: `*://www.aliexpress.com/p/order/index.html*`
  - Extract: order ID, high-level status, order date, order details URL, tracking URL
  - Detect: auth failure (login prompt instead of orders)
- [x] 2.2 Create `entrypoints/aliexpress-tracking.content.ts` for tracking page parsing
  - Match: `*://www.aliexpress.com/p/tracking/index.html*`
  - Extract: order ID from URL, current status, status detail, isDelivered flag
  - Extract: estimated delivery date if present
- [ ] 2.3 Create `entrypoints/aliexpress-order-details.content.ts` for order details page parsing
  - Match: `*://www.aliexpress.com/p/order/detail.html*`
  - Extract: first product title + URL
  - Detect: parse failure if required elements are missing

## 3. Background Script Multi-Site Support

- [x] 3.1 Add site configuration constants (URLs, intervals)
- [x] 3.2 Convert `scrapeTabIds` to `Map<OrderSite, Set<number>>`
- [x] 3.3 Create separate alarms per site (`scrape-amazon`, `scrape-aliexpress`)
- [ ] 3.4 Update `performAliExpressScrape()` to three-phase flow (order list → order details → tracking)
- [x] 3.5 Add message handlers for AliExpress message types
- [x] 3.6 Update `scheduleNextCheck()` to work per-site
- [x] 3.7 Update notification logic: all changes for AliExpress, no sound
- [ ] 3.8 Add order details message handler + pending request tracking
- [ ] 3.9 Merge order details product info into `OrderStatus` build

## 4. Manifest and Permissions

- [x] 4.1 Add `*://www.aliexpress.com/*` to host_permissions in `wxt.config.ts`

## 5. Amazon Compatibility

- [x] 5.1 Update Amazon content script to include `site: 'amazon'` in messages
- [x] 5.2 Update Amazon message handler to use new storage API
- [ ] 5.3 Verify existing Amazon functionality unchanged

## 6. Parse Failure Notifications

- [x] 6.1 Add notification when zero orders parsed (for both sites)
- [x] 6.2 Ensure individual order parse errors are logged with details

## 7. Validation

- [ ] 7.1 Type-check with `pnpm compile`
- [ ] 7.2 Build with `pnpm build:firefox`
- [ ] 7.3 Manual test: Amazon order detection still works
- [ ] 7.4 Manual test: AliExpress order list scraping
- [ ] 7.5 Manual test: AliExpress tracking page scraping
- [ ] 7.6 Manual test: Status change notifications fire correctly
- [ ] 7.7 Manual test: Parse failure notification works
