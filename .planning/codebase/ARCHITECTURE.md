# Architecture

**Analysis Date:** 2026-02-08

## Pattern Overview

**Overall:** Browser Extension Background-Content Pattern

**Key Characteristics:**
- **WXT Framework**: WebExtension toolkit for cross-browser extension development
- **Manifest V2**: Firefox-only extension (no Chrome/Chromium support needed)
- **Event-driven architecture**: Alarms trigger scraping; message passing coordinates between content scripts and background
- **Separation of concerns**: Content scripts handle DOM scraping; background script orchestrates workflow
- **Dependency injection**: Site-specific handlers receive dependencies for testability

## Layers

**Entrypoints Layer:**
- Purpose: Extension entry points (background script, content scripts, popup UI)
- Location: `entrypoints/`
- Contains: Background service worker, content scripts for site scraping, Vue popup UI
- Depends on: `lib/` modules, browser APIs
- Used by: Browser runtime

**Core Logic Layer:**
- Purpose: Shared utilities and type definitions
- Location: `lib/`
- Contains: Types, storage abstraction, messaging protocol, scraping utilities
- Depends on: `@wxt-dev/storage`, `@webext-core/messaging`, `vue`
- Used by: Entrypoints, background handlers

**Background Orchestration Layer:**
- Purpose: Site-specific scraping workflows and notifications
- Location: `lib/background/`
- Contains: AliExpress scraper, Amazon scraper, scheduler, notifications, badge updater
- Depends on: `lib/types`, `lib/storage`, `lib/messaging`, browser APIs
- Used by: `entrypoints/background.ts`

**UI Layer:**
- Purpose: Popup interface for viewing order status
- Location: `entrypoints/popup/`
- Contains: Vue 3 application with order list display
- Depends on: `lib/storage`, `lib/types`, Vue 3
- Used by: User via browser toolbar icon

## Data Flow

**Order Tracking Scrape Flow:**

1. **Trigger**: `browser.alarms` fires (scheduled by `lib/background/scheduler.ts`)
2. **Background opens tab**: `entrypoints/background.ts:startScrape()` creates hidden tab
3. **Content script activates**: Matching content script in `entrypoints/*.content.ts` loads and checks activation via `scrape:checkActivation` message
4. **DOM scraping**: Content script parses order data from page
5. **Message to background**: Scraped data sent via `sendMessage()` to background
6. **State comparison**: Background compares against stored state (`lib/storage.ts:detectChanges()`)
7. **Notifications**: Changed orders trigger browser notifications with optional sound
8. **Storage update**: New state persisted via `@wxt-dev/storage`
9. **Cleanup**: Scrape tab closed, next check scheduled

**AliExpress Multi-Page Flow:**

1. **Orders page**: `aliexpress-orders.content.ts` discovers order list
2. **Details pages**: Background navigates tab to order details; `aliexpress-order-details.content.ts` extracts product info
3. **Tracking pages**: Background navigates to tracking; `aliexpress-tracking.content.ts` extracts shipment status
4. **Aggregation**: Background combines all data into `OrderStatus` objects

**Popup Data Flow:**

1. **Popup opens**: `entrypoints/popup/App.vue` loads via `main.ts`
2. **Fetch state**: Calls `getStoredOrders()` and `getScrapeStatus()` for each site
3. **Display**: Renders order list sorted by delivery status and date

## Key Abstractions

**Content Script Definition:**
- Purpose: Standardize scraping script creation with activation check
- Location: `lib/define-scraping-script.ts`
- Pattern: Factory function wrapping `defineContentScript` from WXT
- Usage: All scraping content scripts use `defineScrapingScript()` instead of `defineContentScript()` directly

**Messaging Protocol:**
- Purpose: Type-safe communication between content scripts and background
- Location: `lib/messaging.ts`
- Pattern: `defineExtensionMessaging<ProtocolMap>()` from `@webext-core/messaging`
- Messages: `orders:scraped`, `aliexpress:ordersDiscovered`, `scrape:parseFailure`, etc.

**Storage Abstraction:**
- Purpose: Persist order state with TTL for delivered orders
- Location: `lib/storage.ts`
- Pattern: Functions wrapping `@wxt-dev/storage` with migration logic (legacy key support)
- Key feature: Delivered orders expire after 7 days; cancelled orders never stored

**Site Handlers:**
- Purpose: Encapsulate site-specific scraping workflows
- Location: `lib/background/aliexpress.ts`, `lib/background/amazon.ts`
- Pattern: Functions receive dependencies object for testability; orchestrate multi-page navigation

**Parse Failure Handling:**
- Purpose: Structured error handling for DOM parsing failures
- Location: `lib/parse-failure.ts`
- Pattern: `ParseFailureError` class with `isParseFailureError()` type guard
- Behavior: Parse failures trigger user notifications about potential site structure changes

## Entry Points

**Background Script:**
- Location: `entrypoints/background.ts`
- Triggers: `browser.runtime.onInstalled`, `browser.runtime.onStartup`, `browser.alarms.onAlarm`
- Responsibilities:
  - Register message handlers
  - Manage scrape tab lifecycle (`scrapeTabIds` Set tracking)
  - Coordinate site-specific scrapers (Amazon, AliExpress)
  - Handle parse failures and send notifications
  - Update toolbar badge with in-flight order count

**Amazon Orders Content Script:**
- Location: `entrypoints/amazon-orders.content.ts`
- Matches: `*://www.amazon.ca/gp/css/order-history*`, `*://www.amazon.ca/your-orders/*`
- Responsibilities: Parse `.order-card` elements, extract order status/products/dates

**AliExpress Orders Content Script:**
- Location: `entrypoints/aliexpress-orders.content.ts`
- Matches: `*://www.aliexpress.com/p/order/index.html*`
- Responsibilities: Parse order list, detect auth failures, send discovered orders to background

**AliExpress Order Details Content Script:**
- Location: `entrypoints/aliexpress-order-details.content.ts`
- Matches: `*://www.aliexpress.com/p/order/detail.html*`
- Responsibilities: Extract product title and URL from order details page

**AliExpress Tracking Content Script:**
- Location: `entrypoints/aliexpress-tracking.content.ts`
- Matches: `*://www.aliexpress.com/p/tracking/index.html*`
- Responsibilities: Extract tracking status, estimated delivery, delivery flags

**Popup UI:**
- Location: `entrypoints/popup/main.ts`, `entrypoints/popup/App.vue`
- Trigger: User clicks extension toolbar icon
- Responsibilities: Display order list with status, show last check timestamps, link to order details

## Error Handling

**Strategy:** Structured error types with graceful degradation

**Patterns:**
- `ParseFailureError` for DOM parsing issues; sent to background as `scrape:parseFailure` message
- Parse failures notify user that site structure may have changed
- Scrape timeouts (30s) trigger cleanup and rescheduling
- Auth failures (AliExpress) trigger dedicated notification
- All errors logged to console with site context

## Cross-Cutting Concerns

**Logging:** Console logging with `[SiteName]` prefix for traceability; verbose logging in content scripts during scraping

**Tab Management:** Background tracks opened tabs in `scrapeTabIds` Set; ensures only extension-opened tabs are closed

**Scheduling:** Adaptive intervals via `lib/background/scheduler.ts`:
- Default: 30 min (Amazon), 120 min (AliExpress)
- Active: 10 min when delivery expected today during 7AM-10PM

**State Immutability:** Once an order is marked delivered, stored state is frozen and won't be overwritten

---

*Architecture analysis: 2026-02-08*
