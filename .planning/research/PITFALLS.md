# Domain Pitfalls

**Domain:** Browser Extension for Package Tracking with Carrier Scraping + MQTT Home Assistant Integration
**Researched:** 2026-02-08
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Tracking Number Format Ambiguity

**What goes wrong:**
FedEx and UPS tracking number formats overlap in certain ranges. A 12-digit numeric tracking number could be either FedEx or UPS (UPS has rare 12-digit formats). Auto-detection by regex alone produces false positives, leading to packages tracked on the wrong carrier site or "not found" errors.

**Why it happens:**
- FedEx: 12, 15, 20, 22 digits (mostly numeric)
- UPS: Primarily 1Z + 16 alphanumeric, but also 12-digit numeric legacy formats
- Developers often implement naive regex that only checks digit count, ignoring UPS's alphanumeric primary format
- The milestone requirement says "Research/validate ambiguous tracking-number overlaps before finalizing fallback behavior" — this is the exact trap

**How to avoid:**
1. Implement confidence scoring, not binary detection
2. Check for 1Z prefix first (definitive UPS identifier)
3. For 12-15 digit numbers, show disambiguation UI with both options
4. Store carrier override capability in queue entries
5. Validate against known-invalid checksums (UPS uses MOD 10, FedEx uses MOD 11)

**Warning signs:**
- "Tracking number not found" errors on correct numbers
- Users manually switching carriers frequently
- Support requests about packages showing wrong carrier

**Phase to address:**
Phase 1 (FedEx/UPS Manual Add Form) — Must validate ambiguity handling before locking in detection logic

---

### Pitfall 2: Context Menu Async Handler Port Closure

**What goes wrong:**
Context menu click handlers that perform async operations (validation, storage writes) fail silently because the message port closes before the async work completes. The tracking number never gets added, and no error is shown to the user.

**Why it happens:**
- `browser.menus.onClicked` handlers must return `true` to keep the message channel open for async responses
- Without `return true`, the handler function returns `undefined`, and the port closes immediately
- This is a well-documented but frequently missed requirement in browser extension development

**How to avoid:**
```typescript
// WRONG
browser.menus.onClicked.addListener(async (info, tab) => {
  await addTrackingNumber(info.selectionText);
  // Port already closed, response lost
});

// CORRECT
browser.menus.onClicked.addListener((info, tab) => {
  addTrackingNumber(info.selectionText); // Fire-and-forget with internal error handling
  return true; // Keep channel open (if you need to sendResponse)
});
```
Better yet: Don't rely on sendResponse at all; use storage change listeners or message passing to popup.

**Warning signs:**
- Context menu works intermittently
- No console errors but tracking numbers don't appear
- Works when breakpoint is set (timing changes)

**Phase to address:**
Phase 1 (Context Menu Flow) — Must implement with proper async handling from the start

---

### Pitfall 3: DOM Selector Drift on Carrier Sites

**What goes wrong:**
FedEx and UPS consumer tracking pages use generated CSS class names (e.g., `[class*="logistic-info-v2--node--"]`) that change with every deployment. Scraping breaks without warning, causing parse failures and user notifications about site changes.

**Why it happens:**
- Modern SPAs use CSS-in-JS or scoped CSS with hash suffixes
- FedEx's tracking page is a React/Vue SPA with dynamic class names
- The existing AliExpress scraper already hits this with `[class*="logistic-info-v2--node--"]`
- No automated tests catch these changes; they only surface in production

**How to avoid:**
1. Use semantic `data-testid` attributes where available (FedEx uses these per design.md research)
2. Implement multi-strategy fallback: try `data-testid` → semantic selectors → XPath → text content
3. Add schema guards: if expected fields missing, throw `ParseFailureError` immediately
4. Include raw HTML snapshot in parse failure telemetry (first 1KB only, no PII)
5. Design selectors to fail gracefully: check for existence before accessing properties

**Warning signs:**
- Parse failure notifications spike after deploys
- "undefined" appearing in status fields
- Scraping works for some tracking numbers but not others (A/B tests)

**Phase to address:**
Phase 1 (FedEx Scraping Implementation) — Must build selector resilience from day one

---

### Pitfall 4: Akamai Anti-Bot Blocking

**What goes wrong:**
FedEx and UPS both use Akamai Bot Manager. Rapid sequential requests from the same browser session trigger 403/"Pardon Our Interruption" pages, breaking scraping for hours or days.

**Why it happens:**
- Akamai fingerprinting detects headless/automated patterns
- Single-tab sequential navigation with consistent timing looks bot-like
- No rate limiting between tracking number checks triggers velocity rules
- FedEx's public tracking page specifically has anti-scraping measures per their ToS

**How to avoid:**
1. **Respect rate limits**: Minimum 5-10 seconds between carrier page navigations
2. **Jitter delays**: Add random 1-3 second variance to navigation timing
3. **Single tab persistence**: Reuse the same tab (already in design), but add human-like pauses
4. **Backoff on blocks**: If 403 detected, back off for 1 hour before retry
5. **User-agent consistency**: Don't spoof UA; use browser's real UA
6. **Consider ToS**: Document that scraping is against FedEx/UPS ToS; provide "Open in Browser" fallback

**Warning signs:**
- 403 errors in background console
- "Access Denied" or validation pages instead of tracking results
- Scraping fails consistently for all tracking numbers
- Works from user's normal browsing but not from extension tab

**Phase to address:**
Phase 1 (FedEx Scraping Implementation) — Rate limiting must be implemented before any scraping

---

### Pitfall 5: MQTT Event Payload Format Mismatch

**What goes wrong:**
Home Assistant MQTT Event entities expect a specific payload structure. Sending the wrong format (missing `event_type`, wrong nesting) results in silent failures — events don't appear in HA automations, and debugging is difficult.

**Why it happens:**
- HA MQTT Event requires: `{ "event_type": "delivered", ...attributes }`
- Event types must be pre-declared in `configuration.yaml`
- Many developers send flat payloads or use `state` instead of `event_type`
- No error feedback from HA when payload format is wrong

**How to avoid:**
```json
// CORRECT payload for MQTT Event entity
{
  "event_type": "delivered",
  "items": ["Product Name 1", "Product Name 2"],
  "vendor": "fedex",
  "tracking_number": "123456789012"
}
```
1. Strict payload validation before publish
2. Include `event_type` as top-level required field
3. Pre-configure HA `configuration.yaml` with expected event types
4. Log payload at INFO level for debugging
5. Test with `mosquitto_pub` or HA Developer Tools before implementing

**Warning signs:**
- MQTT broker shows messages arriving (use `mosquitto_sub`)
- HA entity shows "Unknown" or old timestamp
- Automations don't trigger on delivery events

**Phase to address:**
Phase 2 (MQTT Integration) — Must validate payload format against HA before shipping

---

### Pitfall 6: Duplicate Event Storm on Retry

**What goes wrong:**
Without deduplication, the same delivery event gets published to MQTT multiple times — on initial detection, on retry after transient failure, and after browser restart. HA automations fire repeatedly for the same package.

**Why it happens:**
- MQTT events are stateless; HA tracks only last timestamp, not event uniqueness
- Pending queue retry logic doesn't check if event was already processed
- Extension restart replays pending queue
- No idempotency key in MQTT publish

**How to avoid:**
1. Add `eventId` field: `orderId + timestamp + random` 
2. Track "already published" status in order storage
3. Clear pending queue entries after successful publish + HA acknowledgment
4. Use MQTT QoS 1 with proper acknowledgment handling
5. Implement idempotency window: don't re-publish events older than 5 minutes

**Warning signs:**
- HA automation triggers multiple times for same delivery
- Doorbell/announcements fire repeatedly
- MQTT broker shows duplicate messages

**Phase to address:**
Phase 2 (MQTT Integration) — Deduplication must be part of initial implementation

---

### Pitfall 7: Sequential Scraping Cascade Failure

**What goes wrong:**
AliExpress already navigates 2N+1 pages for N orders. Adding FedEx/UPS with sequential single-tab scraping means any timeout or navigation error aborts the entire scrape, losing progress on all remaining tracking numbers.

**Why it happens:**
- Current architecture: one tab, sequential operations
- Any navigation timeout throws, caught by outer try/catch
- No checkpoint/resume capability
- All sites share the same scrape session

**How to avoid:**
1. **Per-carrier isolation**: Each carrier scrapes independently; failure in FedEx doesn't stop Amazon/AliExpress
2. **Checkpoint progress**: Store `lastProcessedTrackingNumber` after each success
3. **Resume from checkpoint**: On next alarm, start from failed item, not beginning
4. **Partial success acceptance**: Process what succeeded, schedule retry for failures
5. **Separate alarms per carrier**: Different intervals, independent scheduling

**Warning signs:**
- One slow/failed tracking number stops all updates
- Scrape status shows "failed" but some carriers had success
- Long-running scrapes that never complete

**Phase to address:**
Phase 1 (FedEx/UPS Implementation) — Carrier isolation must be designed in from the start

---

### Pitfall 8: Context Menu Permission Scope Creep

**What goes wrong:**
Context menu items appear on all pages (`contexts: ["all"]`) and the `menus` permission isn't declared, causing the menu to not appear or extension to fail review.

**Why it happens:**
- Missing `menus` (or `contextMenus`) permission in manifest
- Overly broad `contexts` makes menu appear everywhere (including chrome:// pages where it doesn't work)
- `documentUrlPatterns` not set, so menu shows on all sites including non-carrier pages

**How to avoid:**
```json
// manifest.json additions
{
  "permissions": ["menus"],
  "host_permissions": ["*://*.fedex.com/*", "*://*.ups.com/*"]
}
```
```typescript
// Restrict to relevant contexts
browser.menus.create({
  id: "add-tracking",
  title: "Add tracking number",
  contexts: ["selection"],
  documentUrlPatterns: ["*://*/*"] // Only where text selection makes sense
});
```

**Warning signs:**
- Menu doesn't appear on right-click
- Extension fails AMO/CWS review for permission justification
- Menu appears on images/pages where it doesn't make sense

**Phase to address:**
Phase 1 (Context Menu Flow) — Permissions must be declared correctly in manifest

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single regex for all carriers | Faster detection implementation | False positives when formats overlap | Only in MVP with explicit disambiguation UI planned |
| Hard-coded DOM selectors | Works today against current site | Breaks on next site deploy | Never — use data-testid or multi-strategy fallbacks |
| No rate limiting between requests | Faster scrape completion | Akamai blocks, broken scraping for hours | Never — implement minimum 5s delays |
| Fire-and-forget MQTT publish | Simpler code | Lost events, no retry, silent failures | Never — use pending queue pattern |
| Flat MQTT payload | Easier to construct | HA ignores events, automations don't trigger | Never — follow HA MQTT Event spec exactly |
| Shared scrape session across carriers | Less code duplication | One failure kills all carriers | Never — isolate per-carrier scraping |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| FedEx public tracking | Trying to parse JSON API responses | Scrape DOM only — API requires auth/keys that are against ToS to use without approval |
| UPS tracking | Assuming 1Z prefix for all | Support legacy numeric formats, but 1Z is definitive UPS |
| MQTT.js in browser | Using `mqtt.connect('tcp://...')` | Use WebSocket `ws://` or `wss://` — browsers can't do raw TCP MQTT |
| Home Assistant MQTT | Sending state updates to event topic | Use `event_type` field, not `state`; pre-declare event_types in HA config |
| Browser storage | Storing pending events without TTL | Add 24h TTL to pending queue; stale events aren't useful |
| Context menus | Creating menus outside `runtime.onInstalled` | Always create in `runtime.onInstalled` listener for MV3/non-persistent BG |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Queue growth without limits | Scrape takes minutes, UI unresponsive | Cap queue at 50 tracking numbers, warn user | >20 tracking numbers |
| Synchronous storage writes | Popup freezes on add/delete | Use async storage APIs, optimistic UI updates | Any user interaction |
| No pagination in popup | 100+ orders = slow render | Virtual scrolling or pagination in popup | >50 active orders |
| Memory leak in notification URL map | Extension memory grows over time | Add TTL/max-size eviction to `notificationUrlMap` | Long-running browser sessions |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging tracking numbers at INFO | PII exposure in browser console | Log at DEBUG only; sanitize in production builds |
| No CSP headers | XSS risk if content script is compromised | Add strict CSP in manifest |
| Broad host permissions for carriers | Unnecessary access to all FedEx/UPS pages | Narrow to tracking-specific paths only |
| Trusting DOM content without sanitization | XSS via malicious tracking page content | TextContent only, never innerHTML from scraped data |
| MQTT without TLS on public networks | Credential sniffing (if auth added later) | Use `wss://` even on LAN; document for user setup |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No feedback after context menu click | User doesn't know if tracking was added | Show toast notification or badge update |
| Auto-detect without confirmation | Wrong carrier selected, tracking fails | Show disambiguation dialog for ambiguous formats |
| "Add tracking" on non-tracking text | Menu clutter, accidental adds | Validate selection looks like tracking number before showing menu |
| Silent MQTT failures | Automations don't work, no error shown | Show MQTT connection status in popup, log errors |
| No "View on FedEx/UPS" fallback | Users stuck when scraping blocked | Always provide direct tracking URL link |

## "Looks Done But Isn't" Checklist

- [ ] **Carrier auto-detection:** Often missing ambiguity handling — verify disambiguation UI exists for 12-digit numbers
- [ ] **Context menu:** Often missing error feedback — verify toast/notification on add failure
- [ ] **FedEx scraping:** Often missing rate limiting — verify 5+ second delays between requests
- [ ] **MQTT publishing:** Often missing deduplication — verify same event doesn't publish twice
- [ ] **MQTT payload:** Often missing `event_type` field — verify HA receives and recognizes events
- [ ] **Error handling:** Often missing carrier isolation — verify FedEx failure doesn't stop Amazon checks
- [ ] **DOM selectors:** Often missing fallbacks — verify scraping works when `data-testid` changes
- [ ] **Storage:** Often missing TTL — verify pending events expire after 24h

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Tracking number format misdetection | LOW | Allow user to edit carrier in popup; re-scrape on carrier change |
| Context menu async failure | LOW | Add retry logic with exponential backoff; surface errors in popup |
| DOM selector breakage | MEDIUM | Emergency patch to add new selectors; fallback to "Open in Browser" |
| Akamai block | HIGH | Back off for 1 hour; implement proxy rotation (if ToS allows); manual fallback |
| MQTT broker unreachable | LOW | Queue events; retry on next scrape cycle; alert user after 3 failures |
| Duplicate events published | LOW | Add deduplication logic; filter duplicates in HA automation |
| Scrape cascade failure | MEDIUM | Implement checkpointing; resume from last successful tracking number |

## Phase-to-Pitfall Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Tracking Number Format Ambiguity | Phase 1 (Manual Add Form) | Test with 12-digit numbers; verify disambiguation UI appears |
| Context Menu Async Handler | Phase 1 (Context Menu) | Test with throttled CPU; verify tracking numbers always add |
| DOM Selector Drift | Phase 1 (FedEx Scraping) | Test with multiple tracking numbers; verify consistent extraction |
| Akamai Anti-Bot Blocking | Phase 1 (FedEx Scraping) | Monitor for 403s; verify rate limiting logs |
| MQTT Event Payload Format | Phase 2 (MQTT Integration) | Test with HA Developer Tools; verify automations trigger |
| Duplicate Event Storm | Phase 2 (MQTT Integration) | Test retry scenario; verify single automation trigger |
| Sequential Scraping Cascade | Phase 1 (FedEx/UPS Implementation) | Induce timeout mid-scrape; verify other carriers continue |
| Context Menu Permission Scope | Phase 1 (Context Menu) | Verify menu only appears on text selection; review passes |

## Sources

- MDN WebExtensions API Documentation — Context Menus (menus.create, onClicked behavior)
- Home Assistant MQTT Event Integration Documentation — Payload format requirements
- FedEx Developer Portal — Rate limits and Akamai protection notices
- Andrew Kurochkin Blog — Tracking number format analysis for major carriers
- Scrapfly/Akamai Research — Anti-bot detection patterns and bypass techniques
- Existing codebase concerns — AliExpress selector fragility, notification URL map leak
- Existing OpenSpec changes — `add-fedex-tracking/design.md` DOM scraping blueprint
- Existing OpenSpec changes — `add-mqtt-delivery-events/design.md` MQTT integration design

---

*Pitfalls research for: Package Watch — Carrier Expansion + Home Assistant Milestone*
*Researched: 2026-02-08*
