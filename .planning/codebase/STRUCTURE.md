# Codebase Structure

**Analysis Date:** 2026-02-08

## Directory Layout

```
[project-root]/
├── entrypoints/              # Extension entry points (WXT convention)
│   ├── background.ts         # Service worker - orchestration
│   ├── amazon-orders.content.ts      # Amazon order list scraper
│   ├── aliexpress-orders.content.ts  # AliExpress order list scraper
│   ├── aliexpress-order-details.content.ts  # AliExpress product details
│   ├── aliexpress-tracking.content.ts       # AliExpress tracking info
│   └── popup/                # Popup UI (Vue 3)
│       ├── main.ts           # Vue app entry
│       ├── App.vue           # Main component
│       ├── App.test.ts       # Component tests
│       ├── style.css         # Popup styles
│       └── index.html        # HTML template
├── lib/                      # Shared library code
│   ├── types.ts              # Core type definitions
│   ├── storage.ts            # Storage abstraction (@wxt-dev/storage)
│   ├── messaging.ts          # Message protocol definition
│   ├── date.ts               # Date formatting utilities
│   ├── parse-failure.ts      # Parse failure error type
│   ├── define-scraping-script.ts  # Content script factory
│   ├── temporal.d.ts         # Temporal API type declarations
│   ├── background/           # Background script modules
│   │   ├── scheduler.ts      # Alarm scheduling logic
│   │   ├── notifications.ts  # Browser notification helpers
│   │   ├── badge.ts          # Toolbar badge updater
│   │   ├── amazon.ts         # Amazon scraping workflow
│   │   ├── aliexpress.ts     # AliExpress scraping workflow
│   │   ├── aliexpress.test.ts
│   │   └── badge.test.ts
│   ├── storage.test.ts
│   ├── background-status.test.ts
│   ├── define-scraping-script.test.ts
│   └── stub.test.ts
├── components/               # Shared Vue components
│   └── HelloWorld.vue        # Example component (unused)
├── assets/                   # Static assets
│   ├── icon.png
│   └── logo.svg
├── public/                   # Public static files
│   └── assets/
│       └── notification.mp3  # Notification sound
├── openspec/                 # Specification-driven development
│   ├── project.md            # Project conventions and context
│   ├── AGENTS.md             # OpenSpec agent instructions
│   ├── specs/                # Current capability specs
│   └── changes/              # Change proposals
│       ├── add-fedex-tracking/
│       ├── add-inflight-badge/
│       ├── expire-past-deliveries/
│       ├── display-order-list/
│       ├── add-mqtt-delivery-events/
│       └── archive/          # Completed changes
├── .wxt/                     # WXT generated files
│   ├── types/                # Auto-generated types
│   └── wxt.d.ts
├── .opencode/                # AI agent configurations
│   ├── agents/               # GSD agent definitions
│   └── get-shit-done/        # GSD templates
├── wxt.config.ts             # WXT configuration
├── vitest.config.ts          # Vitest configuration
├── vitest.setup.ts           # Test setup
├── tsconfig.json             # TypeScript config (extends .wxt/)
├── package.json
└── pnpm-workspace.yaml
```

## Directory Purposes

**entrypoints/:**
- Purpose: WXT convention - all extension entry points
- Contains: Background scripts, content scripts, popup UI, options pages
- Key files: `background.ts`, `*.content.ts`, `popup/App.vue`
- WXT auto-discovers files here based on naming patterns

**lib/:**
- Purpose: Shared business logic and utilities
- Contains: Types, storage layer, messaging, site handlers
- Key files: `types.ts`, `storage.ts`, `messaging.ts`, `background/*.ts`
- No framework-specific code (except messaging which is extension-specific)

**lib/background/:**
- Purpose: Background script business logic
- Contains: Site-specific scrapers, scheduling, notifications
- Key files: `aliexpress.ts`, `amazon.ts`, `scheduler.ts`, `notifications.ts`, `badge.ts`
- Each file has co-located `.test.ts` file

**components/:**
- Purpose: Reusable Vue components
- Current state: Minimal (only `HelloWorld.vue` example)
- Future use: Extract popup components here if complexity grows

**openspec/:**
- Purpose: Specification-driven development documentation
- Contains: Project conventions, capability specs, change proposals
- Key files: `project.md`, `specs/*/spec.md`, `changes/*/proposal.md`

**.wxt/:**
- Purpose: WXT framework generated files
- Contains: Type definitions, manifest generation
- Generated: Yes (by `wxt prepare` / postinstall)
- Committed: Yes (types needed for development)

## Key File Locations

**Entry Points:**
- `entrypoints/background.ts`: Background service worker
- `entrypoints/amazon-orders.content.ts`: Amazon scraper
- `entrypoints/aliexpress-orders.content.ts`: AliExpress order list scraper
- `entrypoints/aliexpress-order-details.content.ts`: AliExpress product details
- `entrypoints/aliexpress-tracking.content.ts`: AliExpress tracking scraper
- `entrypoints/popup/main.ts`: Popup UI entry

**Configuration:**
- `wxt.config.ts`: Extension manifest, permissions, host permissions
- `vitest.config.ts`: Test configuration with WXT plugin
- `tsconfig.json`: Extends `.wxt/tsconfig.json`
- `package.json`: Dependencies (Vue 3, WXT, Vitest)

**Core Logic:**
- `lib/types.ts`: All TypeScript interfaces and types
- `lib/storage.ts`: Storage wrapper with TTL logic
- `lib/messaging.ts`: Typed message protocol
- `lib/define-scraping-script.ts`: Content script factory

**Testing:**
- `lib/*.test.ts`: Unit tests for library modules
- `lib/background/*.test.ts`: Tests for background handlers
- `entrypoints/popup/App.test.ts`: Component tests
- `vitest.setup.ts`: Test environment setup

## Naming Conventions

**Files:**
- Content scripts: `[site]-[purpose].content.ts` (e.g., `amazon-orders.content.ts`)
- Test files: `[module].test.ts` (co-located with source)
- Background modules: `[purpose].ts` in `lib/background/`

**Directories:**
- Lowercase with hyphens: `lib/background/`, `entrypoints/popup/`
- WXT reserves: `entrypoints/` for scripts, `assets/` for static files, `public/` for public files

**TypeScript:**
- Types: PascalCase (e.g., `OrderStatus`, `AliExpressTrackingResult`)
- Interfaces: PascalCase with descriptive names
- Functions: camelCase, descriptive verbs (e.g., `performAliExpressScrape`)
- Constants: UPPER_SNAKE_CASE for true constants (e.g., `SCRAPE_TIMEOUT_MS`)

## Where to Add New Code

**New E-commerce Site Support:**
1. Add site type to `OrderSite` in `lib/types.ts`
2. Create content script: `entrypoints/[site]-orders.content.ts` using `defineScrapingScript()`
3. Create background handler: `lib/background/[site].ts` with `perform[Site]Scrape()` function
4. Add constants to `lib/background/scheduler.ts` (alarm name, intervals)
5. Wire up in `entrypoints/background.ts`: import handler, add to `startScrape()` switch
6. Add host permission to `wxt.config.ts` manifest
7. Add site to `SUPPORTED_SITES` in `lib/background/badge.ts`

**New Content Script:**
- Location: `entrypoints/[name].content.ts`
- Pattern: Use `defineScrapingScript()` instead of `defineContentScript()`
- Export: Default export with `matches` and `scrape` function
- Messaging: Use `sendMessage()` from `lib/messaging.ts`

**New Background Handler:**
- Location: `lib/background/[name].ts`
- Pattern: Export functions that receive dependencies object for testability
- Types: Define `XxxDependencies` type for dependency injection
- Tests: Create `lib/background/[name].test.ts`

**New UI Component:**
- If popup-specific: `entrypoints/popup/components/[Name].vue`
- If shared: `components/[Name].vue`
- Pattern: Vue 3 Composition API with `<script setup lang="ts">`

**New Storage Keys:**
- Location: `lib/storage.ts`
- Pattern: Add to `StorageKey` union type, create getter/setter functions
- Migration: Handle in getter if key changed (see legacy Amazon key handling)

**New Utilities:**
- Location: `lib/[name].ts` for shared utilities
- Pattern: Pure functions with explicit types, no side effects
- Tests: Co-located `lib/[name].test.ts`

## Special Directories

**.wxt/:**
- Purpose: Framework-generated types and config
- Generated: Yes (by `postinstall` script)
- Committed: Yes (types referenced by `tsconfig.json`)
- Key files: `types/imports.d.ts`, `types/globals.d.ts`, `wxt.d.ts`

**.opencode/:**
- Purpose: AI agent configurations and templates
- Contains: Agent definitions, GSD templates
- Not part of extension functionality

**openspec/changes/archive/:**
- Purpose: Completed change proposals
- Naming: `YYYY-MM-DD-[change-name]/`
- Workflow: Move from `changes/` after deployment

---

*Structure analysis: 2026-02-08*
