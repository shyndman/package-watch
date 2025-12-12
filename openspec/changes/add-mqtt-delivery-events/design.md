# Design: MQTT Delivery Event Publishing

## Context

The extension currently detects package deliveries and sends browser notifications. We want to also publish these events to a Home Assistant MQTT broker for home automation integration.

**Constraints:**
- Browser extension environment (no raw TCP, must use WebSocket)
- MQTT broker: `ws://ha-mosquitto-ws.don` (port 80, no auth)
- Target: Home Assistant MQTT event entity
- Events are infrequent (at most every 10-30 min scrape cycle)

## Goals / Non-Goals

**Goals:**
- Publish "delivered" events to MQTT when packages are marked delivered
- Include item names and vendor in event payload
- Retry failed publishes on next scrape cycle (24h TTL)
- Keep implementation simple and focused

**Non-Goals:**
- Persistent MQTT connection (unnecessary for low frequency)
- Other event types beyond "delivered"
- MQTT discovery/auto-configuration in Home Assistant
- Configurable broker URL (hardcoded for now)

## Decisions

### Connection Strategy: Connect-per-publish
- Open WebSocket connection when delivery events need publishing
- Publish all pending + new events
- Disconnect immediately after
- **Rationale**: Events are infrequent, connection overhead (~100-200ms) is negligible, eliminates connection state management complexity

### Retry Strategy: Pending event queue with TTL
- Failed publishes are stored in extension storage
- On next scrape cycle, retry pending events before processing new ones
- Events older than 24h are dropped (stale delivery events aren't useful)
- **Rationale**: Simple, stateless retry without complex queueing; aligns with existing storage patterns

### Event Payload Format
```json
{
  "event_type": "delivered",
  "items": ["Product Name 1", "Product Name 2"],
  "vendor": "amazon"
}
```
- `event_type` is required by Home Assistant MQTT event entity
- `items` as JSON array (HA supports native arrays in attributes)
- `vendor` enables future multi-vendor support

### Topic Structure
- Topic: `deliveries/event/amazon/state`
- Follows Home Assistant MQTT event conventions
- Vendor in path allows future vendor-specific topics

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Broker unreachable | Queue for retry, log warning, continue with notifications |
| Extension suspended mid-publish | MV2 less aggressive than MV3; connect-per-publish minimizes window |
| Duplicate events after retry | HA event entities are stateless; duplicates are harmless |

## Data Types

### PendingMqttEvent
```typescript
interface PendingMqttEvent {
  orderId: string;
  productTitles: string[];
  vendor: string;
  failedAt: number;  // timestamp for TTL calculation
}
```

### Storage Key
Following existing pattern in `lib/storage.ts`:
```typescript
const PENDING_MQTT_KEY = 'local:pendingMqttDeliveries';
```

### Storage Functions
Matching existing style (`getStoredOrders`, `saveOrders`):
```typescript
export async function getPendingMqttEvents(): Promise<PendingMqttEvent[]>
export async function savePendingMqttEvents(events: PendingMqttEvent[]): Promise<void>
```

## MQTT.js API Reference

Library: [`mqtt`](https://github.com/mqttjs/MQTT.js) v5.14.1 (types bundled, rewritten in TypeScript as of v5.0.0)

### Connection
```typescript
import mqtt from 'mqtt';
import type { MqttClient, IClientOptions } from 'mqtt';

const options: IClientOptions = {
  reconnectPeriod: 0,       // Disable auto-reconnect (we handle manually via pending queue)
  connectTimeout: 5000,     // 5s timeout (default is 30s)
};

// Returns MqttClient instance
const client: MqttClient = mqtt.connect('ws://ha-mosquitto-ws.don', options);
```

### Events
```typescript
client.on('connect', (connack) => { /* CONNACK packet received */ });
client.on('error', (error: Error) => { /* Connection error */ });
client.on('close', () => { /* Connection closed */ });
```

### Publish
```typescript
// Callback signature: (err?: Error, packet?: Packet) => void
// Fired when QoS handling completes, or at next tick if QoS 0
client.publish(
  topic: string,
  message: string | Buffer,
  options?: { qos?: 0 | 1 | 2, retain?: boolean, dup?: boolean },
  callback?: (err?: Error, packet?: Packet) => void
);
```

### Disconnect
```typescript
// force: close immediately without waiting for in-flight acks
// callback: called when client is closed
client.end(force?: boolean, options?: object, callback?: () => void);
```

### Browser Limitations
- Cannot catch all WebSocket errors (browser security)
- No client certificate support
- No CA specification (browser-controlled)

## Extension Permissions

Requires adding WebSocket host to `host_permissions` in `wxt.config.ts`:
```typescript
host_permissions: ['*://www.amazon.ca/*', 'ws://ha-mosquitto-ws.don/*']
```

## Test Infrastructure

Project currently has no test setup. Need to add:

**Dev Dependencies:**
- `vitest` v4.0.15 - Test runner
- `@webext-core/fake-browser` v1.3.2 - In-memory browser API mock (used by WXT's plugin)

Note: WXT's Vitest plugin is built into WXT at `wxt/testing/vitest-plugin` - no separate package needed.

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
});
```

The WxtVitest plugin:
- Polyfills `browser` API with `@webext-core/fake-browser` (in-memory implementation)
- Sets up WXT globals (`import.meta.env.BROWSER`, etc.)
- Configures aliases (`@/*`, `@@/*`, etc.)

**package.json script:**
```json
"test": "vitest"
```

**Test file pattern:** Use `fakeBrowser.reset()` before each test to clear state.

## Open Questions

None - all decisions made during design discussion.
