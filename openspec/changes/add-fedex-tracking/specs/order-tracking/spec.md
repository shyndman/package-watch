## ADDED Requirements
### Requirement: FedEx Tracking Intake and Labeling
The system SHALL let users add FedEx tracking numbers directly inside the popup, persist them locally, and keep each entry identifiable via an inline-editable label with manual lifecycle controls.

#### Scenario: Accept valid FedEx numbers
- **WHEN** the user submits a FedEx tracking number that is 12–22 digits long
- **THEN** the popup SHALL add it to persistent storage with `{trackingNumber, label:"", createdAt}`
- **AND** the background SHALL schedule that tracking number for the next FedEx scrape run

#### Scenario: Reject invalid FedEx numbers
- **WHEN** the user submits a value that is not 12–22 numeric digits
- **THEN** the popup SHALL display an inline validation error
- **AND** it SHALL NOT write anything to storage

#### Scenario: Inline label editing
- **WHEN** the user clicks a FedEx shipment label inside the popup list
- **THEN** the label SHALL turn into a focused text input with the current value selected
- **AND** pressing Enter or blurring SHALL persist the new label through the background process
- **AND** leaving the label empty SHALL show a ghosted placeholder while storing an empty string
- **AND** pressing Escape SHALL revert edits without saving

#### Scenario: Remove tracking numbers manually
- **WHEN** the user chooses to delete a FedEx tracking number
- **THEN** the popup SHALL remove it from storage immediately
- **AND** subsequent FedEx scrape runs SHALL skip that number

#### Scenario: Duplicate safeguards
- **WHEN** the user submits a FedEx tracking number that already exists in storage
- **THEN** the popup SHALL show an “Already tracking” error and SHALL NOT add a duplicate entry

#### Scenario: Background validation and error surfacing
- **WHEN** the popup requests a FedEx tracking number be added
- **THEN** the background SHALL re-validate the input and return an error message if it fails
- **AND** the popup SHALL display that message inline without modifying local state

### Requirement: FedEx Sequential DOM Scrape
The system SHALL scrape FedEx tracking pages sequentially inside a single background tab, extracting shipment status directly from the rendered DOM without external APIs.

#### Scenario: Single-tab iteration per alarm
- **WHEN** the FedEx alarm fires
- **THEN** the background SHALL open (or reuse) one hidden tab
- **AND** it SHALL navigate to `https://www.fedex.com/fedextrack/?trknbr={trackingNumber}` for each stored tracking number serially
- **AND** after scraping the final number it SHALL close the tab

#### Scenario: DOM readiness wait + timeout
- **WHEN** a FedEx tracking page loads
- **THEN** the content script SHALL poll for the tracking summary container (e.g., `[data-testid="trackingSummary-content"]`) until it appears
- **AND** if it fails to appear before the shared scrape timeout elapses (30 seconds)
- **THEN** the scrape SHALL throw a parse failure with a timeout reason and abort the remaining queue

#### Scenario: Content script emits normalized data
- **WHEN** a FedEx tracking page finishes rendering its status card
- **THEN** the content script SHALL read status text, detail, estimated delivery, and delivered flag from the DOM
- **AND** it SHALL send the normalized payload back to the background script for change detection

#### Scenario: Schema guard on unexpected markup
- **WHEN** required FedEx DOM nodes are missing or malformed
- **THEN** the content script SHALL raise a parse failure via the shared parse-failure pipeline
- **AND** the scrape SHALL abort after logging the offending snippet

#### Scenario: Error banner reporting
- **WHEN** the FedEx tracking page displays an inline error banner (e.g., “We can’t find that tracking number”)
- **THEN** the content script SHALL treat it as a parse failure, capturing the banner text as the reason
- **AND** the popup SHALL expose that reason next to the affected tracking number

#### Scenario: Manual deep link fallback
- **WHEN** a FedEx entry is stored
- **THEN** the popup SHALL provide a “View on FedEx” action that opens the public tracking page with that number so the user can refresh manually if automated scraping fails

#### Scenario: Resume after failure
- **WHEN** a FedEx scrape aborts due to a parse failure or timeout
- **THEN** the system SHALL store which tracking number failed
- **AND** the next alarm SHALL restart from the first tracking number, logging progress for troubleshooting

#### Scenario: Inline scrape status
- **WHEN** the most recent scrape for a tracking number failed
- **THEN** the popup SHALL surface a visible error badge/message on that row so the user knows automation is temporarily unavailable

### Requirement: FedEx Polling and Notification Parity
The system SHALL poll FedEx tracking numbers with the same cadence rules as other carriers and SHALL reuse the existing change-detection + notification pipeline without bespoke logic.

#### Scenario: Polling cadence
- **WHEN** no FedEx tracking number has delivery expected today
- **THEN** the scheduler SHALL set the next FedEx alarm to 120 minutes
- **AND** if at least one undelivered FedEx shipment is expected today during 7AM–10PM local time, the interval SHALL drop to 10 minutes

#### Scenario: Change detection reuse
- **WHEN** normalized FedEx shipments are produced
- **THEN** the background SHALL feed them through the shared `detectChanges` and `saveOrders` routines just like Amazon/AliExpress orders

#### Scenario: Notification parity
- **WHEN** a FedEx shipment changes status
- **THEN** the system SHALL send a browser notification that uses the new status as the title and the label (or tracking number) plus detail/ETA as the body
- **AND** transitioning to delivered SHALL play the notification sound

#### Scenario: First run suppression
- **WHEN** FedEx scraping runs for the first time after the user adds numbers
- **THEN** the system SHALL store the baseline without emitting notifications

#### Scenario: Delivered auto-expiry
- **WHEN** a FedEx shipment has been delivered for 7 or more days (or has a missing `deliveredAt` timestamp)
- **THEN** it SHALL be removed automatically from storage during the next save cycle, matching existing site behavior
- **AND** the popup SHALL no longer display that shipment after auto-expiry

#### Scenario: ToS risk mitigation notice
- **WHEN** a FedEx scrape fails repeatedly due to suspected blocking
- **THEN** the system SHALL encourage the user to open the manual “View on FedEx” link and display a message explaining automated scraping may be temporarily blocked

## MODIFIED Requirements
### Requirement: Multi-Site Order Tracking

The system SHALL support tracking orders from multiple e-commerce sites simultaneously, with each site having independent polling schedules, storage, and notification behavior.

#### Scenario: Concurrent site tracking
- **WHEN** the extension is running
- **THEN** it SHALL maintain separate alarms for Amazon, AliExpress, and FedEx using unique alarm names per site
- **AND** scrape each site independently according to its configured interval

#### Scenario: Site-specific storage
- **WHEN** orders are scraped from a site
- **THEN** they SHALL be stored under a site-specific storage key (Amazon, AliExpress, or FedEx) that also tracks scrape metadata (last alarm time, in-progress flag)
- **AND** change detection SHALL compare against only that site's previous state

### Requirement: Popup displays last check time, in-flight count, and FedEx label controls
The system SHALL display per-site last check time and in-flight order count in the popup, and SHALL present FedEx-specific controls for label editing and manual management.

#### Scenario: Last check time available
- **GIVEN** a site (Amazon, AliExpress, or FedEx) has a recorded scrape start timestamp
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

#### Scenario: FedEx label placeholder
- **WHEN** a stored FedEx shipment has an empty label
- **THEN** the popup SHALL display ghosted placeholder text (“Add label”) in the label area
- **AND** clicking or focusing that placeholder SHALL enter edit mode as described above

#### Scenario: FedEx label persistence errors
- **WHEN** the popup attempts to persist a FedEx label edit and the background rejects it (e.g., label too long)
- **THEN** the popup SHALL show an inline error and revert to the previous label value
