# Stack Research

**Domain:** Browser Extension + Home Assistant Automation (Package Tracking)
**Milestone:** Carrier Expansion + MQTT Integration
**Researched:** 2026-02-08
**Confidence:** HIGH

## Recommended Stack

### Core Additions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| mqtt | 5.15.0 | MQTT client for Home Assistant integration | Full WebSocket support in browsers, TypeScript-first (v5+), 9k+ GitHub stars, actively maintained (last release 2026-02-02). Purpose-built for browser environments with automatic WebSocket fallback. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tracking-number-validation (custom) | n/a | Carrier detection from tracking number format | Extract patterns from jkeen/tracking_number_data repo rather than adding dependency — carrier regex patterns rarely change, and custom validation avoids external package risk. |

### Development Tools (No New Additions Required)

| Tool | Purpose | Notes |
|------|---------|-------|
| Existing Vitest setup | Testing MQTT module | Already configured in project; use `@webext-core/fake-browser` for browser API mocking in tests. |

## Installation

```bash
# Core MQTT dependency
pnpm add mqtt@^5.15.0

# Already present in project (verify during implementation):
# - @webext-core/messaging (for background/content communication)
# - @wxt-dev/storage (for pending event queue)
```

## Carrier Detection Patterns

Based on jkeen/tracking_number_data repository (widely-used reference):

### FedEx Tracking Numbers

| Format | Pattern | Regex (cleaned) | Confidence |
|--------|---------|-----------------|------------|
| FedEx Express (12-digit) | 12 digits | `^\d{12}$` | HIGH |
| FedEx Express (34-digit) | 100... or 102... prefix | `^1\d{33}$` | HIGH |
| FedEx Ground | 15 digits | `^\d{15}$` | HIGH |
| FedEx SmartPost | 92... prefix, 22 digits | `^92\d{20}$` | HIGH |
| FedEx Ground 96 | 96... prefix | `^96\d{20}$` | HIGH |

**Recommended FedEx detection regex:**
```typescript
const FEDEX_PATTERNS = [
  /^\d{12}$/,          // Express 12-digit
  /^1\d{33}$/,         // Express 34-digit  
  /^\d{15}$/,          // Ground 15-digit
  /^92\d{20}$/,        // SmartPost
  /^96\d{20}$/,        // Ground 96
];
```

### UPS Tracking Numbers

| Format | Pattern | Regex | Confidence |
|--------|---------|-------|------------|
| UPS Standard | 1Z + 16 alphanumeric | `^1Z[A-Z0-9]{16}$` | HIGH |
| UPS Waybill | 10 digits, starts with A/H/J/K/T/V | `^[AHJKTV]\d{9}$` | MEDIUM |
| UPS Numeric | 11 digits | `^\d{11}$` | MEDIUM (less common) |

**Recommended UPS detection regex:**
```typescript
const UPS_PATTERNS = [
  /^1Z[A-Z0-9]{16}$/i,  // Standard 1Z format (case-insensitive)
  /^[AHJKTV]\d{9}$/i,   // Waybill format
  /^\d{11}$/,           // Numeric fallback
];
```

### Auto-Detection Priority

```typescript
function detectCarrier(trackingNumber: string): 'fedex' | 'ups' | null {
  const cleaned = trackingNumber.replace(/\s/g, '').toUpperCase();
  
  // UPS 1Z format is unique — check first
  if (/^1Z[A-Z0-9]{16}$/i.test(cleaned)) return 'ups';
  
  // UPS waybill formats
  if (/^[AHJKTV]\d{9}$/i.test(cleaned)) return 'ups';
  
  // FedEx 12-digit (most common FedEx)
  if (/^\d{12}$/.test(cleaned)) return 'fedex';
  
  // FedEx 34-digit
  if (/^1\d{33}$/.test(cleaned)) return 'fedex';
  
  // FedEx Ground 15-digit (overlaps with nothing else)
  if (/^\d{15}$/.test(cleaned)) return 'fedex';
  
  // FedEx SmartPost/Ground 96
  if (/^92\d{20}$/.test(cleaned) || /^96\d{20}$/.test(cleaned)) return 'fedex';
  
  // UPS numeric fallback
  if (/^\d{11}$/.test(cleaned)) return 'ups';
  
  return null; // Ambiguous or unknown
}
```

**Confidence:** HIGH — patterns sourced from widely-used tracking_number_data repo with checksum validation removed for format detection only.

## MQTT Configuration for Home Assistant

### Connection Strategy

| Approach | Recommendation | Rationale |
|----------|---------------|-----------|
| Connection persistence | Connect-per-publish | Events are infrequent (delivery only), eliminates state management complexity, aligns with extension lifecycle |
| WebSocket URL | `ws://ha-mosquitto-ws.don` | Per project requirements; no auth |
| QoS level | 1 (at least once) | Delivery guarantees without duplicate complexity of QoS 2 |
| Retain flag | false | Events are instantaneous, not state |

### Payload Format

**Single Delivery Event:**
```typescript
interface MqttDeliveryEvent {
  event_type: 'delivered';     // Required by HA MQTT event entity
  order_id: string;            // Tracking number or order ID
  items: string[];             // Product titles or user label
  vendor: 'fedex' | 'ups' | 'amazon' | 'aliexpress';
  delivered_at: string;        // ISO 8601 timestamp
}
```

**Aggregate Counter (for dashboards):**
```typescript
interface MqttAggregatePayload {
  in_flight: number;           // Currently undelivered packages
  arriving_today: number;      // ETA is today and not delivered
  last_updated: string;        // ISO 8601 timestamp
}
```

### Topic Structure

```
deliveries/event/{vendor}/state     # Individual delivery events
deliveries/aggregate/state          # In-flight/arriving today counts
deliveries/aggregate/attributes     # JSON attributes for HA
```

### MQTT.js Browser-Specific Configuration

```typescript
import mqtt from 'mqtt';

const MQTT_BROKER_URL = 'ws://ha-mosquitto-ws.don';

const options: mqtt.IClientOptions = {
  reconnectPeriod: 0,       // Disable auto-reconnect — we handle via pending queue
  connectTimeout: 5000,     // 5s timeout (default 30s too long for extension)
  qos: 1,                   // At-least-once delivery
  clean: true,              // No session persistence needed
};

// Connection lifecycle
async function publishEvent(event: MqttDeliveryEvent): Promise<void> {
  const client = mqtt.connect(MQTT_BROKER_URL, options);
  
  return new Promise((resolve, reject) => {
    client.on('connect', () => {
      const topic = `deliveries/event/${event.vendor}/state`;
      const payload = JSON.stringify(event);
      
      client.publish(topic, payload, { qos: 1 }, (err) => {
        client.end(); // Close immediately after publish
        err ? reject(err) : resolve();
      });
    });
    
    client.on('error', (err) => {
      client.end();
      reject(err);
    });
    
    // Timeout fallback
    setTimeout(() => {
      client.end();
      reject(new Error('MQTT connection timeout'));
    }, 5000);
  });
}
```

## Context Menu API

### Manifest Permission

```json
{
  "permissions": ["contextMenus"]
}
```

### Implementation Pattern

```typescript
// In background.ts
browser.contextMenus.create({
  id: 'add-tracking-number',
  title: 'Add tracking number "%s"',
  contexts: ['selection'],
  visible: true,
});

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'add-tracking-number' && info.selectionText) {
    const cleaned = info.selectionText.trim().replace(/\s/g, '');
    const carrier = detectCarrier(cleaned);
    
    if (carrier) {
      // Open popup or trigger add flow
      browser.runtime.sendMessage({
        type: 'contextMenu:addTracking',
        trackingNumber: cleaned,
        carrier,
      });
    } else {
      // Show ambiguous/unrecognized notification
      browser.notifications.create({
        type: 'basic',
        title: 'Package Watch',
        message: `Could not identify carrier for "${cleaned}"`,
      });
    }
  }
});
```

**Key consideration:** Context menu items can only access `info.selectionText` — no DOM access. Text must be cleaned (whitespace removed) before format detection.

## WXT Configuration Updates

### Permissions Required

```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    permissions: [
      'alarms',
      'notifications', 
      'storage',
      'tabs',
      'contextMenus',  // NEW: for selected text ingestion
    ],
    host_permissions: [
      '*://www.amazon.ca/*',
      '*://www.aliexpress.com/*',
      '*://www.fedex.com/*',              // NEW: FedEx tracking pages
      '*://wwwapps.ups.com/*',            // NEW: UPS tracking pages
      'ws://ha-mosquitto-ws.don/*',       // NEW: MQTT broker WebSocket
    ],
  },
});
```

## Storage Schema Additions

### FedEx Queue

```typescript
interface FedexQueue {
  entries: Record<string, {
    label: string;
    createdAt: string;           // ISO timestamp
    lastScrapedAt: string | null;
    lastResultStatus: 'success' | 'parse-failure' | 'timeout' | null;
  }>;
}

const FEDEX_QUEUE_KEY = 'local:fedexQueue';
```

### UPS Queue

```typescript
interface UpsQueue {
  entries: Record<string, {
    label: string;
    createdAt: string;
    lastScrapedAt: string | null;
    lastResultStatus: 'success' | 'parse-failure' | 'timeout' | null;
  }>;
}

const UPS_QUEUE_KEY = 'local:upsQueue';
```

### Pending MQTT Events

```typescript
interface PendingMqttEvent {
  orderId: string;
  productTitles: string[];
  vendor: string;
  failedAt: number;  // Timestamp for TTL
}

const PENDING_MQTT_KEY = 'local:pendingMqttDeliveries';
```

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| MQTT Library | mqtt 5.15.0 | Paho MQTT | mqtt.js has better browser bundling, TypeScript-first (v5+), smaller bundle size, wider adoption |
| Carrier Detection | Custom regex | tracking-number npm package | Package adds dependency for static data; patterns are stable and simple enough to inline |
| MQTT Protocol | WebSocket (ws://) | Native TCP | Browser extensions cannot use raw TCP; WebSocket is the only option |
| Connection Strategy | Connect-per-publish | Persistent connection | Persistent connections add complexity for infrequent events; MV2 extension lifecycle makes persistent connections unreliable |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Paho MQTT JavaScript | Larger bundle, poorer TypeScript support, less active maintenance | mqtt.js v5+ |
| Checksum validation for carrier detection | Adds complexity without benefit; user selects carrier if ambiguous | Simple regex pattern matching |
| MQTT QoS 2 | Unnecessary for delivery events; QoS 1 provides sufficient guarantees with less overhead | QoS 1 |
| Persistent MQTT connection | Extension lifecycle makes this unreliable; adds complexity for infrequent events | Connect-per-publish |
| External tracking APIs (FedEx/UPS APIs) | Requires credentials, backend proxy, ToS complexity; out of scope for milestone | DOM scraping from public tracking pages |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| mqtt@5.15.0 | Node >=16, modern browsers | Uses native WebSocket in browsers; no polyfill needed for Chrome 95+ / Firefox latest |
| mqtt@5.x | WXT / Vite | Bundles correctly with esm imports; tree-shakes well |

## Confidence Assessment

| Component | Confidence | Reason |
|-----------|------------|--------|
| MQTT library | HIGH | Official package.json confirms v5.15.0, GitHub releases show active maintenance |
| Carrier patterns | HIGH | Sourced from widely-used tracking_number_data repo with real-world validation |
| Context Menu API | HIGH | Standard WebExtensions API, well-documented in MDN/Chrome docs |
| HA MQTT payload format | MEDIUM | Based on HA community patterns and MQTT event entity docs; may need adjustment during testing |
| UPS DOM scraping | MEDIUM | UPS tracking page structure less documented than FedEx; may need iterative refinement |

## Sources

- [mqtt package.json v5.15.0](https://unpkg.com/browse/mqtt@5.15.0/package.json) — Version verification, browser exports
- [MQTT.js README](https://raw.githubusercontent.com/mqttjs/MQTT.js/main/README.md) — API documentation, browser configuration
- [GitHub jkeen/tracking_number_data](https://github.com/jkeen/tracking_number_data) — Carrier tracking number patterns (FedEx, UPS JSON specs)
- [Chrome contextMenus API docs](https://developer.chrome.com/docs/extensions/reference/api/contextMenus) — Context menu implementation
- [Home Assistant MQTT Eventstream docs](https://home-assistant.io/integrations/mqtt_eventstream) — HA MQTT event format patterns
- [EMQX MQTT WebSocket tutorial](https://www.emqx.com/en/blog/top-3-mqtt-websocket-clients-in-2023) — mqtt.js recommendation confirmation

---
*Stack research for: Package Watch milestone (FedEx + UPS + MQTT)*
*Researched: 2026-02-08*
