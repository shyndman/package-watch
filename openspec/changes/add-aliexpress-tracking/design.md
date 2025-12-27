## Context

The extension currently monitors Amazon.ca orders only. AliExpress has a different page structure, status model, and user expectations:

1. **AliExpress statuses are more granular** - The order list page shows only "Awaiting delivery" or "Completed", but the tracking page shows 15+ distinct statuses (customs, sorting, transit, etc.)
2. **Longer shipping times** - AliExpress packages take weeks, not days, so aggressive polling is wasteful
3. **Users want all status updates** - Unlike Amazon where only delivery matters, users want to know when AliExpress packages clear customs, arrive locally, etc.

## Goals / Non-Goals

**Goals:**
- Track both Amazon and AliExpress orders simultaneously
- Notify on all AliExpress status changes (granular tracking)
- Play sound on delivery (same as Amazon)
- Efficient polling: 2 hours default, 10 min when delivery expected today
- Detect and notify when logged out of AliExpress

**Non-Goals:**
- Generic "add any site" plugin architecture (YAGNI)
- Tracking other sites (for now)
- Changing Amazon behavior

## Decisions

### Two-Phase AliExpress Scraping

The order list page (`/p/order/index.html`) only shows high-level status ("Awaiting delivery"), but users want granular updates. The tracking page (`/p/tracking/index.html?tradeOrderId={id}`) shows full status history.

**Approach:** Content script on order list discovers orders → Background opens tracking pages for non-completed orders → Tracking content scripts send granular status → Background merges and compares.

**Alternative considered:** Only scrape order list page. Rejected because it would miss all intermediate status changes that users want.

### Site-Namespaced Storage

Each site gets its own storage key (`local:amazonOrderState`, `local:aliexpressOrderState`) rather than a single combined store.

**Rationale:**
- Simpler change detection per site
- No migration needed for existing Amazon data
- Independent scrape cycles won't overwrite each other

### Separate Alarms Per Site

Create `scrape-amazon` and `scrape-aliexpress` alarms instead of modifying the single existing alarm.

**Rationale:**
- Different polling intervals (30min vs 2hr default)
- Independent scheduling based on each site's pending deliveries
- Cleaner code separation

### Notification Behavior

| Site | When to notify | Sound |
|------|----------------|-------|
| Amazon | Status changes | On delivery only |
| AliExpress | All status changes | On delivery only |

Both sites play the notification sound when an order transitions to delivered.

## Risks / Trade-offs

**Risk:** AliExpress DOM changes break scraping
- **Mitigation:** Defensive parsing (null checks, try/catch per order), clear error logging

**Risk:** Opening many tracking tabs simultaneously overloads browser
- **Mitigation:** Process tracking pages sequentially, not in parallel

**Trade-off:** Two-phase scraping means more page loads
- **Accepted:** Necessary for granular status, mitigated by 2-hour default interval

## DOM Selectors

### Order List Page (`/p/order/index.html`)

**Container Structure:**
```
.order-wrap                         // Main wrapper
  .order-item                       // Individual order card (multiple)
```

**Order Card Elements:**

| Data | Selector | Extraction |
|------|----------|------------|
| Status | `.order-item-header-status-text` | `.textContent` → "Awaiting delivery" or "Completed" |
| Order ID | `.order-item-header-right-info` | `.textContent.match(/Order ID:\s*(\d+)/)[1]` |
| Order Date | `.order-item-header-right-info` | `.textContent.match(/Order date:\s*([^O]+)/)[1].trim()` |
| Store Name | `a[href*="/store/"]` | `.textContent.trim()` |
| Product Titles | `a[href*="/item/"]` | `.textContent.trim()` (multiple) |
| Track URL | `a[href*="/tracking/"]` | `.href` (contains `tradeOrderId`) |

**Auth Failure Detection:**
- Logged in: `.order-item` elements exist (count > 0)
- Logged out: Zero `.order-item` elements AND no "Hi, {name}" greeting

### Tracking Page (`/p/tracking/index.html?tradeOrderId={id}`)

**Key Elements:**

| Data | Selector | Extraction |
|------|----------|------------|
| Order ID | URL param | `new URLSearchParams(location.search).get('tradeOrderId')` |
| Header Status | `[class*="arrival-time-v2--title"]` | `.textContent` → "Delivered：Dec. 24" or "Estimated delivery: Dec 27 - 28" |
| Is Delivered | Header text | `.includes('Delivered')` |
| Estimated Delivery | Header text | `.match(/Estimated delivery:\s*([^,]+)/)?.[1]` |
| Timeline Nodes | `[class*="logistic-info-v2--node--"]` | Multiple elements, first is current status |

**Timeline Node Structure** (each `[class*="logistic-info-v2--node--"]`):

| Data | Selector (within node) | Example |
|------|------------------------|---------|
| Status Title | `[class*="nodeTitle"]` | "Delivered", "Picked up by carrier" |
| Description(s) | `[class*="nodeDesc"]` | "Package delivered. It has been left at..." |
| Timestamp | `[class*="nodeTime"]` | "Dec 24, 11:59 EST" |

**Note:** Tracking page classes have hash suffixes (e.g., `logistic-info-v2--nodeTitle--2rejjVx`) that may change. Use `[class*="..."]` partial matching.

### Observed Status Values

**Order List (High-Level):**
- `"Awaiting delivery"` - Shipped, not yet delivered
- `"Completed"` - Delivered and confirmed

**Tracking Page (Granular):**
1. "Your order has been successfully created"
2. "Your package is currently being prepared"
3. "Picked up by carrier"
4. "In transit" / "Package received by sorting center of origin"
5. "Package left sorting center of origin"
6. "Awaiting flight"
7. "Your package arrived at airport. Awaiting transit."
8. "Package leaving origin country/region"
9. "Import customs clearance started"
10. "Your package arrived at local airport"
11. "Import customs clearance completed"
12. "Your package will soon be handed over to the domestic courier company"
13. "Package arrived at regional carrier facility"
14. "Delivered"

## Implementation Details

### Page Load Waiting

Both content scripts use the same polling pattern as Amazon:

```typescript
const MAX_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 500;

async function waitForElement(selector: string): Promise<Element | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT_MS) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}
```

- **Order list page:** Wait for `.order-item` elements
- **Tracking page:** Wait for `[class*="arrival-time-v2--title"]` element

### Message Types

Add to `lib/types.ts`:

```typescript
// Discovered orders from order list page (phase 1)
| { type: 'ALIEXPRESS_ORDERS_DISCOVERED'; orders: AliExpressDiscoveredOrder[] }
// Tracking details from tracking page (phase 2)
| { type: 'ALIEXPRESS_TRACKING_SCRAPED'; tracking: AliExpressTrackingResult }
// Auth failure detected
| { type: 'ALIEXPRESS_AUTH_FAILED' }

interface AliExpressDiscoveredOrder {
  orderId: string;
  highLevelStatus: 'Awaiting delivery' | 'Completed';
  orderDate: string;           // ISO date string
  storeName: string;
  productTitles: string[];
  trackingUrl: string | null;  // null for completed orders
}

interface AliExpressTrackingResult {
  orderId: string;
  currentStatus: string;       // e.g., "Picked up by carrier"
  statusDetail: string;        // e.g., "Package arrived at regional carrier facility"
  isDelivered: boolean;
  estimatedDelivery: string | null;  // e.g., "Dec 27 - 28"
  timestamp: string;           // e.g., "Dec 26, 17:58 EST"
}
```

### Two-Phase Scrape Flow

```
1. Background creates alarm "scrape-aliexpress"
2. Alarm fires → performAliExpressScrape()
3. Open tab: /p/order/index.html
4. Content script sends ALIEXPRESS_ORDERS_DISCOVERED
   - If zero orders + no greeting → send ALIEXPRESS_AUTH_FAILED instead
5. Background receives discovered orders, closes tab
6. For each order where highLevelStatus !== 'Completed':
   a. Open tab: /p/tracking/index.html?tradeOrderId={orderId}
   b. Wait for ALIEXPRESS_TRACKING_SCRAPED message
   c. Close tab
   d. Merge tracking into order data
7. After all tracking pages processed:
   a. Build final OrderStatus[] array
   b. Call detectChanges(orders, 'aliexpress')
   c. Send notifications for changed orders
   d. Save to storage
   e. Schedule next check
```

**Timeout handling:** Each tab has a 30-second timeout. If no message received, close tab and continue with next order.

### Estimated Delivery Parsing

Format: `"Dec 27 - 28"` or `"Dec 27"`

```typescript
function parseEstimatedDelivery(text: string | null): { isExpectedToday: boolean } {
  if (!text) return { isExpectedToday: false };

  // Extract first date from range: "Dec 27 - 28" → "Dec 27"
  const match = text.match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (!match) return { isExpectedToday: false };

  const [, monthAbbr, day] = match;
  const monthMap: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  const now = new Date();
  const deliveryDate = new Date(now.getFullYear(), monthMap[monthAbbr], parseInt(day));

  // Handle year rollover (if delivery month < current month, assume next year)
  if (deliveryDate.getMonth() < now.getMonth() - 1) {
    deliveryDate.setFullYear(now.getFullYear() + 1);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { isExpectedToday: deliveryDate.getTime() === today.getTime() };
}
```

### Storage Schema

Same shape as Amazon, different key:

```typescript
// Key: 'local:aliexpressOrderState'
interface StoredOrderState {
  orders: Record<string, OrderStatus>;  // keyed by orderId
  lastChecked: number;                  // timestamp
}
```

The `OrderStatus` interface is shared, but AliExpress orders will have:
- `site: 'aliexpress'` (new field)
- `status`: granular status from tracking page (not high-level)
- `orderUrl`: tracking page URL (not order details)

### Constants

```typescript
// In background.ts
const ALIEXPRESS_ALARM_NAME = 'scrape-aliexpress';
const ALIEXPRESS_ORDERS_URL = 'https://www.aliexpress.com/p/order/index.html';
const ALIEXPRESS_DEFAULT_INTERVAL_MINUTES = 120;  // 2 hours
const ALIEXPRESS_ACTIVE_INTERVAL_MINUTES = 10;
const SCRAPE_TIMEOUT_MS = 30000;
```

### Parse Failure Notification

When order list parsing returns zero orders but page loaded successfully (not auth failure):

```typescript
if (orders.length === 0 && !isAuthFailure) {
  await browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'AliExpress parsing may be broken',
    message: 'No orders found. The page structure may have changed.',
  });
}
```

## Open Questions

None - all decisions made during browser exploration session.
