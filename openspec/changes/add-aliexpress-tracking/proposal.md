# Change: Add AliExpress Order Tracking

## Why

Users want to track packages from AliExpress in addition to Amazon. AliExpress orders have different status granularity and longer shipping times, requiring site-specific polling intervals and status change detection.

## What Changes

- Add AliExpress order list, order details, and tracking page scraping (new content scripts)
- Introduce multi-site architecture with `OrderSite` type discriminator
- Site-namespaced storage for independent state per retailer
- Separate alarms per site with configurable polling intervals
- Three-phase AliExpress scraping: order list discovery → order details for product info → tracking page details
- Auth detection to notify when AliExpress session expires
- AliExpress notifications on **all** status changes (vs Amazon delivery-only)

## Impact

- **Affected specs**: order-tracking (new capability spec)
- **Affected code**:
  - `lib/types.ts` - Add `OrderSite`, update `OrderStatus` and message types
  - `lib/storage.ts` - Site-namespaced storage
  - `entrypoints/background.ts` - Multi-site orchestration
  - `wxt.config.ts` - Add AliExpress host permissions
  - New: `entrypoints/aliexpress-orders.content.ts`
  - New: `entrypoints/aliexpress-order-details.content.ts`
  - New: `entrypoints/aliexpress-tracking.content.ts`
