## ADDED Requirements

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
