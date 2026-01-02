## 1. Implementation

- [x] 1.1 Add `deliveredAt: string | null` field to `OrderStatus` in `lib/types.ts`
- [x] 1.2 Update `entrypoints/amazon-orders.content.ts` to include `deliveredAt: null` in returned `OrderStatus`
- [x] 1.3 Update `lib/background/aliexpress.ts` `buildOrderStatuses` to include `deliveredAt: null`
- [x] 1.4 Add `DELIVERED_ORDER_RETENTION` constant using `Temporal.Duration` in `lib/storage.ts`
- [x] 1.5 Update `saveOrders` to set `deliveredAt` when `isDelivered` first becomes true
- [x] 1.6 Update `saveOrders` to filter out expired orders before writing

## 2. Validation

- [x] 2.1 Create `lib/storage.test.ts` with tests for `deliveredAt` stamping on delivery detection
- [x] 2.2 Add tests for expiration filtering (7+ days, missing timestamp)
- [x] 2.3 Run `pnpm typecheck` to verify no type errors
