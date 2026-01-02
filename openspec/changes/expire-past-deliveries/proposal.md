# Change: Expire delivered orders after one week

## Why

Stored orders persist indefinitely. Over time this accumulates stale data that will never be relevant again.

## What Changes

- Add `deliveredAt: string | null` field to `OrderStatus` to track when delivery was first detected
- Update content scripts and background code to include `deliveredAt: null` when constructing `OrderStatus` objects
- Filter out expired orders (delivered 7+ days ago) during writes in `saveOrders`
- Legacy delivered orders without `deliveredAt` expire immediately on next write
- Introduce `Temporal.Duration` for retention period (first use of Temporal API in this codebase)

## Impact

- Affected specs: order-tracking
- Affected code:
  - `lib/types.ts` - add `deliveredAt` field
  - `lib/storage.ts` - expiration logic and Temporal constant
  - `entrypoints/amazon-orders.content.ts` - include `deliveredAt: null`
  - `lib/background/aliexpress.ts` - include `deliveredAt: null` in `buildOrderStatuses`
