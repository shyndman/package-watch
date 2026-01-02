# order-tracking Spec Delta

## ADDED Requirements

### Requirement: AliExpress Single-Tab Scrape

The system SHALL use a single browser tab for the entire AliExpress scrape sequence to minimize visual distraction.

#### Scenario: Tab lifecycle during successful scrape
- **WHEN** an AliExpress scrape begins
- **THEN** the system SHALL create one background tab
- **AND** navigate that tab sequentially through: order list → order details (per order) → tracking (per active order)
- **AND** close the tab only after all pages have been scraped

#### Scenario: Tab lifecycle on parse failure
- **WHEN** a parse failure occurs during any phase of the AliExpress scrape
- **THEN** the system SHALL close the scrape tab
- **AND** abort the remaining scrape sequence

#### Scenario: Tab lifecycle on timeout
- **WHEN** a page load times out during any phase of the AliExpress scrape
- **THEN** the system SHALL close the scrape tab
- **AND** abort the remaining scrape sequence
