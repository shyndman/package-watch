# Design: use-one-tab

## Current Architecture

### Tab Lifecycle (Current)

```
performAliExpressScrape()
  └─ openOrderListTab() → creates tab
      └─ content script sends ALIEXPRESS_ORDERS_DISCOVERED
          └─ handleAliExpressOrdersDiscovered()
              ├─ closeScrapeTab()  ← closes order list tab
              ├─ scrapeAliExpressOrderDetailsForOrders()
              │   └─ for each order:
              │       └─ openOrderDetailsTab() → creates tab
              │           └─ content script sends ALIEXPRESS_ORDER_DETAILS_SCRAPED
              │               └─ handleAliExpressOrderDetailsMessage()
              │                   └─ closeScrapeTab()  ← closes details tab
              └─ scrapeAliExpressTrackingForOrders()
                  └─ for each active order:
                      └─ openTrackingTab() → creates tab
                          └─ content script sends ALIEXPRESS_TRACKING_SCRAPED
                              └─ handleAliExpressTrackingMessage()
                                  └─ closeScrapeTab()  ← closes tracking tab
```

### Pending Request Tracking (Current)

Two Maps track in-flight requests by tab ID:
- `pendingAliExpressOrderDetails: Map<tabId, PendingOrderDetailsRequest>`
- `pendingAliExpressTracking: Map<tabId, PendingTrackingRequest>`

When a message arrives, the handler looks up the pending request by `sender.tab.id`, resolves the promise, and closes the tab.

## New Architecture

### Tab Lifecycle (New)

```
performAliExpressScrape()
  └─ createScrapeTab() → creates single tab for entire scrape
      └─ navigateToOrderList()
          └─ content script sends ALIEXPRESS_ORDERS_DISCOVERED
              └─ handleAliExpressOrdersDiscovered()
                  ├─ for each order:
                  │   └─ navigateToOrderDetails() → browser.tabs.update()
                  │       └─ content script sends ALIEXPRESS_ORDER_DETAILS_SCRAPED
                  │           └─ handleAliExpressOrderDetailsMessage()
                  │               └─ (no close, resolve promise only)
                  └─ for each active order:
                      └─ navigateToTracking() → browser.tabs.update()
                          └─ content script sends ALIEXPRESS_TRACKING_SCRAPED
                              └─ handleAliExpressTrackingMessage()
                                  └─ (no close, resolve promise only)
      └─ closeScrapeTab() ← closes tab once at end
```

### Pending Request Tracking (New)

Since there's only one tab, we don't need Maps keyed by tab ID. Instead:
- Track the single scrape tab ID
- Track the current pending request (one at a time, since navigation is sequential)

```typescript
type AliExpressScrapeState = {
  tabId: number;
  pendingRequest: {
    type: 'order-list' | 'order-details' | 'tracking';
    expectedOrderId?: string;
    resolve: (result: T) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null;
};
```

## Key Changes

### 1. Dependencies Interface

Remove `openOrderDetailsTab` and `openTrackingTab` from `AliExpressDependencies`. Add:

```typescript
type AliExpressDependencies = {
  // ... existing deps ...
  navigateScrapeTab: (tabId: number, url: string) => Promise<void>;
};
```

### 2. Orchestration Flow

`handleAliExpressOrdersDiscovered` changes from:
- Close order list tab
- Loop: open details tab → wait → close
- Loop: open tracking tab → wait → close

To:
- Keep tab open
- Loop: navigate to details URL → wait
- Loop: navigate to tracking URL → wait
- Close tab at end

### 3. Message Handlers

`handleAliExpressOrderDetailsMessage` and `handleAliExpressTrackingMessage` change:
- Remove `closeScrapeTab()` calls
- Still resolve the pending promise
- Tab closure moves to orchestration layer

### 4. Error Handling

On timeout or parse failure:
- Close the single scrape tab
- Mark scrape as failed
- Same behavior as today, just simpler (one tab to close)

## Alternatives Considered

### Keep Maps, Just Navigate

Could keep the Maps but just navigate instead of create/close. Rejected because:
- Maps keyed by tab ID don't make sense when there's only one tab
- Simpler to have single pending request state

### Pass Tab ID Through Entire Flow

Could pass tabId as parameter through all functions. Rejected because:
- The tab ID is scrape-session scoped state
- Better to encapsulate in the orchestration layer
