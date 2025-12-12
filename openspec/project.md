# Project Context

## Purpose

Browser extension for automated package/order monitoring. Periodically scrapes e-commerce order history pages, detects status changes, and sends browser notifications with optional sound alerts.

## Tech Stack

- **Framework**: WXT (WebExtension Tooling)
- **Language**: TypeScript (strict, no `any`)
- **Build**: pnpm, vue-tsc for type checking
- **Browser**: Firefox (Manifest V2)
- **Storage**: @wxt-dev/storage for persistent state
- **Date handling**: Temporal API (PlainDate)

## Project Conventions

### Code Style

- Strong typing everywhere — leverage the type system fully
- No `any` types, ever
- No backwards compatibility code — we migrate all at once
- Prefer simple, direct implementations over abstractions

### Architecture Patterns

- **Background script**: Orchestrates periodic scraping via `browser.alarms`, manages tab lifecycle, detects state changes, sends notifications
- **Content scripts**: Match specific URLs, parse DOM, send structured data to background via `browser.runtime.sendMessage`
- **Storage**: Persists order state for change detection between scrapes
- **Tab tracking**: Background tracks which tabs it opened (via `scrapeTabIds` Set) to avoid closing user-opened tabs

### Testing Strategy

- **Framework**: Vitest with `wxt-vitest-plugin`
- **Browser API mocking**: `@webext-core/fake-browser` provides in-memory implementation
- No need to mock `browser.storage` — fake-browser handles it
- When mocking WXT APIs from `#imports`, use real import paths (check `.wxt/types/imports-module.d.ts`)

### Git Workflow

No specific conventions documented.

## Domain Context

**Order tracking workflow**:
1. Extension opens e-commerce order history page in background tab
2. Content script parses order cards, extracts status/dates/products
3. Background compares against stored state to detect changes
4. Notifications sent for changed orders
5. Polling interval adapts: faster (10 min) when delivery expected today during waking hours (7AM-10PM), slower (30 min) otherwise

**Key data points extracted**:
- Order ID, status, status detail
- Product titles
- Expected delivery date
- Whether delivery is today, whether delivered

## Important Constraints

- **Firefox only** — no Chrome/Chromium support needed
- **Ubuntu Linux** (25.04/25.10) — notifications go through GNOME shell / libnotify
- **No backwards compatibility** — single-version deployments

## External Dependencies

**Current**:
- Amazon.ca order history pages

**Planned**:
- AliExpress order tracking
- Email inbox integration (for package tracking emails)
