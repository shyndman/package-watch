## MODIFIED Requirements

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
