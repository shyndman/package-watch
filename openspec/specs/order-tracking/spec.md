# order-tracking Specification

## Purpose
TBD - created by archiving change add-aliexpress-tracking. Update Purpose after archive.
## Requirements
### Requirement: Parse Failure Notification

The system SHALL throw a parse-failure exception for any parsing failure unless that state is explicitly defined as optional. Any such parse failure SHALL be treated as a scrape failure, stopping the current scrape and notifying the user.

Explicitly required data includes, at minimum:
1. Order list parsing (each order card): order ID, status element, order date, product titles, product URLs.
2. Order list parsing (page-level): order list elements must appear within the scrape timeout.
3. Tracking page parsing: tracking header, timeline node, `tradeOrderId`.
4. Delivery-related date parsing: any delivery-related date string that is present must parse correctly.

#### Scenario: Any parse failure stops the scrape
- **WHEN** any required field, element, or date cannot be parsed
- **THEN** the system SHALL throw a parse-failure exception
- **AND** it SHALL stop parsing and NOT record any orders for that run
- **AND** it SHALL send a parse failure notification

#### Scenario: Tracking parse failure
- **WHEN** a tracking page is being parsed
- **AND** the tracking header, timeline node, or `tradeOrderId` is missing
- **THEN** the system SHALL throw a parse-failure exception
- **AND** it SHALL send a parse failure notification
- **AND** it SHALL resolve and close the tracking scrape flow

#### Scenario: Date parse failure
- **WHEN** a delivery-related date string is present
- **AND** it cannot be parsed into a date
- **THEN** the system SHALL throw a parse-failure exception
- **AND** it SHALL send a parse failure notification

#### Scenario: Reason and stack trace
- **WHEN** a parse failure is detected
- **THEN** the system SHALL log the exception object with its stack trace
- **AND** it SHALL include a brief reason in the notification if available
- **AND** it SHALL still send a notification when no reason is available

#### Scenario: Aggregated notifications
- **WHEN** multiple parse failures occur during a single scrape run for a site
- **THEN** the system SHALL send only one parse failure notification for that run
- **AND** it SHALL log each failure
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

### Requirement: Record scrape start metadata per site
The system SHALL record per-site scrape start metadata when a scrape begins.

#### Scenario: Alarm-fired scrape start
- **WHEN** a site alarm fires and a scrape begins
- **THEN** the system SHALL store the scrape start timestamp for that site
- **AND** the system SHALL log "Alarm fired: {Site} order check started"

#### Scenario: Startup-triggered scrape start
- **WHEN** the background script starts and triggers an immediate scrape
- **THEN** the system SHALL store the scrape start timestamp for each site
- **AND** the system SHALL log "Alarm fired: {Site} order check started"

### Requirement: Immediate scrape on browser startup
The system SHALL start a scrape for each supported site when the browser starts.

#### Scenario: Browser startup
- **WHEN** the browser starts
- **THEN** the system SHALL initiate a scrape for Amazon and AliExpress immediately

### Requirement: Popup displays last check time and in-flight count
The system SHALL display per-site last check time and in-flight order count in the popup.

#### Scenario: Last check time available
- **GIVEN** a site has a recorded scrape start timestamp
- **WHEN** the user opens the popup
- **THEN** the system SHALL display the site label and the absolute timestamp (with seconds)

#### Scenario: Last check time missing
- **GIVEN** a site has no recorded scrape start timestamp
- **WHEN** the user opens the popup
- **THEN** the system SHALL display `PENDING` for the last check time

#### Scenario: In-flight order count
- **GIVEN** stored orders for a site
- **WHEN** the user opens the popup
- **THEN** the system SHALL display the count of orders where `isDelivered` is false

### Requirement: Popup indicates in-progress status
The system SHALL show an in-progress indicator when a site scrape is running.

#### Scenario: Scrape in progress
- **GIVEN** a site scrape is in progress
- **WHEN** the user opens the popup
- **THEN** the system SHALL show a small status label indicating the scrape is in progress
