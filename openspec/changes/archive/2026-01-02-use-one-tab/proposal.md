# Proposal: use-one-tab

## Summary

Reduce visual distraction during AliExpress scrapes by reusing a single tab for the entire scrape sequence instead of creating and destroying tabs for each page.

## Problem

Currently, AliExpress scraping creates and closes multiple tabs:
- 1 tab for the order list page
- N tabs for order details (one per order, sequential)
- M tabs for tracking pages (one per active order, sequential)

For 5 orders with 3 active, that's 9 tab open/close cycles. Each cycle causes a visible tab to flash at the end of the tab bar, which is distracting compared to Amazon's single-tab scrape.

## Solution

Reuse one tab for the entire AliExpress scrape:
1. Create tab → navigate to order list → receive orders
2. Navigate same tab to details page 1 → receive details
3. Navigate same tab to details page 2 → receive details
4. ...continue for all orders...
5. Navigate same tab to tracking page 1 → receive tracking
6. ...continue for active orders...
7. Close tab

The user sees one tab appear, persist for 10-30 seconds during the scrape, then disappear.

## Scope

- **In scope**: AliExpress scrape tab lifecycle changes
- **Out of scope**: Amazon (already uses single tab), hidden window (future enhancement)

## Spec Impact

No spec changes required. The existing specs describe *what* data to extract from each page type, not *how* tabs are managed. This is purely an implementation refactor.
