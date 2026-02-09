# Technology Stack

**Analysis Date:** 2026-02-08

## Languages

**Primary:**
- TypeScript 5.9.2 - All source code, compilation target ESNext with ESNext modules

**Secondary:**
- Vue Single-File Components (.vue) - Popup UI components
- CSS - Styling for popup interface
- HTML - Minimal, via Vue templates

## Runtime

**Environment:**
- Browser Extension (WebExtensions API)
- Target: Chrome, Firefox (cross-browser support)
- Extension ID: `package-watch@shyndman.dev` (Firefox)

**Package Manager:**
- pnpm (via pnpm-workspace.yaml)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- **WXT** 0.20.6 - Web extension toolkit for building and packaging
- **Vue.js** 3.5.21 - UI framework for popup interface

**Testing:**
- **Vitest** 4.0.16 - Test runner with Vite integration
- **happy-dom** 20.0.11 - DOM environment for tests

**Build/Dev:**
- **Vite** (via WXT) - Build tool and dev server
- **@vitejs/plugin-vue** 6.0.3 - Vue support for Vite
- **vue-tsc** 3.0.6 - Vue TypeScript compiler for type checking

## Key Dependencies

**Critical:**
- `@webext-core/messaging` 2.3.0 - Typed message passing between content scripts and background
- `@wxt-dev/storage` 1.2.6 - Promise-based storage API wrapper
- `@wxt-dev/module-vue` 1.0.2 - Vue module for WXT
- `@wxt-dev/auto-icons` 1.1.0 - Automatic icon generation for extension

**Infrastructure:**
- `@js-temporal/polyfill` 0.5.1 - Temporal API polyfill (tests only, browser has native support)

## Browser Extension Architecture

**Entry Points:**
- `entrypoints/background.ts` - Background service worker
- `entrypoints/popup/` - Popup UI (Vue app)
- `entrypoints/*.content.ts` - Content scripts for Amazon and AliExpress

**Permissions (from `wxt.config.ts`):**
- `alarms` - Scheduled order checking
- `notifications` - Order status change notifications
- `storage` - Order state persistence
- `tabs` - Background tab management for scraping

**Host Permissions:**
- `*://www.amazon.ca/*` - Amazon Canada orders
- `*://www.aliexpress.com/*` - AliExpress orders

## Configuration

**TypeScript:**
- Config: `tsconfig.json` (extends `.wxt/tsconfig.json`)
- Target: ESNext
- Module: ESNext with Bundler resolution
- Path aliases: `@/*`, `~/*`, `@@/*`, `~~/*` all map to project root

**WXT:**
- Config: `wxt.config.ts`
- Modules: `@wxt-dev/module-vue`, `@wxt-dev/auto-icons`
- Browser-specific settings for Firefox Gecko ID

**Vitest:**
- Config: `vitest.config.ts`
- Plugins: `WxtVitest()`, `vue()`
- Setup: `vitest.setup.ts` (temporal polyfill initialization)

**pnpm:**
- Workspace: `pnpm-workspace.yaml`
- `.pnpmrc.json`: Only built dependencies for `sharp`

## Platform Requirements

**Development:**
- Node.js with pnpm
- Browser with native Temporal API support (Chrome 95+, Firefox latest)

**Production:**
- Chrome Web Store or Firefox Add-ons
- Target domains must be accessible (Amazon.ca, AliExpress.com)

---

*Stack analysis: 2026-02-08*
