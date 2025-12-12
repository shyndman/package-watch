## 1. Dependencies

- [ ] 1.1 Add `mqtt` package to dependencies
- [ ] 1.2 Add `ws://ha-mosquitto-ws.don/*` to `host_permissions` in `wxt.config.ts`

## 2. Test Infrastructure

- [ ] 2.1 Add `vitest` dev dependency (v4.0.15)
- [ ] 2.2 Add `@webext-core/fake-browser` dev dependency (v1.3.2)
- [ ] 2.3 Create `vitest.config.ts` (import `WxtVitest` from `wxt/testing/vitest-plugin`)
- [ ] 2.4 Add `test` script to `package.json`

## 3. Types

- [ ] 3.1 Add `PendingMqttEvent` interface to `lib/types.ts`

## 4. Storage

- [ ] 4.1 Add `PENDING_MQTT_KEY` constant (`local:pendingMqttDeliveries`) to `lib/storage.ts`
- [ ] 4.2 Add functions: `getPendingMqttEvents()`, `savePendingMqttEvents()`
- [ ] 4.3 Write tests for pending queue storage functions (`lib/storage.test.ts` - new file)

## 5. MQTT Client

- [ ] 5.1 Create `lib/mqtt.ts` with `MQTT_BROKER_URL` constant
- [ ] 5.2 Implement `publishDeliveryEvent(items: string[], vendor: string): Promise<void>`
- [ ] 5.3 Implement `publishDeliveryEvents(events: PendingMqttEvent[]): Promise<PendingMqttEvent[]>` (returns failed events)
- [ ] 5.4 Write tests for MQTT client (`lib/mqtt.test.ts` - new file, mock mqtt.js)

## 6. Integration

- [ ] 6.1 In `handleScrapedOrders()`: process pending queue before new deliveries
- [ ] 6.2 In `handleScrapedOrders()`: for changed orders with `isDelivered === true`, publish to MQTT
- [ ] 6.3 On publish failure, add to pending queue
- [ ] 6.4 Filter out expired events (>24h) when processing pending queue
- [ ] 6.5 Write integration tests for handleScrapedOrders MQTT flow

## 7. Validation

- [ ] 7.1 Manual test: verify event appears in MQTT broker (mosquitto_sub)
- [ ] 7.2 Manual test: verify retry behavior when broker is down
