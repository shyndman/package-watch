<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

WXT-based browser extension for automated browser tasks. Currently implements Amazon order status monitoring with browser notifications.

## Package Manager

Use **pnpm**, not npm or yarn.

## Commands

```bash
pnpm install          # install dependencies
pnpm dev:firefox      # dev mode (auto-reloads)
pnpm build:firefox    # production build
pnpm zip:firefox      # build and package as .zip (used for testing)
pnpm xpi:firefox      # build and package as .xpi
pnpm compile          # type-check with vue-tsc
```

Output lands in `.output/firefox-mv2`.

## Architecture

**Background script** (`entrypoints/background.ts`): Orchestrates periodic scraping via `browser.alarms`, opens background tabs to Amazon, receives scraped data from content scripts, detects changes against stored state, and sends browser notifications.

**Content script** (`entrypoints/amazon-orders.content.ts`): Matches Amazon.ca order history URLs, waits for DOM to load, parses `.order-card` elements, and sends structured order data to background via `browser.runtime.sendMessage`.

**Storage** (`lib/storage.ts`): Persists order state using `@wxt-dev/storage` for change detection between scrapes.

**Types** (`lib/types.ts`): Shared interfaces for `OrderStatus`, `StoredOrderState`, and message types.

## Key Patterns

- Content scripts run on any matching URL (including user-opened tabs). Background tracks which tabs it opened for scraping via `scrapeTabIds` Set to avoid closing user's tabs.
- Polling interval is adaptive: 30 min default, 10 min if delivery expected today + not delivered + 7AM-10PM local time.
- Dates are parsed into Temporal PlainDate and stored as ISO strings.
- **Temporal API is available** in the browser without polyfills. Use it for all date/time operations.
