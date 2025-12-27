# order-tracking Specification

## Purpose
TBD - created by archiving change add-aliexpress-tracking. Update Purpose after archive.
## Requirements
### Requirement: Parse Failure Notification

The system SHALL notify the user when order parsing fails.

#### Scenario: No orders parsed
- **WHEN** a scrape completes but zero orders are extracted
- **AND** the page loaded successfully (not an auth failure)
- **THEN** the system SHALL send a notification indicating parsing may be broken

#### Scenario: Individual order parse error
- **WHEN** an individual order card fails to parse
- **THEN** the system SHALL log the error with details
- **AND** continue parsing remaining orders

### Requirement: Multi-Site Order Tracking

The system SHALL support tracking orders from multiple e-commerce sites simultaneously, with each site having independent polling schedules, storage, and notification behavior.

#### Scenario: Concurrent site tracking
- **WHEN** the extension is running
- **THEN** it SHALL maintain separate alarms for each configured site
- **AND** scrape each site independently according to its configured interval

#### Scenario: Site-specific storage
- **WHEN** orders are scraped from a site
- **THEN** they SHALL be stored under a site-specific storage key
- **AND** change detection SHALL compare against only that site's previous state

### Requirement: AliExpress Order Discovery

The system SHALL scrape the AliExpress order list page to discover active orders.

#### Scenario: Order list parsing
- **WHEN** the order list page loads at `https://www.aliexpress.com/p/order/index.html`
- **THEN** the system SHALL extract for each order:
  - Order ID (from "Order ID: XXXX" text)
  - High-level status ("Awaiting delivery" or "Completed")
  - Order date (from "Order date: Dec 17, 2025" text)
  - Order details page URL (from the "Order details" link)
  - Tracking page URL (from the "Track order" link, when present)

#### Scenario: Auth failure detection
- **WHEN** the order list page shows a login prompt instead of orders
- **THEN** the system SHALL send a notification: "AliExpress session expired - please log in"

### Requirement: AliExpress Order Details Product Info

The system SHALL scrape the AliExpress order details page to obtain product info.

#### Scenario: Order details parsing
- **WHEN** an order details page loads at `https://www.aliexpress.com/p/order/detail.html?orderId={orderId}`
- **THEN** the system SHALL extract:
  - The first product title
  - The first product page URL

### Requirement: AliExpress Granular Status Tracking

The system SHALL scrape individual tracking pages to obtain granular order status.

#### Scenario: Tracking page navigation
- **WHEN** an order has status other than "Completed"
- **THEN** the system SHALL open its tracking page at `https://www.aliexpress.com/p/tracking/index.html?tradeOrderId={orderId}`

#### Scenario: Tracking page parsing
- **WHEN** the tracking page loads
- **THEN** the system SHALL extract:
  - Current status (first/top status in timeline)
  - Status detail text
  - Whether the order is delivered (status contains "Delivered")
  - Estimated delivery date (if present)

### Requirement: AliExpress Polling Schedule

The system SHALL poll AliExpress orders at site-specific intervals.

#### Scenario: Default polling interval
- **WHEN** no AliExpress order has delivery expected today
- **THEN** the polling interval SHALL be 120 minutes (2 hours)

#### Scenario: Active delivery polling
- **WHEN** an AliExpress order has delivery expected today
- **AND** the order is not yet delivered
- **AND** the current time is between 7AM and 10PM local time
- **THEN** the polling interval SHALL be 10 minutes

### Requirement: AliExpress Status Change Notifications

The system SHALL notify on all AliExpress status changes.

#### Scenario: Status change notification
- **WHEN** an AliExpress order's status changes
- **THEN** the system SHALL create a browser notification with:
  - Title: the new status text
  - Body: product summary and status detail

#### Scenario: Delivery sound
- **WHEN** an AliExpress order transitions to delivered status
- **THEN** the notification sound SHALL play

#### Scenario: First run suppression
- **WHEN** this is the first scrape for AliExpress
- **THEN** no notifications SHALL be sent
- **AND** the current state SHALL be stored as baseline
