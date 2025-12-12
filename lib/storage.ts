import { storage } from '@wxt-dev/storage';
import type { OrderStatus, StoredOrderState } from './types';

const ORDER_STATE_KEY = 'local:orderState';

/**
 * Get stored order state.
 */
export async function getStoredOrders(): Promise<StoredOrderState> {
  const state = await storage.getItem<StoredOrderState>(ORDER_STATE_KEY);
  return state ?? { orders: {}, lastChecked: 0 };
}

/**
 * Save order state.
 */
export async function saveOrders(orders: OrderStatus[]): Promise<void> {
  const ordersRecord: Record<string, OrderStatus> = {};
  for (const order of orders) {
    ordersRecord[order.orderId] = order;
  }
  await storage.setItem<StoredOrderState>(ORDER_STATE_KEY, {
    orders: ordersRecord,
    lastChecked: Date.now(),
  });
}

/**
 * Compare new orders against stored state and return changed orders.
 */
export async function detectChanges(
  newOrders: OrderStatus[]
): Promise<{ changed: OrderStatus[]; isFirstRun: boolean }> {
  const stored = await getStoredOrders();
  const isFirstRun = Object.keys(stored.orders).length === 0;

  const changed: OrderStatus[] = [];

  for (const order of newOrders) {
    const prev = stored.orders[order.orderId];
    if (!prev) {
      // New order we haven't seen before
      if (!isFirstRun) {
        changed.push(order);
      }
    } else if (prev.status !== order.status) {
      // Status changed
      changed.push(order);
    }
  }

  return { changed, isFirstRun };
}
