## ADDED Requirements

### Requirement: Delivered Order Expiration

The system SHALL expire delivered orders 7 days after delivery detection to prevent indefinite storage accumulation. Expiration occurs lazily during write operations rather than via active cleanup.

#### Scenario: Delivery timestamp recorded

- **WHEN** an order's `isDelivered` transitions to true
- **THEN** the system SHALL set `deliveredAt` to the current ISO timestamp
- **AND** the timestamp SHALL be immutable once set

#### Scenario: Order expires after retention period

- **WHEN** `saveOrders` is called
- **AND** an order has `isDelivered === true`
- **AND** `deliveredAt` is more than 7 days ago
- **THEN** the system SHALL omit that order from the write
- **AND** the order SHALL no longer exist in storage

#### Scenario: Legacy delivered orders expire immediately

- **WHEN** `saveOrders` is called
- **AND** an order has `isDelivered === true`
- **AND** `deliveredAt` is null (legacy data)
- **THEN** the system SHALL omit that order from the write

#### Scenario: Non-delivered orders unaffected

- **WHEN** `saveOrders` is called
- **AND** an order has `isDelivered === false`
- **THEN** the order SHALL be written regardless of age
