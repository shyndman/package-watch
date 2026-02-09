# External Integrations

**Analysis Date:** 2026-02-08

## APIs & External Services

**E-commerce Platforms (Scraped):**
- **Amazon Canada** (`https://www.amazon.ca`)
  - Pages scraped:
    - Order history: `/gp/css/order-history`
    - Order details: `/gp/css/order-details?orderID={id}`
    - Your orders: `/your-orders/`
  - Content script: `entrypoints/amazon-orders.content.ts`
  - Background handler: `lib/background/amazon.ts`

- **AliExpress** (`https://www.aliexpress.com`)
  - Pages scraped:
    - Order list: `/p/order/index.html`
    - Order details: `/p/order/detail.html?orderId={id}`
    - Tracking: `/p/tracking/index.html?tradeOrderId={id}`
  - Content scripts:
    - `entrypoints/aliexpress-orders.content.ts` (order list)
    - `entrypoints/aliexpress-order-details.content.ts` (order details)
    - `entrypoints/aliexpress-tracking.content.ts` (tracking info)
  - Background handler: `lib/background/aliexpress.ts`

## Data Storage

**Databases:**
- None (external) - Uses browser extension storage only

**Extension Storage:**
- **@wxt-dev/storage** - Promise-based wrapper around `browser.storage`
- **Storage keys:**
  - `local:amazonOrderState` - Amazon order data
  - `local:aliexpressOrderState` - AliExpress order data
  - `local:amazonScrapeStatus` - Amazon scrape metadata
  - `local:aliexpressScrapeStatus` - AliExpress scrape metadata
  - `local:orderState` (legacy, migrated to per-site keys)

**Data Retention:**
- Delivered orders expire after 7 days (`DELIVERED_ORDER_RETENTION` in `lib/storage.ts`)
- Cancelled orders are never stored
- Orders marked delivered become immutable

**File Storage:**
- Local filesystem: Notification sound at `assets/notification.mp3`
- Extension icons: Auto-generated via `@wxt-dev/auto-icons`

**Caching:**
- None beyond browser storage API

## Authentication & Identity

**Auth Provider:**
- None built-in - Relies on user's existing sessions on Amazon/AliExpress

**Session Handling:**
- AliExpress: Detects login page redirects and "greeting" token absence
- Auth failure notification sent when user not logged in
- No automatic login or credential management

## Monitoring & Observability

**Error Tracking:**
- Console logging only (no external error tracking service)
- Log format: `[{SiteName}] {message}`

**Parse Failure Detection:**
- Monitors for DOM structure changes on target sites
- Sends browser notifications when parsing fails
- Tracks parse failures per-site to avoid duplicate notifications

**Logs:**
- `console.log` for normal operations
- `console.error` for errors and parse failures
- `console.warn` for timeouts and auth issues

## CI/CD & Deployment

**Hosting:**
- Chrome Web Store (not yet published)
- Firefox Add-ons (AMO) (not yet published)

**CI Pipeline:**
- Not configured

**Build Commands:**
```bash
pnpm build          # Chrome build
pnpm build:firefox  # Firefox build
pnpm zip            # Chrome package
pnpm zip:firefox    # Firefox package
pnpm xpi:firefox    # Firefox .xpi file
```

## Environment Configuration

**Required env vars:**
- None - Extension has no external API keys or secrets

**Configuration location:**
- All configuration in `wxt.config.ts`
- No `.env` files detected

## Webhooks & Callbacks

**Incoming:**
- `browser.alarms.onAlarm` - Scheduled scraping triggers
- `browser.notifications.onClicked` - User clicks notification
- `browser.runtime.onInstalled` - Extension installation/setup
- `browser.runtime.onStartup` - Browser startup

**Outgoing:**
- `browser.tabs.create` - Open scraping tabs
- `browser.tabs.update` - Navigate scraping tabs
- `browser.tabs.remove` - Close scraping tabs
- `browser.alarms.create` - Schedule next check
- `browser.notifications.create` - Status change alerts

## Cross-Origin Communication

**Internal Messaging Protocol:**
- **Library:** `@webext-core/messaging` with typed protocol
- **Protocol definition:** `lib/messaging.ts`
- **Message types:**
  - `scrape:checkActivation` - Verify tab should scrape
  - `orders:scraped` - Amazon orders data
  - `aliexpress:ordersDiscovered` - AliExpress order list
  - `aliexpress:orderDetails` - AliExpress order details
  - `aliexpress:tracking` - AliExpress tracking data
  - `aliexpress:authFailed` - Session expired
  - `scrape:parseFailure` - DOM parsing failed
  - `scrape:error` - Generic scrape error
  - `scrape:trigger` - Manual scrape request from popup

---

*Integration audit: 2026-02-08*
