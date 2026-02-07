## ADDED Requirements

### Requirement: Toolbar badge displays combined in-flight order count

The system SHALL display a toolbar action badge showing the combined in-flight order count across all supported sites.

In-flight orders are defined as stored orders where `isDelivered` is false.

The badge text formatting SHALL be:
1) Empty (`''`) when the total in-flight count is 0.
2) A base-10 integer string when the total is between 1 and 99 (inclusive).
3) `99+` when the total is 100 or greater.

The badge SHALL update based on stored order state and SHALL NOT be used to represent scrape-in-progress status.

#### Scenario: Badge updates on startup from stored state
- **GIVEN** stored orders exist for one or more sites
- **WHEN** the background script starts
- **THEN** the system SHALL compute the combined in-flight count across all supported sites
- **AND** it SHALL set the toolbar badge text using the defined formatting rules

#### Scenario: Badge clears when there are no in-flight orders
- **GIVEN** the combined in-flight order count across all sites is 0
- **WHEN** the badge is updated
- **THEN** the system SHALL clear the toolbar badge text

#### Scenario: Badge shows total across multiple sites
- **GIVEN** stored orders exist for multiple sites
- **AND** each site has one or more orders where `isDelivered` is false
- **WHEN** the badge is updated
- **THEN** the system SHALL set the badge to the combined total across all supported sites

#### Scenario: Badge caps display at 99+
- **GIVEN** the combined in-flight order count across all sites is 100 or greater
- **WHEN** the badge is updated
- **THEN** the system SHALL set the toolbar badge text to `99+`

#### Scenario: Badge does not reflect scrape-in-progress status
- **GIVEN** a site scrape is in progress
- **WHEN** the badge is updated
- **THEN** the badge text SHALL still be derived only from stored order state
