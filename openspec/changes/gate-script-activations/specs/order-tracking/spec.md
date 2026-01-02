## ADDED Requirements

### Requirement: Background-Controlled Content Script Activation

Content scripts SHALL remain inert by default and only activate when the background script confirms the tab is a controlled scrape session. This prevents the extension from interfering with user-initiated browsing on matching URLs.

#### Scenario: User opens matching URL manually
- **WHEN** a user manually navigates to a URL that matches a content script pattern (e.g., AliExpress order page)
- **THEN** the content script SHALL query the background for activation status
- **AND** the background SHALL return false (tab not tracked)
- **AND** the content script SHALL remain inert and perform no scraping or messaging

#### Scenario: Background opens scrape tab
- **WHEN** the background script opens a tab for scraping
- **THEN** the tab ID SHALL be added to the tracked scrape tabs set
- **AND** when the content script queries for activation status
- **THEN** the background SHALL return true
- **AND** the content script SHALL proceed with scraping

#### Scenario: Scrape tab closed
- **WHEN** a scrape tab is closed (normally or due to error/timeout)
- **THEN** the tab ID SHALL be removed from the tracked scrape tabs set
