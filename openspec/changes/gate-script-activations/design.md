# Design: Gate Content Script Activations

## Context

The extension uses content scripts to scrape order data from e-commerce sites. Currently, content scripts execute their scrape logic immediately when loaded on any matching URL. The background script tracks which tabs it opened for scraping and avoids closing user tabs, but it cannot prevent content scripts from sending scrape data from user-opened tabs.

This has caused a bug where manually navigating to an AliExpress order page triggers the scrape flow, hijacking the user's tab.

## Goals / Non-Goals

**Goals:**
- Content scripts are inert by default on user-opened tabs
- Background script controls when scraping activates
- Reusable pattern via `defineScrapingScript` wrapper
- Clean message-based activation using `@webext-core/messaging`

**Non-Goals:**
- Changing any scrape logic or parsing behavior
- Adding new sites or features
- Backwards compatibility with old activation model

## Decisions

### Decision: Use `@webext-core/messaging` directly, not `@webext-core/proxy-service`

**Rationale:** The proxy-service abstraction doesn't expose `sender.tab.id` to service methods. Since the activation check needs to know which tab is asking, we need direct access to the message sender. The underlying messaging library provides this via `ExtensionMessage.sender`.

**Alternative considered:** Using proxy-service with a separate `GET_TAB_ID` message. Rejected as unnecessarily complex.

### Decision: Content script initiates activation check (pull model)

**Rationale:** The content script asks "am I active?" rather than background pushing an activation message. This is simpler because:
1. Background doesn't need to know when content scripts load
2. No race condition between tab creation and content script registration
3. The tab ID is available in `sender.tab.id` on the background side

**Alternative considered:** Background sends activation message after creating tab. Rejected because it requires waiting for content script to be ready, adding complexity.

### Decision: Single `Set<number>` for tab tracking

**Rationale:** The activation check only asks "is this tab ours?" not "which site is this tab for?" Site-specific logic belongs in scrape orchestration, not tab tracking.

**Alternative considered:** Keep per-site `Map<OrderSite, Set<number>>`. Rejected as unnecessary complexity for activation.

## Architecture

### Messaging Protocol

```typescript
// lib/scrape-activation.ts
import { defineExtensionMessaging } from '@webext-core/messaging';

interface ProtocolMap {
  'scrape:checkActivation': () => boolean;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
```

### Background Handler

```typescript
// entrypoints/background.ts
import { onMessage } from '../lib/scrape-activation';

const scrapeTabIds = new Set<number>();

export default defineBackground(() => {
  // Register synchronously at top
  onMessage('scrape:checkActivation', ({ sender }) => {
    const tabId = sender.tab?.id;
    return tabId !== undefined && scrapeTabIds.has(tabId);
  });

  // ... rest of background
});
```

### Scraping Script Wrapper

```typescript
// lib/define-scraping-script.ts
import { sendMessage } from './scrape-activation';

type ContentScriptConfig = Parameters<typeof defineContentScript>[0];

type ScrapingScriptConfig = Omit<ContentScriptConfig, 'main'> & {
  scrape: () => void | Promise<void>;
};

export function defineScrapingScript(config: ScrapingScriptConfig) {
  const { scrape, ...rest } = config;

  return defineContentScript({
    ...rest,
    async main() {
      const isActive = await sendMessage('scrape:checkActivation', undefined);
      if (!isActive) {
        console.debug('[Scraping] User session, staying inert');
        return;
      }

      await scrape();
    },
  });
}
```

### Content Script Migration

Before:
```typescript
export default defineContentScript({
  matches: ['*://www.aliexpress.com/p/order/index.html*'],

  async main() {
    // scrape logic
  },
});
```

After:
```typescript
export default defineScrapingScript({
  matches: ['*://www.aliexpress.com/p/order/index.html*'],

  async scrape() {
    // same scrape logic, unchanged
  },
});
```

## Risks / Trade-offs

**Risk:** If activation message fails, content script stays inert even for scrape tabs.
**Mitigation:** The activation check is simple IPC—failures indicate serious extension problems. Let it fail visibly rather than swallowing errors.

**Trade-off:** Slight overhead from activation message on every content script load.
**Acceptable because:** One async message per page load is negligible compared to DOM parsing.

## Migration Plan

1. Install `@webext-core/messaging` dependency, remove `@webext-core/proxy-service`
2. Create `lib/scrape-activation.ts` with messaging protocol
3. Create `lib/define-scraping-script.ts` wrapper
4. Update `background.ts`: register handler, simplify tab tracking
5. Migrate each content script to `defineScrapingScript`
6. Remove redundant tab ownership checks from message handlers

No rollback needed—this is a clean replacement with no user-visible behavior change (except fixing the bug).

## Open Questions

None.
