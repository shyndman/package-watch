# Codebase Concerns

**Analysis Date:** 2026-02-08

## Tech Debt

**Hard-coded DOM Selectors for Scraping:**
- Issue: All content scripts rely on hard-coded CSS selectors that will break when target sites (Amazon.ca, AliExpress) update their HTML structure
- Files: `entrypoints/amazon-orders.content.ts` (lines 43, 91-115), `entrypoints/aliexpress-orders.content.ts` (lines 43-48), `entrypoints/aliexpress-order-details.content.ts` (line 35), `entrypoints/aliexpress-tracking.content.ts` (lines 35-40)
- Impact: Site changes cause complete scraping failure; parse failure notifications are sent but require manual code updates to fix
- Fix approach: Implement selector versioning with fallbacks or migrate to more stable data sources (APIs)

**Missing Linting/Formatting Configuration:**
- Issue: No ESLint, Prettier, Biome, or other code quality tools configured
- Files: Root directory (`.eslintrc*`, `.prettierrc*` not found)
- Impact: Inconsistent code style, no automated catching of common errors, harder code reviews
- Fix approach: Add ESLint with TypeScript plugin and Prettier/Biome configuration

**Empty Stub Test File:**
- Issue: `lib/stub.test.ts` contains only a passing placeholder test with no actual value
- File: `lib/stub.test.ts`
- Impact: Noise in test suite, gives false sense of coverage
- Fix approach: Remove or replace with actual tests for untested modules

**Multiple Date Parsing Implementations:**
- Issue: Date parsing logic duplicated across Amazon and AliExpress with slightly different regex patterns
- Files: `entrypoints/amazon-orders.content.ts` (lines 194-207, 238-259), `entrypoints/aliexpress-orders.content.ts` (lines 55-68, 218-240), `lib/background/aliexpress.ts` (lines 16-30, 309-338)
- Impact: Maintenance burden; fixing a bug requires changes in multiple places
- Fix approach: Centralize date parsing in `lib/date.ts`

**Regex-Based Data Extraction:**
- Issue: Order IDs, dates, and status extracted via regex patterns that may fail on edge cases
- Files: `entrypoints/aliexpress-orders.content.ts` (lines 52-53, 170-188), `entrypoints/aliexpress-tracking.content.ts` (lines 42-57, 97-127)
- Impact: Parsing failures on unexpected formats; silent data corruption possible
- Fix approach: Add more robust parsing with validation and fallback strategies

## Known Issues

**Parse Failure Notification Aggregation Bug:**
- Issue: When multiple parse failures occur, only the first (often least informative) failure is reported
- File: `entrypoints/background.ts` (lines 236-245)
- Trigger: Multiple scrape failures in succession
- Workaround: Manual monitoring of console logs

**AliExpress Single-Tab Sequential Navigation Timeout Risk:**
- Issue: AliExpress scraping navigates through multiple pages (order list → details per order → tracking per order) in a single tab. If any navigation times out, the entire scrape fails
- Files: `lib/background/aliexpress.ts` (lines 172-238)
- Trigger: Slow network, AliExpress rate limiting, or page load issues
- Workaround: Scrape timeout (30s) catches hangs but loses partial progress

**Delivered Order Reappearing as New:**
- Issue: Expired delivered orders (7+ days old) that reappear in scrape results are filtered out, but this could mask legitimate redeliveries or order duplicates
- File: `lib/storage.ts` (lines 175-186)
- Trigger: Re-scraping after retention period expires
- Current mitigation: `isFirstRun` check prevents false positives on initial load

## Security Considerations

**Broad Host Permissions:**
- Risk: Extension has `host_permissions` for `*://www.amazon.ca/*` and `*://www.aliexpress.com/*`
- Files: `wxt.config.ts` (line 10)
- Current mitigation: Content scripts only activate on specific paths; `defineScrapingScript` checks tab activation before scraping
- Recommendations: Consider narrowing permissions to specific order-related paths only

**Content Script Injection on E-Commerce Sites:**
- Risk: Content scripts have full DOM access to sensitive e-commerce pages with purchase history, payment info, addresses
- Files: All `entrypoints/*.content.ts` files
- Current mitigation: Scraping only occurs on background-opened tabs, not user sessions; user tabs stay inert via `scrape:checkActivation`
- Recommendations: Add CSP headers; verify no sensitive data is logged

**Notification URL Mapping Memory Leak:**
- Risk: `notificationUrlMap` grows unbounded as notifications are created but never cleaned up for notifications that aren't clicked
- File: `lib/background/notifications.ts` (lines 10-18)
- Current mitigation: Map only stores order URL strings (not large objects)
- Recommendations: Add TTL or max-size eviction to the map

**Console Logging of Sensitive Data:**
- Risk: Product titles, order IDs, and URLs logged to console at INFO level
- Files: `entrypoints/amazon-orders.content.ts` (lines 64, 113, 162-166), `lib/background/aliexpress.ts` (line 53)
- Current mitigation: No PII like addresses or payment info logged
- Recommendations: Reduce log verbosity in production builds

## Performance Bottlenecks

**Synchronous DOM Polling:**
- Problem: Content scripts use `setTimeout` polling loops waiting for DOM elements
- Files: `entrypoints/amazon-orders.content.ts` (lines 39-51), `entrypoints/aliexpress-orders.content.ts` (lines 70-94), `entrypoints/aliexpress-order-details.content.ts` (lines 38-51), `entrypoints/aliexpress-tracking.content.ts` (lines 59-72)
- Cause: 500ms poll interval for up to 15 seconds = up to 30 DOM queries per page
- Improvement path: Use `MutationObserver` instead of polling for better responsiveness and lower CPU usage

**AliExpress Multi-Page Sequential Scraping:**
- Problem: For N orders, AliExpress scraper makes 2N+1 page navigations (list → details ×N → tracking ×N)
- Files: `lib/background/aliexpress.ts` (lines 172-238)
- Cause: One tab, sequential operations; each navigation includes page load + parse wait
- Improvement path: Consider parallel tabs (with rate limiting) or batch API if available

**Storage Write Amplification:**
- Problem: Every order save rewrites entire order state to storage even for no-op updates
- File: `lib/storage.ts` (lines 95-137)
- Cause: No diffing before write; entire `orders` object serialized each time
- Improvement path: Only write changed orders; use incremental updates

## Fragile Areas

**Amazon Order Status Text Parsing:**
- Files: `entrypoints/amazon-orders.content.ts` (lines 171-188)
- Why fragile: Relies on specific text content ("delivered", "arriving today", "out for delivery") which may vary by locale or change over time
- Safe modification: Add new patterns to existing checks; don't remove old ones until verified deprecated
- Test coverage: No unit tests for status parsing logic

**AliExpress CSS Class Selectors:**
- Files: `entrypoints/aliexpress-tracking.content.ts` (lines 35-40)
- Why fragile: Uses generated CSS class names (e.g., `[class*="logistic-info-v2--node--"]`) that can change with site redeploys
- Safe modification: Use multiple selector strategies with fallbacks; prefer semantic selectors where possible
- Test coverage: None for tracking page parsing

**Amazon Date Format Parsing:**
- Files: `entrypoints/amazon-orders.content.ts` (lines 238-259)
- Why fragile: Assumes "Month DD, YYYY" English format; may fail for different locales or date formats
- Safe modification: Add locale detection and format-specific parsers
- Test coverage: None for date edge cases

**Background Message Handler Error Routing:**
- Files: `entrypoints/background.ts` (lines 91-94, 209-246)
- Why fragile: Parse failures for Amazon route to generic handler that assumes Amazon site; AliExpress has specific handlers
- Safe modification: Unify error handling strategy across all sites
- Test coverage: `lib/background-status.test.ts` tests some paths but not all error combinations

## Test Coverage Gaps

**Content Scripts Untested:**
- What's not tested: All DOM parsing logic in content scripts
- Files: `entrypoints/amazon-orders.content.ts`, `entrypoints/aliexpress-orders.content.ts`, `entrypoints/aliexpress-order-details.content.ts`, `entrypoints/aliexpress-tracking.content.ts`
- Risk: Site changes break scraping silently; only discovered in production
- Priority: High - these are most fragile components

**Notification System:**
- What's not tested: `sendNotification`, `sendParseFailureNotification`, `sendAuthFailedNotification`
- Files: `lib/background/notifications.ts`
- Risk: Notification failures not caught; audio playback issues
- Priority: Medium

**Scheduler Logic:**
- What's not tested: `calculateInterval`, active hours detection, alarm scheduling
- Files: `lib/background/scheduler.ts`
- Risk: Incorrect scheduling could cause excessive scraping or missed checks
- Priority: Medium

**Error Recovery Paths:**
- What's not tested: Tab closure failures, storage write failures, navigation errors
- Files: `entrypoints/background.ts` (error handlers)
- Risk: Partial failures leave system in inconsistent state
- Priority: Medium

## Dependencies at Risk

**@webext-core/messaging:**
- Risk: Core communication library; if abandoned, requires significant refactoring
- Impact: All message passing between content scripts and background would need migration
- Migration plan: Fork or migrate to standard browser.runtime.sendMessage with type wrappers

**@js-temporal/polyfill:**
- Risk: Polyfill for Temporal API; may become unnecessary as browsers implement natively or may diverge from spec
- Impact: Date/time handling across entire codebase
- Migration plan: Monitor native Temporal support; polyfill can be removed when baseline browser support reaches target

**WXT Framework:**
- Risk: Extension build framework; version lock may miss security updates
- Impact: Build system, manifest generation, development workflow
- Migration plan: Keep updated; migration to vanilla web extension APIs would be major undertaking

## Missing Critical Features

**Rate Limiting:**
- Problem: No rate limiting between sequential AliExpress page navigations
- Blocks: Could trigger anti-bot measures from AliExpress
- Priority: Medium

**Retry Logic:**
- Problem: Failed scrapes immediately schedule next check at default interval; no retry with backoff
- Blocks: Transient failures (network blips) cause notification delays
- Priority: Medium

**Order Change History:**
- Problem: Only current state stored; no audit trail of status changes over time
- Blocks: Debugging user reports of missed notifications; understanding delivery timelines
- Priority: Low

**Configuration UI:**
- Problem: Check intervals, notification preferences, site enablement are all hard-coded
- Blocks: User customization without code changes
- Priority: Low

---

*Concerns audit: 2026-02-08*
