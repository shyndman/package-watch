# Testing Patterns

**Analysis Date:** 2026-02-08

## Test Framework

**Runner:** Vitest 4.0.16
**Config:** `vitest.config.ts`
**Environment:** happy-dom for DOM testing

**Setup File:** `vitest.setup.ts` - polyfills the Temporal API for Node.js
```typescript
import { Temporal } from '@js-temporal/polyfill';
globalThis.Temporal = Temporal;
```

**Run Commands:**
```bash
pnpm test              # Run all tests (equivalent to "vitest")
pnpm test run          # Run tests once (non-watch mode)
```

**Config:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest(), vue()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

## Test File Organization

**Location:** Co-located with source files (same directory)

**Naming:** `[filename].test.ts`
```
lib/
  storage.ts           →  storage.test.ts
  define-scraping-script.ts  →  define-scraping-script.test.ts
  background/
    aliexpress.ts      →  aliexpress.test.ts
    badge.ts           →  badge.test.ts
entrypoints/popup/
  App.vue              →  App.test.ts
lib/
  background-status.test.ts   # Tests entrypoints/background.ts
  stub.test.ts                # Minimal stub test
```

## Test Structure

**Suite Organization:**
```typescript
describe('Feature Name', () => {
  describe('specific behavior', () => {
    it('does something specific', async () => {
      // Arrange
      const input = makeTestData();
      
      // Act
      const result = await functionUnderTest(input);
      
      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

**Example from `lib/storage.test.ts`:**
```typescript
describe('saveOrders', () => {
  describe('deliveredAt stamping', () => {
    it('stamps deliveredAt when order transitions to delivered', async () => {
      // Test code
    });
  });

  describe('expiration filtering', () => {
    it('removes orders delivered more than 7 days ago', async () => {
      // Test code
    });
  });
});
```

**Lifecycle hooks:**
```typescript
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});
```

## Mocking

**Framework:** Vitest built-in mocking (`vi.fn`, `vi.spyOn`, `vi.doMock`, `vi.mock`)

### Mocking Module Dependencies

**Pattern for mocking storage:**
```typescript
const makeStorageStub = () => {
  const store = new Map<string, unknown>();
  return {
    storage: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      _store: store,        // Exposed for test inspection
      _dump: () => store,   // Alternative accessor
    },
  };
};

// Usage in test
const storageStub = makeStorageStub();
vi.doMock('@wxt-dev/storage', () => storageStub);

// Dynamic import to apply mock
const { saveOrders, getStoredOrders } = await import('./storage');
```

### Mocking WXT Browser APIs

**Pattern using fakeBrowser:**
```typescript
import { fakeBrowser } from 'wxt/testing';

beforeEach(async () => {
  fakeBrowser.reset();
  fakeBrowser.tabs.create = vi.fn(async () => ({ id: 1 }));
  fakeBrowser.tabs.remove = vi.fn(async () => undefined);
});

// Trigger alarms
await fakeBrowser.alarms.onAlarm.trigger({ name: 'scrape-amazon' });

// Trigger messages
await fakeBrowser.runtime.onMessage.trigger(message, { tab: { id: 1 } });
```

### Mocking Function Dependencies

**Pattern for dependency injection testing:**
```typescript
const deps = {
  openOrderListTab: vi.fn(),
  handleScrapeFailure: vi.fn(),
  closeScrapeTab: vi.fn(),
  clearScrapeTimeout: vi.fn(),
  processOrdersForSite: vi.fn(),
  sendAuthFailedNotification: vi.fn(),
  navigateScrapeTab: vi.fn(),
};

// Assert on mock calls
expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(1);
expect(deps.navigateScrapeTab).toHaveBeenCalledWith(tabId, expectedUrl);
```

### Spying on Console Methods

```typescript
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
// or
const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

expect(consoleSpy).toHaveBeenCalledWith('Expected message');
```

### Spying on Module Functions

```typescript
import * as messaging from './messaging';

let mockSendMessage: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockSendMessage = vi.spyOn(messaging, 'sendMessage');
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

## Fixtures and Factories

**Factory functions for test data:**
```typescript
// Order factory with defaults and overrides
const makeOrder = (overrides: Partial<OrderStatus> = {}): OrderStatus => ({
  site: 'amazon',
  orderId: 'order-1',
  status: 'Shipped',
  statusDetail: '',
  productTitles: ['Test Product'],
  productUrls: ['https://example.com/product'],
  orderUrl: 'https://example.com/order',
  orderDate: '2025-01-01',
  isDeliveryExpectedToday: false,
  isDelivered: false,
  deliveredAt: null,
  ...overrides,
});

// AliExpress-specific factories
const makeOrder = (orderId: string, completed = false): AliExpressDiscoveredOrder => ({
  orderId,
  highLevelStatus: completed ? 'Completed' : 'Awaiting delivery',
  orderDate: '2025-01-01',
  storeName: 'Test Store',
  orderDetailsUrl: `https://www.aliexpress.com/p/order/detail.html?orderId=${orderId}`,
  trackingUrl: completed
    ? null
    : `https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=${orderId}`,
});

const makeDetails = (orderId: string): AliExpressOrderDetailsResult => ({
  orderId,
  productTitle: `Product ${orderId}`,
  productUrl: `https://www.aliexpress.com/item/${orderId}.html`,
});
```

**Scrape status factory:**
```typescript
const makeScrapeStatus = (overrides?: Partial<{ 
  lastAlarmFiredAt: number | null; 
  isScrapeInProgress: boolean 
}>) => ({
  lastAlarmFiredAt: null,
  isScrapeInProgress: false,
  ...overrides,
});
```

**Stored orders factory:**
```typescript
const makeStoredOrders = (
  orders: Array<{ isDelivered: boolean; orderDate?: string | null; deliveredAt?: string | null }>
) => ({
  orders: Object.fromEntries(
    orders.map((order, index) => [
      String(index),
      {
        site: 'amazon' as const,
        orderId: `order-${index}`,
        status: 'Processing',
        // ... other fields
        isDelivered: order.isDelivered,
        deliveredAt: order.deliveredAt ?? null,
      },
    ])
  ),
  lastChecked: 0,
});
```

## Test Types

### Unit Tests

**Pure function testing:**
```typescript
describe('formatInFlightBadgeText', () => {
  it('clears badge when count is 0', () => {
    expect(formatInFlightBadgeText(0)).toBe('');
  });

  it('shows count when between 1 and 99', () => {
    expect(formatInFlightBadgeText(5)).toBe('5');
    expect(formatInFlightBadgeText(99)).toBe('99');
  });

  it('caps badge at 99+', () => {
    expect(formatInFlightBadgeText(120)).toBe('99+');
  });
});
```

### Integration Tests

**Background script integration:**
```typescript
describe('background scrape status', () => {
  it('logs and records scrape status on alarm fire', async () => {
    // Setup mocks for all dependencies
    // Trigger alarm
    // Verify storage was updated
    // Verify console was logged
  });
});
```

**DOM component testing:**
```typescript
// @vitest-environment happy-dom
describe('popup status display', () => {
  it('shows -- when no last alarm fired timestamp is stored', async () => {
    // Mock storage module
    // Mount Vue app to DOM
    // Assert on rendered output
    const timeLabels = Array.from(root.querySelectorAll('.site-stat-time'));
    timeLabels.forEach((node) => expect(node.textContent).toBe('--'));
  });
});
```

### Async Testing Patterns

**Flushing promises:**
```typescript
const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

// Usage
await flushPromises();
```

**Waiting for async operations:**
```typescript
const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);
await flushPromises();
// ... interact with mock
await scrapePromise;  // Wait for completion
```

## Vue Component Testing

**Environment declaration:**
```typescript
// @vitest-environment happy-dom
```

**Mounting pattern:**
```typescript
const mountApp = async () => {
  const { default: App } = await import('./App.vue');
  const { createApp, nextTick } = await import('vue');

  const root = document.createElement('div');
  document.body.appendChild(root);

  const app = createApp(App);
  app.mount(root);

  await flushPromises();
  await nextTick();

  return { app, root };
};
```

**DOM cleanup:**
```typescript
afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});
```

## Common Patterns

### Testing with Temporal API

```typescript
// Use Temporal for date/time calculations
const eightDaysAgo = Temporal.Now.instant().subtract({ hours: 8 * 24 }).toString();
```

### Testing State Transitions

```typescript
it('stamps deliveredAt when order transitions to delivered', async () => {
  // First save: order is not delivered
  await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: false })]);

  // Second save: order is now delivered
  await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: true })]);

  const stored = await getStoredOrders('amazon');
  expect(stored.orders['order-1'].deliveredAt).not.toBeNull();
  expect(stored.orders['order-1'].isDelivered).toBe(true);
});
```

### Testing Module Reloads

```typescript
beforeEach(() => {
  vi.resetModules();  // Clear module cache
});

// Dynamic import required to apply mocks
const { saveOrders, getStoredOrders } = await import('./storage');
```

### Partial Module Mocking

```typescript
vi.doMock('../lib/background/scheduler', async () => {
  const actual = await vi.importActual<typeof import('../lib/background/scheduler')>(
    '../lib/background/scheduler'
  );
  return {
    ...actual,
    scheduleNextCheck: scheduleNextCheckSpy,
  };
});
```

## Message Testing

**Creating messages for @webext-core/messaging:**
```typescript
let messageId = 0;
const createMessage = <T>(type: string, data: T) => ({
  type,
  data,
  timestamp: Date.now(),
  id: ++messageId,
});

// Usage
await fakeBrowser.runtime.onMessage.trigger(
  createMessage('orders:scraped', { site: 'amazon', orders: [...] }),
  { tab: { id: 1 } }
);
```

## Coverage

**Status:** No explicit coverage target configured
**View Coverage:** `pnpm test run --coverage` (if coverage provider configured)

## Testing Philosophy

1. **Mock at module boundaries** - Use `vi.doMock` for external dependencies like `@wxt-dev/storage`
2. **Inject dependencies** - Pass mock functions as dependencies rather than mocking internal functions
3. **Use factory functions** - Create `makeXxx()` helpers for consistent test data
4. **Reset between tests** - Always use `vi.resetModules()` and `vi.clearAllMocks()`
5. **Test behaviors, not implementation** - Focus on "it stamps deliveredAt" not "it calls setItem"

---

*Testing analysis: 2026-02-08*
