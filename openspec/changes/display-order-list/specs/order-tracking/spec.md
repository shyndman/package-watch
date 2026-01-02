# order-tracking Spec Delta

## MODIFIED Requirements

### Requirement: Popup displays last check time and in-flight count

The system SHALL display per-site last check time and in-flight order count in the popup header as a compact inline format.

#### Scenario: Compact header layout
- **WHEN** the user opens the popup
- **THEN** the system SHALL display a single-line title "Order Status"
- **AND** a second line showing per-site stats inline: `{Site}: {count} · {timestamp}`
- **AND** sites SHALL be separated by horizontal spacing

#### Scenario: Timestamp display
- **GIVEN** a site has a recorded scrape start timestamp
- **WHEN** the user opens the popup
- **THEN** the system SHALL display the time in ISO8601 format (e.g., "2025-01-15T14:30")

#### Scenario: Last check time missing
- **GIVEN** a site has no recorded scrape start timestamp
- **WHEN** the user opens the popup
- **THEN** the system SHALL display `--` for the timestamp

#### Scenario: In-flight order count
- **GIVEN** stored orders for a site
- **WHEN** the user opens the popup
- **THEN** the system SHALL display the count of orders where `isDelivered` is false

#### Scenario: In-progress indicator
- **GIVEN** a site scrape is in progress
- **WHEN** the user opens the popup
- **THEN** the system SHALL display a pill indicator next to that site's stats

## ADDED Requirements

### Requirement: Popup displays order list

The system SHALL display all tracked orders in a scrollable list within the popup.

#### Scenario: Order list display
- **WHEN** the user opens the popup
- **THEN** the system SHALL display all orders from all sites in a single combined list
- **AND** each order SHALL show:
  - Site badge pill (same style for all sites, displaying site name)
  - Product title (first product, with "+N more" suffix if multiple products)
  - Status text
  - Status detail (on same line after status, omitted if empty - layout may shift)
  - Link icon that opens order page in a new tab

#### Scenario: Order list sorting
- **WHEN** displaying the order list
- **THEN** non-delivered orders SHALL appear first, sorted by `orderDate` descending (most recent first)
- **AND** delivered orders SHALL appear after, sorted by `deliveredAt` descending (most recent first)

#### Scenario: Empty order list
- **WHEN** no orders are stored
- **THEN** the system SHALL display a message indicating no orders are being tracked

#### Scenario: Multiple products
- **WHEN** an order has multiple products
- **THEN** the system SHALL display the first product title followed by "+N more" where N is the remaining count

### Requirement: Popup visual styling

The system SHALL use a parcel-brown theme for the popup.

#### Scenario: Background color
- **WHEN** the popup is displayed
- **THEN** the background color SHALL be `#e1b07f` (parcel brown)

#### Scenario: Popup dimensions
- **WHEN** the popup is displayed
- **THEN** the popup SHALL have a minimum width of 320px
- **AND** a maximum height of 480px
- **AND** the order list SHALL scroll vertically when content exceeds available space

#### Scenario: Delivered order styling
- **WHEN** displaying a delivered order in the list
- **THEN** the order card SHALL have reduced opacity (0.6) to indicate completed status
