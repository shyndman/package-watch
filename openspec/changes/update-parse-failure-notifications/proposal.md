# Change: Update parse failure notifications for delivery parsing

## Why
Parsing failures currently surface only when zero orders are parsed, which misses many real breakages. We need strict parse failure detection and notifications so site changes are caught immediately, with stack traces to speed fixes.

## What Changes
1. Define a dedicated parse failure error type and use it for all meaningful parsing failures.
2. Treat any meaningful parsing failure as fatal for that scrape run and do not record partial results.
3. Aggregate parse-failure notifications per site per scrape run and include a reason when available.
4. Log parse failure exceptions with full stack traces.

## Impact
1. Affected specs: `order-tracking` (Parse Failure Notification requirement)
2. Affected code: `entrypoints/amazon-orders.content.ts`, `entrypoints/aliexpress-orders.content.ts`, `entrypoints/aliexpress-tracking.content.ts`, `entrypoints/background.ts`, `lib/background/aliexpress.ts`, `lib/background/notifications.ts`, `lib/types.ts`
