## ADDED Requirements

### Requirement: MQTT Delivery Event Publishing
The system SHALL publish an MQTT event when a package delivery is detected.

#### Scenario: Successful delivery event publish
- **WHEN** an order's status changes to "delivered"
- **THEN** the system connects to `ws://ha-mosquitto-ws.don`
- **AND** publishes to topic `deliveries/event/amazon/state`
- **AND** the payload contains `event_type: "delivered"`
- **AND** the payload contains `items` as an array of product titles
- **AND** the payload contains `vendor: "amazon"`
- **AND** the connection is closed after publishing

#### Scenario: Multiple items in single delivery
- **WHEN** an order with multiple products is delivered
- **THEN** the `items` array contains all product titles from that order

### Requirement: MQTT Publish Retry on Failure
The system SHALL queue failed MQTT publishes for retry on the next scrape cycle.

#### Scenario: Broker unreachable on initial publish
- **WHEN** MQTT publish fails due to connection error
- **THEN** the event is added to a pending queue in storage
- **AND** the pending event includes orderId, productTitles, vendor, and failedAt timestamp
- **AND** browser notifications still proceed normally

#### Scenario: Retry pending events on scrape cycle
- **WHEN** a new scrape cycle begins
- **AND** pending events exist in the queue
- **THEN** the system attempts to publish pending events before processing new deliveries
- **AND** successfully published events are removed from the queue

#### Scenario: Retry fails again
- **WHEN** a pending event fails to publish during retry
- **THEN** the event remains in the pending queue
- **AND** will be retried on the next scrape cycle
- **AND** scrape processing continues normally

#### Scenario: Pending event TTL expiration
- **WHEN** a pending event's failedAt timestamp is older than 24 hours
- **THEN** the event is removed from the queue without attempting to publish

### Requirement: MQTT Failures Do Not Block Scraping
The system SHALL continue normal scrape operations regardless of MQTT failures.

#### Scenario: MQTT failure isolation
- **WHEN** MQTT connection or publish fails
- **THEN** the error is logged
- **AND** browser notifications proceed normally
- **AND** order state is saved normally
- **AND** the next scrape is scheduled normally
