# Coding Conventions

**Analysis Date:** 2026-02-08

## Project Overview

This is a **WXT (Web Extension Toolkit)** browser extension built with TypeScript and Vue 3. It monitors Amazon and AliExpress order pages, tracking delivery status and sending browser notifications for order updates.

## Languages

**Primary:** TypeScript 5.9.2 with strict mode enabled
**Secondary:** Vue 3 (Single File Components) for the popup UI

## Naming Patterns

### Files

**Implementation files:**
- TypeScript modules: `kebab-case.ts` (e.g., `define-scraping-script.ts`, `storage.ts`)
- Content scripts: `[site]-[purpose].content.ts` (e.g., `amazon-orders.content.ts`)
- Test files: Co-located with `.test.ts` suffix (e.g., `storage.test.ts`)
- Entry points: Named by WXT convention in `entrypoints/` directory

**Configuration files:**
- `vitest.config.ts`, `wxt.config.ts`, `tsconfig.json`

### Functions

**CamelCase** for all functions:
```typescript
export function updateInFlightBadge(deps: { ... }): Promise<void>
export function buildProductSummary(order: OrderStatus): string
export function getAlarmName(site: OrderSite): string
```

### Variables

**Constants:** UPPER_SNAKE_CASE for constants
```typescript
const DELIVERED_ORDER_RETENTION = Temporal.Duration.from({ days: 7 });
const ALIEXPRESS_ORDERS_URL = 'https://www.aliexpress.com/p/order/index.html';
const NOTIFICATION_ICON_PATH = '/icons/128.png';
const AMAZON_ALARM_NAME = 'scrape-amazon';
```

**Local variables:** camelCase
```typescript
const ordersRecord = { ...stored.orders };
const inFlightCount = Object.values(stored.orders).filter(...);
```

### Types

**Type names:** PascalCase
```typescript
export interface OrderStatus { ... }
export type OrderSite = 'amazon' | 'aliexpress';
export type AliExpressDependencies = { ... };
```

**Type suffixes:**
- Interfaces use no suffix: `OrderStatus`, `StoredOrderState`
- Result types use `Result` suffix: `AliExpressOrderDetailsResult`, `AliExpressTrackingResult`
- Dependency injection types use `Dependencies` suffix: `AliExpressDependencies`

## Code Style

### Formatting

**Tool:** No explicit Prettier or ESLint configuration detected - relies on TypeScript compiler strict mode
**Settings:**
- Target: ESNext
- Module: ESNext
- Module resolution: Bundler
- `strict: true` enabled in `tsconfig.json`

### Import Organization

**Order:**
1. Third-party imports (alphabetical)
2. Internal module imports (relative paths, alphabetical)
3. Type imports grouped together when possible

```typescript
// External
import { storage } from '@wxt-dev/storage';
import { Temporal } from '@js-temporal/polyfill';

// Internal
import type { OrderSite, OrderStatus } from '../types';
import { getSiteLabel } from './scheduler';
```

**Path Aliases:**
- `@/` and `~/` point to project root (`paths` in `tsconfig.json`)
- Used in popup Vue components: `import type { OrderStatus } from '@/lib/types'`
- Internal modules use relative imports: `../lib/storage`, `../types`

### Error Handling

**Strategy:** Return null on expected failures, throw custom errors on unexpected conditions

```typescript
// Return null pattern for expected failures
async function scrapeAliExpressOrderDetails(...): Promise<AliExpressOrderDetailsResult | null> {
  await deps.navigateScrapeTab(tabId, detailsUrl);
  return waitForScrapeResult<AliExpressOrderDetailsResult>(orderId, tabId, deps);
}

// Custom error class for parse failures
export class ParseFailureError extends Error {
  readonly reason?: string;
  readonly url?: string;
  
  constructor(message: string, reason?: string, url?: string) {
    super(message);
    this.name = 'ParseFailureError';
    this.reason = reason;
    this.url = url;
  }
}
```

**Error guards:** Try-catch for browser API calls with graceful degradation
```typescript
async function closeScrapeTab(tabId: number | undefined): Promise<void> {
  if (!tabId) return;
  scrapeTabIds.delete(tabId);
  try {
    await browser.tabs.remove(tabId);
  } catch {
    // Tab might already be closed
  }
}
```

## Logging

**Framework:** Native `console` with prefixed messages

**Pattern:** `[Component/Context] Message` format
```typescript
console.log('[Orders] Background script loaded');
console.log(`[${getSiteLabel(site)}] Scheduling next check in ${intervalMinutes} minutes`);
console.error(`[${getSiteLabel(site)}] Error sending notification:`, e);
console.warn('[AliExpress Orders] Order details result with no pending request');
console.debug('[Scraping] User session, staying inert');
```

## Comments

**When to Comment:**
1. **JSDoc for exported functions** documenting purpose, parameters, and behavior
2. **Inline comments** explaining non-obvious business logic
3. **Section headers** for grouped constants

```typescript
/** Delivered orders are removed from storage after this duration */
const DELIVERED_ORDER_RETENTION = Temporal.Duration.from({ days: 7 });

/**
 * Save order state.
 *
 * Delivered orders are immutable: once an order is marked delivered, its stored
 * state is frozen and will not be overwritten by new scrape data.
 *
 * Cancelled orders are never stored.
 *
 * Expired orders (delivered 7+ days ago, or delivered with missing deliveredAt)
 * are filtered out during writes.
 */
export async function saveOrders(site: OrderSite, orders: OrderStatus[]): Promise<void> { ... }
```

## Function Design

**Size:** Small, focused functions (20-60 lines typical)
**Parameters:** Use dependency injection objects for testability
```typescript
export async function updateInFlightBadge(
  deps: {
    fetchStoredOrders?: (site: OrderSite) => Promise<StoredOrderState>;
    actionApi?: BrowserActionApi;
  } = {}
): Promise<void> { ... }

export type AliExpressDependencies = {
  openOrderListTab: (site: OrderSite, url: string) => Promise<number | null>;
  handleScrapeFailure: (site: OrderSite) => void;
  closeScrapeTab: (tabId: number | undefined) => Promise<void>;
  clearScrapeTimeout: (site: OrderSite) => void;
  processOrdersForSite: (site: OrderSite, orders: OrderStatus[]) => Promise<void>;
  sendAuthFailedNotification: () => Promise<void>;
  navigateScrapeTab: (tabId: number, url: string) => Promise<void>;
};
```

**Return Values:** Always specify return types on exported functions

## Module Design

**Exports:** Named exports for most modules
```typescript
export function getStoredOrders(site: OrderSite): Promise<StoredOrderState>;
export function saveOrders(site: OrderSite, orders: OrderStatus[]): Promise<void>;
export { sendMessage, onMessage } from './messaging';
```

**Barrel Files:** Not used; direct imports from specific modules

**Internal constants:** Module-private when not exported
```typescript
// Private to storage.ts
const ORDER_STATE_KEYS: Record<OrderSite, StorageKey> = {
  amazon: 'local:amazonOrderState',
  aliexpress: 'local:aliexpressOrderState',
};
```

## WXT-Specific Conventions

**Content Scripts:** Use `defineContentScript` or custom `defineScrapingScript` wrapper
```typescript
export function defineScrapingScript(config: ScrapingScriptConfig) {
  const { scrape, ...rest } = config;
  return defineContentScript({
    ...rest,
    async main() { ... }
  });
}
```

**Background Script:** Default export from `entrypoints/background.ts`
```typescript
export default defineBackground(() => {
  console.log('[Orders] Background script loaded');
  // ...
});
```

## TypeScript Strictness

**Compiler flags enabled:**
- `strict: true`
- `forceConsistentCasingInFileNames: true`
- `skipLibCheck: true`

**Type patterns:**
- Use `readonly` arrays: `SUPPORTED_SITES: readonly OrderSite[]`
- Use template literal types for storage keys: `type StorageKey = `local:${string}``
- Use `Record<,>` for maps: `Record<OrderSite, StorageKey>`
- Prefer explicit types over `any`

---

*Convention analysis: 2026-02-08*
