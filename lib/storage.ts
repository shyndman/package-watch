import { storage } from '@wxt-dev/storage';
import type { OrderSite, OrderStatus, StoredOrderState } from './types';

type StorageKey = `local:${string}`;

const ORDER_STATE_KEYS: Record<OrderSite, StorageKey> = {
  amazon: 'local:amazonOrderState',
  aliexpress: 'local:aliexpressOrderState',
};

const LEGACY_AMAZON_STATE_KEY: StorageKey = 'local:orderState';

const DELIVERED_TERMINAL_BY_SITE: Record<OrderSite, boolean> = {
  amazon: true,
  aliexpress: true,
};

function getOrderStateKey(site: OrderSite): StorageKey {
  return ORDER_STATE_KEYS[site];
}

/**
 * Get stored order state.
 */
export async function getStoredOrders(site: OrderSite): Promise<StoredOrderState> {
  const key = getOrderStateKey(site);
  const state = await storage.getItem<StoredOrderState>(key);
  if (state) {
    return state;
  }

  if (site === 'amazon') {
    const legacy = await storage.getItem<StoredOrderState>(LEGACY_AMAZON_STATE_KEY);
    if (legacy) {
      await storage.setItem<StoredOrderState>(key, legacy);
      return legacy;
    }
  }

  return { orders: {}, lastChecked: 0 };
}

/**
 * Save order state.
 */
export async function saveOrders(site: OrderSite, orders: OrderStatus[]): Promise<void> {
  const ordersRecord: Record<string, OrderStatus> = {};
  for (const order of orders) {
    ordersRecord[order.orderId] = order;
  }
  await storage.setItem<StoredOrderState>(getOrderStateKey(site), {
    orders: ordersRecord,
    lastChecked: Date.now(),
  });
}

/**
 * Compare new orders against stored state and return changed orders.
 */
export async function detectChanges(
  newOrders: OrderStatus[],
  site: OrderSite
): Promise<{
  changed: OrderStatus[];
  isFirstRun: boolean;
  previousOrders: Record<string, OrderStatus>;
}> {
  const stored = await getStoredOrders(site);
  const isFirstRun = Object.keys(stored.orders).length === 0;
  const treatDeliveredAsTerminal = DELIVERED_TERMINAL_BY_SITE[site];

  const changed: OrderStatus[] = [];

  for (const order of newOrders) {
    const prev = stored.orders[order.orderId];
    if (!prev) {
      // New order we haven't seen before
      if (!isFirstRun) {
        changed.push(order);
      }
    } else if (treatDeliveredAsTerminal && prev.isDelivered) {
      // Already delivered, nothing more to track
      continue;
    } else if (prev.status !== order.status) {
      // Status changed
      changed.push(order);
    }
  }

  return { changed, isFirstRun, previousOrders: stored.orders };
}
