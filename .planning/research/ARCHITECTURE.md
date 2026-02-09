# Architecture Research: Carrier Expansion + Home Assistant Integration

**Domain:** Browser Extension (WXT + WebExtensions API)  
**Researched:** 2026-02-08  
**Confidence:** HIGH

## Executive Summary

This milestone extends Package Watch from e-commerce order scraping (Amazon/AliExpress) to carrier-direct tracking (FedEx/UPS) with Home Assistant MQTT integration. The architecture must bridge two fundamentally different data sources while maintaining the existing reliability patterns.

**Key architectural insight:** Carrier tracking (FedEx/UPS) requires a new "intake" pattern—user-provided tracking numbers with manual labeling—distinct from the existing "discovery" pattern where orders are scraped from authenticated sessions. The system needs a unified pipeline that normalizes both patterns into `OrderStatus` objects for consistent change detection, notifications, and MQTT publishing.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTENSION ENTRY POINTS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Background     │  │  Content        │  │  Popup UI       │             │
│  │  (Service       │  │  Scripts        │  │  (Vue 3)        │             │
│  │   Worker)       │  │                 │  │                 │             │
│  └────────┬────────┘  └─────────────────┘  └─────────────────┘             │
├───────────┼─────────────────────────────────────────────────────────────────┤
│           ↓                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATION LAYER                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Amazon     │  │  AliExpress │  │  FedEx      │  │  UPS        │ │   │
│  │  │  Handler    │  │  Handler    │  │  Handler    │  │  Handler    │ │   │
│  │  └─────────────┘  └─────────────┘  └──────┬──────┘  └──────┬──────┘ │   │
│  │                                           │                │        │   │
│  │  ┌─────────────┐  ┌─────────────┐        │                │        │   │
│  │  │  Scheduler  │  │  Change     │◄───────┴────────────────┘        │   │
│  │  │  (Alarms)   │  │  Detection  │   (Unified normalization)         │   │
│  │  └─────────────┘  └──────┬──────┘                                    │   │
│  │                          │                                          │   │
│  │  ┌─────────────┐  ┌──────┴──────┐  ┌─────────────┐                  │   │
│  │  │  MQTT       │  │  Notification│  │  Badge      │                  │   │
│  │  │  Publisher  │  │  Service    │  │  Updater    │                  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                           INTAKE / INGESTION                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Context Menu   │  │  Popup Form     │  │  Carrier        │             │
│  │  (selected text)│  │  (manual add)   │  │  Auto-Detect    │             │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘             │
│           │                    │                                           │
│           └────────────────────┴──► Tracking Queue (Storage)               │
├─────────────────────────────────────────────────────────────────────────────┤
│                           DATA LAYER                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Order State    │  │  Scrape Status  │  │  MQTT Pending   │             │
│  │  (per-site)     │  │  (per-site)     │  │  Queue (new)    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Boundaries

### 1. Existing Components (Unchanged Core)

| Component | Responsibility | Boundary Contract |
|-----------|----------------|-------------------|
| `Background Script` | Alarm handling, message routing, tab lifecycle | Entry point only; delegates to handlers |
| `Amazon Handler` | Single-page order list scraping | Returns `OrderStatus[]` to change detector |
| `AliExpress Handler` | Multi-page orchestration (orders → details → tracking) | Returns `OrderStatus[]` to change detector |
| `Change Detection` | Compare new vs stored orders, identify changes | Pure function: `(OrderStatus[], stored) → changed[]` |
| `Storage` | Persist order state with TTL, scrape metadata | Per-site isolated storage keys |
| `Notifications` | Browser notifications for changed orders | Triggered by change detection output |
| `Badge Updater` | Toolbar badge showing in-flight count | Reads from stored order state |

### 2. New Components (This Milestone)

| Component | Responsibility | Boundary Contract |
|-----------|----------------|-------------------|
| **FedEx Handler** | Scrape fedex.com tracking pages sequentially | Returns `OrderStatus[]` (normalized) |
| **UPS Handler** | Scrape ups.com tracking pages sequentially | Returns `OrderStatus[]` (normalized) |
| **Tracking Queue** | Manage user-provided tracking numbers | Queue storage with CRUD operations |
| **Carrier Auto-Detect** | Identify carrier from tracking number format | Returns `carrier: 'fedex' \| 'ups' \| null` |
| **Intake Form** | Shared UI for manual tracking number entry | Validates, auto-detects, submits to queue |
| **Context Menu** | Right-click "Add Tracking Number" flow | Extracts selected text, opens popup pre-filled |
| **MQTT Publisher** | Publish delivery events + aggregate counts | Connect-per-publish, retry with TTL |
| **Label Editor** | Inline editing for carrier tracking labels | Updates queue storage, triggers refresh |

### 3. Component Interaction Rules

```
┌────────────────────────────────────────────────────────────────┐
│                    DATA FLOW PRINCIPLES                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. HANDLERS → CHANGE DETECTOR (unified interface)             │
│     All site handlers (Amazon, AliExpress, FedEx, UPS)          │
│     normalize to OrderStatus[] before change detection          │
│                                                                 │
│  2. CHANGE DETECTOR → SIDE EFFECTS (parallel)                  │
     Changed orders trigger:                                      │
│     - Browser notifications (existing)                          │
│     - MQTT event publishing (new)                               │
│     - Badge update (existing)                                   │
│                                                                 │
│  3. INTAKE → QUEUE → HANDLERS (async decoupling)               │
│     Context menu / form write to queue storage                  │
│     Handlers read from queue on scheduled scrape                │
│                                                                 │
│  4. MQTT PUBLISHER (stateless, idempotent)                     │
│     Connect → Publish pending + new → Disconnect                │
│     Failed events stored with TTL, retried next cycle           │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

## Data Flows

### Flow 1: Carrier Intake (New)

```
User selects text on page
         ↓
[Context Menu] ──► [Background: contextMenus.onClicked]
         ↓
[Parse selected text] ──► [Auto-detect carrier]
         ↓
[Open popup with pre-filled data]
         ↓
[User confirms/edits in popup form]
         ↓
[Submit to background: addTrackingNumber]
         ↓
[Validate + dedupe] ──► [Write to storage: trackingQueue]
         ↓
[Update popup state] ◄── [broadcast: queueUpdated]
```

### Flow 2: FedEx/UPS Scraping (New)

```
[Alarm fires] ──► [startScrape('fedex')]
         ↓
[FedEx Handler: read trackingQueue]
         ↓
[Open hidden tab] ──► [Navigate to fedex.com/fedextrack/?trknbr=N]
         ↓
[Content Script: poll for DOM readiness]
         ↓
[Extract status, detail, ETA, delivered flag]
         ↓
[Message to background: fedex:trackingResult]
         ↓
[Normalize to OrderStatus]
   - orderId = trackingNumber
   - productTitles[0] = user label || trackingNumber
   - productUrls[0] = fedex tracking deep-link
         ↓
[Navigate to next tracking number] ──► (repeat until queue exhausted)
         ↓
[Close tab] ──► [Return OrderStatus[] to change detector]
```

### Flow 3: Unified Change Detection → MQTT (New)

```
[Changed orders detected]
         ↓
[For each changed order:]
   ├─► [isDelivered && !wasDelivered]?
   │       ├─► [Queue MQTT delivery event]
   │       └─► [Send browser notification]
   └─► [Any status change]
           └─► [Update badge count]
         ↓
[Calculate aggregate counts]
   ├─► inFlightCount = orders.filter(o => !o.isDelivered).length
   └─► arrivingTodayCount = orders.filter(o => o.isDeliveryExpectedToday && !o.isDelivered).length
         ↓
[MQTT Publisher: connect to ws://ha-mosquitto-ws.don]
   ├─► Publish pending events (with retry TTL check)
   ├─► Publish new delivery events
   └─► Publish aggregate counts to topic: package-watch/aggregates/state
         ↓
[Disconnect] ──► [Save failed events to pending queue]
```

## Recommended Project Structure

```
entrypoints/
├── background.ts                    # Existing: message routing, alarm handling
├── amazon-orders.content.ts         # Existing
├── aliexpress-*.content.ts          # Existing (3 files)
├── fedex-tracking.content.ts        # NEW: FedEx DOM scraper
├── ups-tracking.content.ts          # NEW: UPS DOM scraper
├── popup/                           # Existing Vue app
│   ├── App.vue                      # MODIFIED: Add FedEx/UPS sections
│   ├── components/                  # NEW folder
│   │   ├── TrackingIntakeForm.vue   # NEW: Shared FedEx/UPS form
│   │   ├── CarrierOrderCard.vue     # NEW: FedEx/UPS card with label editing
│   │   └── LabelEditor.vue          # NEW: Inline label edit component
│   └── ...
└── context-menu.ts                  # NEW: Context menu registration

lib/
├── types.ts                         # MODIFIED: Add OrderSite values, new types
├── storage.ts                       # MODIFIED: Add tracking queue functions
├── messaging.ts                     # MODIFIED: Add new message types
├── carrier-detection.ts             # NEW: Tracking number → carrier mapping
├── mqtt-client.ts                   # NEW: MQTT publish with retry logic
├── background/
│   ├── scheduler.ts                 # MODIFIED: Add FedEx/UPS alarm constants
│   ├── notifications.ts             # Existing (reused)
│   ├── badge.ts                     # Existing (reused)
│   ├── amazon.ts                    # Existing
│   ├── aliexpress.ts                # Existing
│   ├── fedex.ts                     # NEW: FedEx scraping orchestration
│   └── ups.ts                       # NEW: UPS scraping orchestration
└── popup/
    └── tracking-form.ts             # NEW: Form validation, submission helpers
```

## Architecture Patterns

### Pattern 1: Normalized Order Interface

**What:** All data sources (e-commerce scrapes, carrier scrapes, manual intake) normalize to a common `OrderStatus` interface before processing.

**Why:** Enables unified change detection, notifications, and MQTT publishing without per-source branching.

**Implementation:**
```typescript
// Carrier handlers map tracking results to OrderStatus
function normalizeFedexToOrderStatus(
  result: FedexTrackingResult,
  label: string | undefined
): OrderStatus {
  return {
    site: 'fedex',
    orderId: result.trackingNumber,
    status: result.status,
    statusDetail: result.statusDetail,
    productTitles: [label || result.trackingNumber],
    productUrls: [fedexDeepLink(result.trackingNumber)],
    orderUrl: fedexDeepLink(result.trackingNumber),
    orderDate: null, // Not available from carrier
    isDeliveryExpectedToday: isToday(result.estimatedDelivery),
    isDelivered: result.delivered,
    deliveredAt: null, // Set by storage layer on first detection
  };
}
```

### Pattern 2: Queue-Based Intake

**What:** User-provided tracking numbers live in a queue separate from scraped order state. Handlers consume from this queue during scheduled scrapes.

**Why:** Decouples intake UX (immediate feedback) from scrape lifecycle (batched, rate-limited). Enables resume after crashes.

**Storage Schema:**
```typescript
interface TrackingQueueEntry {
  trackingNumber: string;
  carrier: 'fedex' | 'ups';
  label: string;
  createdAt: string;
  lastScrapedAt: string | null;
  lastResultStatus: 'success' | 'parse-failure' | 'timeout' | null;
}

interface TrackingQueue {
  entries: Record<string, TrackingQueueEntry>; // key = trackingNumber
}
```

### Pattern 3: Stateless MQTT Publishing

**What:** Open connection, publish all pending events, disconnect immediately. Failed events stored with TTL for retry.

**Why:** Browser extensions have aggressive suspension; persistent connections are unreliable. Infrequent events (deliveries) don't need connection pooling.

**Implementation:**
```typescript
async function publishMqttEvents(events: MqttEvent[]): Promise<void> {
  const client = mqtt.connect('ws://ha-mosquitto-ws.don', {
    reconnectPeriod: 0, // No auto-reconnect
    connectTimeout: 5000,
  });

  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('error', reject);
  });

  const failed: MqttEvent[] = [];
  for (const event of events) {
    try {
      await client.publishAsync(event.topic, JSON.stringify(event.payload));
    } catch {
      if (!isExpired(event)) failed.push(event);
    }
  }

  await savePendingMqttEvents(failed);
  client.end();
}
```

### Pattern 4: Shared Intake with Auto-Detection

**What:** Single form handles both FedEx and UPS, automatically detecting carrier from tracking number format.

**Why:** Reduces UI complexity; users don't need to know carrier selection UX.

**Detection Logic:**
```typescript
function detectCarrier(trackingNumber: string): 'fedex' | 'ups' | null {
  const clean = trackingNumber.replace(/\s/g, '');
  
  // FedEx: 12-22 digits, often starts with specific ranges
  if (/^\d{12,22}$/.test(clean)) {
    // Additional heuristics for ambiguous ranges
    return 'fedex';
  }
  
  // UPS: 1Z followed by 16 alphanumeric
  if (/^1Z[\dA-Z]{16}$/i.test(clean)) {
    return 'ups';
  }
  
  return null;
}
```

**Ambiguity Handling:** When format matches both (rare), show carrier selector in form rather than guessing.

## Build Order and Dependency Graph

### Phase 1: Foundation (Required by all)

```
┌─────────────────────────────────────────────────────────────┐
│  1.1 Type Extensions (lib/types.ts)                         │
│      ├─ Add 'fedex' | 'ups' to OrderSite                    │
│      ├─ Add TrackingQueueEntry interface                    │
│      └─ Add MqttEvent types                                 │
│                                                             │
│  1.2 Storage Extensions (lib/storage.ts)                    │
│      ├─ Add tracking queue CRUD functions                   │
│      ├─ Add MQTT pending queue functions                    │
│      └─ No breaking changes to existing keys                │
│                                                             │
│  1.3 Messaging Extensions (lib/messaging.ts)                │
│      ├─ Add fedex/ups message types                         │
│      ├─ Add context menu messages                           │
│      └─ Add label update messages                           │
└─────────────────────────────────────────────────────────────┘
                     ↓
```

### Phase 2: Carrier Infrastructure (Parallelizable)

```
┌─────────────────────────────────────────────────────────────┐
│  2.1 Carrier Detection (lib/carrier-detection.ts)           │
│      └─ Independent utility, no dependencies                │
└─────────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐  ┌─────────────────────────────────────────────────────────────┐
│  2.2 FedEx Scraper                                          │  │  2.3 UPS Scraper                                            │
│      ├─ entrypoints/fedex-tracking.content.ts               │  │      ├─ entrypoints/ups-tracking.content.ts                 │
│      ├─ lib/background/fedex.ts                             │  │      ├─ lib/background/ups.ts                               │
│      └─ Depends on: 1.1, 1.2, 1.3, 2.1                      │  │      └─ Depends on: 1.1, 1.2, 1.3, 2.1                      │
└─────────────────────────────────────────────────────────────┘  └─────────────────────────────────────────────────────────────┘
                     ↓                                                    ↓
```

### Phase 3: Intake UX (Depends on Phase 1-2)

```
┌─────────────────────────────────────────────────────────────┐
│  3.1 Context Menu (entrypoints/context-menu.ts)             │
│      ├─ Depends on: 1.2, 2.1                                │
│      └─ Registers browser.contextMenus                      │
│                                                             │
│  3.2 Popup Intake Form (popup/components/)                  │
│      ├─ TrackingIntakeForm.vue                              │
│      ├─ Depends on: 2.1 (auto-detection)                    │
│      └─ Depends on: 1.2 (queue storage)                     │
│                                                             │
│  3.3 Label Editor (popup/components/LabelEditor.vue)        │
│      └─ Depends on: 1.2, 1.3                                │
└─────────────────────────────────────────────────────────────┘
                     ↓
```

### Phase 4: MQTT Integration (Depends on Phase 1-2)

```
┌─────────────────────────────────────────────────────────────┐
│  4.1 MQTT Client (lib/mqtt-client.ts)                       │
│      ├─ Depends on: 1.2 (pending queue)                     │
│      └─ New dependency: mqtt library                        │
│                                                             │
│  4.2 MQTT Publisher Integration                             │
│      ├─ Modify change detection output handler              │
│      ├─ Add aggregate count calculation                     │
│      └─ Depends on: 4.1, existing notification flow         │
│                                                             │
│  4.3 Configuration (wxt.config.ts)                          │
│      └─ Add WebSocket host permission                       │
└─────────────────────────────────────────────────────────────┘
                     ↓
```

### Phase 5: Scheduler Integration (Final Assembly)

```
┌─────────────────────────────────────────────────────────────┐
│  5.1 Scheduler Updates (lib/background/scheduler.ts)        │
│      ├─ Add FedEx/UPS alarm names                           │
│      ├─ Add default intervals (match AliExpress: 120min)    │
│      └─ Depends on: all previous phases                     │
│                                                             │
│  5.2 Background Wiring (entrypoints/background.ts)          │
│      ├─ Register FedEx/UPS handlers                         │
│      ├─ Wire MQTT publisher to change detection             │
│      └─ Wire context menu handler                           │
└─────────────────────────────────────────────────────────────┘
```

### Critical Path Analysis

**Longest dependency chain:**
```
Types (1.1) → Storage (1.2) → Messaging (1.3) → FedEx Scraper (2.2) → 
Popup Form (3.2) → Scheduler Integration (5.1)
```

**Parallel work streams:**
1. **Infrastructure:** Types → Storage → Messaging → Carrier Detection
2. **FedEx Track:** (parallel to UPS) Content script + Background handler
3. **UPS Track:** (parallel to FedEx) Content script + Background handler
4. **Intake UX:** Context Menu + Popup Form (blocked by carrier detection)
5. **MQTT:** Client + Publisher + Config (blocked by storage, independent of scrapers)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Parallel Scrape Tabs

**What:** Opening separate tabs for each tracking number simultaneously.

**Why it's wrong:** Violates the existing single-tab pattern; increases bot detection risk; complicates error recovery.

**Instead:** Sequential queue processing in one hidden tab (AliExpress pattern).

### Anti-Pattern 2: Per-Carrier Storage Keys

**What:** Separate storage keys for `fedexQueue`, `upsQueue`, `fedexOrders`, `upsOrders`.

**Why it's wrong:** Duplicates logic; harder to query "all tracked packages"; inconsistent with unified OrderStatus interface.

**Instead:** Single `trackingQueue` key with carrier field; reuse existing per-site order state storage with normalized orders.

### Anti-Pattern 3: Persistent MQTT Connection

**What:** Keeping WebSocket open between scrape cycles.

**Why it's wrong:** Browser extensions get suspended; connection drops unpredictably; requires complex reconnect logic.

**Instead:** Connect-per-publish pattern; simpler, more reliable for low-frequency events.

### Anti-Pattern 4: Separate Change Detection for Carriers

**What:** Writing custom change detection for FedEx/UPS outside the existing `detectChanges()` function.

**Why it's wrong:** Duplicates immutability logic, TTL handling, and edge cases already solved.

**Instead:** Normalize to `OrderStatus` first, then use shared `detectChanges()`.

## Scalability Considerations

| Concern | Current Scale | Future Scale | Mitigation |
|---------|---------------|--------------|------------|
| **Queue Size** | ~10-20 tracking numbers | 100+ numbers | Add queue pagination in UI; warn on large queues |
| **Scrape Duration** | ~30s per number | Queue takes >5min | Parallelize to 2-3 tabs max; add progress indicator |
| **MQTT Payload Size** | ~1KB per event | Many items per order | Cap items array; use references for large orders |
| **Storage Growth** | ~100 orders, 7-day TTL | Years of history | Archive old orders; add export/cleanup UX |

## Integration Points

### External: FedEx Website

| Aspect | Detail |
|--------|--------|
| URL Pattern | `https://www.fedex.com/fedextrack/?trknbr={number}` |
| Scraping Strategy | DOM polling for `data-testid` attributes |
| Rate Limiting | Respect existing 120min default interval |
| Failure Mode | Parse failure notification; manual link provided |

### External: UPS Website

| Aspect | Detail |
|--------|--------|
| URL Pattern | `https://www.ups.com/track?tracknum={number}` |
| Scraping Strategy | Similar DOM polling (investigate selectors) |
| Rate Limiting | Match FedEx: 120min default interval |
| Failure Mode | Same as FedEx |

### External: MQTT Broker

| Aspect | Detail |
|--------|--------|
| URL | `ws://ha-mosquitto-ws.don` |
| Protocol | MQTT over WebSocket |
| Topics | `package-watch/deliveries/{site}/state`, `package-watch/aggregates/state` |
| QoS | 0 (at-most-once) acceptable for events; retry via pending queue |
| Auth | None (trusted network) |

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DOM selectors break | High (carrier sites change) | Medium | Parse failure notifications; rapid update cycle |
| Carrier blocks scraping | Medium | High | Single tab reduces bot signals; manual fallback links |
| MQTT broker unreachable | Low | Low | Pending queue with TTL; no blocking on publish |
| Tracking number ambiguity | Low | Medium | Research format overlaps; show selector when uncertain |
| Queue grows unbounded | Low | Medium | UI warnings; documentation guidance |

## Sources

- Existing codebase: `entrypoints/background.ts`, `lib/background/`, `lib/types.ts`
- FedEx design: `openspec/changes/add-fedex-tracking/design.md`
- MQTT design: `openspec/changes/add-mqtt-delivery-events/design.md`
- WXT documentation: https://wxt.dev
- MQTT.js: https://github.com/mqttjs/MQTT.js

---

*Architecture research for Carrier Expansion + HA Integration milestone*  
*Researched: 2026-02-08*
