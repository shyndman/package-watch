# Tasks: display-order-list

## 1. Visual Foundation

- [ ] 1.1 In `style.css`, replace the `body` background gradient with solid `#e1b07f`
- [ ] 1.2 Set popup max-height to 480px and min-width to 320px on `body` or `.popup`

## 2. Compact Header

- [ ] 2.1 In `App.vue` template, replace the `<header>` block with:
  - A single `<h1>` containing "Order Status"
  - A `<div>` containing inline site stats
- [ ] 2.2 Create the inline stats row showing both sites side-by-side:
  - Format: `Amazon: {count} · {timestamp}    AliExpress: {count} · {timestamp}`
  - Use flexbox with `justify-content: space-between` or gap
- [ ] 2.3 Format timestamp as ISO8601 without seconds: `YYYY-MM-DDTHH:mm`
  - Use `toISOString().slice(0, 16)` or Temporal formatting
- [ ] 2.4 When `lastAlarmFiredAt` is null, display `--` instead of timestamp
- [ ] 2.5 Add in-progress pill next to site name when `isScrapeInProgress` is true
  - Reuse existing `.status-pill` class

## 3. Order List Data

- [ ] 3.1 In `App.vue`, add a computed/ref for combined orders array:
  - Call `getStoredOrders('amazon')` and `getStoredOrders('aliexpress')`
  - Flatten `Object.values(orders)` from both into single array
- [ ] 3.2 Sort the combined array:
  - Non-delivered orders first, sorted by `orderDate` descending (nulls last)
  - Delivered orders second, sorted by `deliveredAt` descending (nulls last)
  - Use `Array.sort()` with a comparator that checks `isDelivered` first, then date

## 4. Order Card UI

- [ ] 4.1 Create order card markup in template (inside a `v-for` over orders):
  ```html
  <article class="order-card">
    <div class="order-header">
      <span class="site-badge">{{ order.site }}</span>
      <span class="product-title">{{ productDisplay(order) }}</span>
      <a :href="order.orderUrl" target="_blank" class="order-link">↗</a>
    </div>
    <div class="order-status">
      {{ order.status }}{{ order.statusDetail ? ' · ' + order.statusDetail : '' }}
    </div>
  </article>
  ```
- [ ] 4.2 Create `productDisplay(order)` function:
  - If 1 product: return `order.productTitles[0]`
  - If multiple: return `order.productTitles[0] + ' +' + (order.productTitles.length - 1) + ' more'`
- [ ] 4.3 Style `.order-card`:
  - Background: `var(--card)` (existing white/translucent)
  - Border-radius: `var(--radius-lg)` (existing)
  - Padding: `var(--space-sm)` or similar
  - Margin-bottom for spacing between cards
- [ ] 4.4 Style `.site-badge`:
  - Small pill, similar to existing `.status-pill`
  - Same style for both Amazon and AliExpress (no per-site colors)
- [ ] 4.5 Style `.order-link`:
  - Right-aligned in header row
  - No underline, subtle color
  - `target="_blank"` already in markup for new tab

## 5. Scrollable List Container

- [ ] 5.1 Wrap the order list in a container with:
  - `overflow-y: auto`
  - `flex: 1` to fill remaining space below header
- [ ] 5.2 Ensure `.popup` uses flexbox column layout so header stays fixed at top

## 6. Polish

- [ ] 6.1 Add `.order-card.delivered` class with `opacity: 0.6`
  - Apply via `:class="{ delivered: order.isDelivered }"`
- [ ] 6.2 Add empty state: when orders array is empty, show "No orders being tracked"
- [ ] 6.3 Remove from template:
  - The `<section class="site-grid">` and its `<article class="site-card">` children
  - The `<footer>` element
- [ ] 6.4 Remove from `style.css`:
  - `.site-grid`, `.site-card`, `.site-header`, `.site-name`
  - `.meta-row`, `.meta-label`, `.meta-value`
  - `.footer`
  - `.eyebrow`, `.subtle` (if no longer used)
