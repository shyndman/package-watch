# Change: Gate Content Script Activations

## Why

Content scripts currently execute immediately on any matching URL, including user-opened tabs. This causes the extension to hijack user browsing sessions—for example, when a user manually navigates to an AliExpress order page, the background script receives scrape data and navigates the user's tab to other pages in the scrape sequence.

The root cause is that content scripts have no awareness of whether they're running in a background-controlled scrape tab or a user-initiated browsing session. This lack of clear state distinction leads to bugs and race conditions.

## What Changes

- **New activation pattern**: Content scripts become inert by default. On load, they ask the background "did you expect me?" via `@webext-core/messaging`. Only if background confirms the tab is a tracked scrape tab does the content script proceed.
- **New `defineScrapingScript` wrapper**: Replaces `defineContentScript` for all scraping content scripts. Bakes in the activation check so individual scripts don't repeat boilerplate.
- **Simplified tab tracking**: The existing per-site `Map<OrderSite, Set<number>>` becomes a single `Set<number>` since the activation check only needs to know "is this tab ours?"
- **Remove defensive checks**: Background message handlers no longer need to verify tab ownership—messages only arrive from activated tabs.

## Impact

- Affected specs: `order-tracking` (new requirement for activation pattern)
- Affected code:
  - `lib/scrape-activation.ts` (new)
  - `lib/define-scraping-script.ts` (new)
  - `entrypoints/background.ts` (register handler, simplify tab tracking)
  - `entrypoints/amazon-orders.content.ts` (migrate to `defineScrapingScript`)
  - `entrypoints/aliexpress-orders.content.ts` (migrate)
  - `entrypoints/aliexpress-order-details.content.ts` (migrate)
  - `entrypoints/aliexpress-tracking.content.ts` (migrate)
