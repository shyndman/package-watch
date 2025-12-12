# Change: Add MQTT delivery event publishing

## Why

Enable Home Assistant integration by publishing package delivery events to a LAN-local MQTT broker. This allows home automation triggers based on deliveries (e.g., announcements, dashboard updates).

## What Changes

- Add `mqtt` dependency for WebSocket-based MQTT communication
- Add `host_permissions` for MQTT broker WebSocket endpoint
- Set up Vitest test infrastructure (not currently configured)
- Create new `lib/mqtt.ts` module for MQTT client wrapper and publish logic
- Add pending event queue to storage for retry on failure (24h TTL)
- Integrate MQTT publishing into the notification flow in `background.ts`
- Filter for delivery events only (`isDelivered === true`)

## Impact

- Affected specs: `mqtt-delivery-events` (new capability)
- Affected code:
  - `lib/mqtt.ts` (new)
  - `lib/mqtt.test.ts` (new)
  - `lib/storage.ts` (add pending queue storage)
  - `lib/storage.test.ts` (new)
  - `lib/types.ts` (add pending event type)
  - `entrypoints/background.ts` (integrate MQTT into flow)
  - `wxt.config.ts` (add host_permissions for WebSocket)
  - `vitest.config.ts` (new - test infrastructure)
  - `package.json` (add mqtt, vitest, @webext-core/fake-browser)
