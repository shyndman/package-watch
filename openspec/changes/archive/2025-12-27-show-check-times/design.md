# Design: Show last check times and status in popup

## Summary
Add per-site scrape start metadata (timestamp + in-progress state) and expose it in the popup alongside in-flight order counts. Trigger an immediate scrape on browser startup to avoid long initial delays.

## Decisions
- **Source of truth**: use persistent storage for per-site status so the popup can read directly without background messaging.
- **Timestamp semantics**: record the time a scrape starts (alarm fired or startup trigger), not when it completes.
- **In-progress state**: show a small status label (e.g., "In progress") without adding a second timestamp.
- **Console logging**: log alarm fire events in the background only (no notifications, no persistent message storage).

## Data model
Per site, store:
- `lastAlarmFiredAt` (number, ms since epoch)
- `isScrapeInProgress` (boolean)

The popup renders:
- Site label
- Last check time (absolute, with seconds; `PENDING` if missing)
- In-flight count (orders where `isDelivered === false`)
- Status badge when `isScrapeInProgress` is true

## Tradeoffs
- **Pros**: minimal moving parts, simple reads from storage, no new messaging API.
- **Cons**: popup depends on storage schema; real-time updates require storage listeners or refresh.
