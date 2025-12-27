# Change: Show last check times and status in popup

## Why
Users want visible confirmation that automated order checks are running, including when each store last checked and how many orders remain in flight.

## What Changes
- Record per-site alarm-fired timestamps and status messages when a scrape starts
- Trigger an immediate scrape on browser startup to avoid long waits before the first check
- Surface per-site last check time, in-flight order count, and in-progress state in the popup UI

## Impact
- Affected specs: order-tracking
- Affected code: `entrypoints/background.ts`, `lib/background/scheduler.ts`, `lib/storage.ts`, `lib/types.ts`, `entrypoints/popup/*`
