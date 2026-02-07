# Change: Add in-flight count toolbar badge

## Why
Users want an at-a-glance indicator of how many packages are still in flight without opening the popup.

## What Changes
- The extension SHALL display a toolbar action badge with the combined in-flight (undelivered) order count across all supported sites.
- The badge SHALL clear when the total is 0, and SHALL cap display at `99+` for totals >= 100.
- The badge SHALL update on background startup and after successful order state writes.
- The badge SHALL NOT be used to indicate scrape-in-progress status.

## Impact
- Affected specs: `order-tracking`
- Affected code:
  - `entrypoints/background.ts` (badge updates)
  - `lib/storage.ts` (read existing stored order state)
  - tests under `lib/**/*.test.ts`
