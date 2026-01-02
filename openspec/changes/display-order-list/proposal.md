# Proposal: display-order-list

## Summary

Redesign the popup to display all tracked orders in a combined list, replacing the current site-card layout with a compact header and scrollable order list.

## Motivation

The current popup only shows aggregate stats (in-flight count, last check time) without revealing the actual orders. Users must open Amazon/AliExpress to see order details. Displaying orders directly in the popup provides immediate visibility into package status.

## Scope

- Replace site cards with compact inline header showing per-site stats
- Add scrollable order list combining all sites
- Update visual styling (parcel brown background)
- Retain existing functionality (in-flight count, last check time, in-progress indicator)

## Affected Specs

- `order-tracking`: Modifies popup display requirements
