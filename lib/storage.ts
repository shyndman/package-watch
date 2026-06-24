import { storage } from '@wxt-dev/storage';
import type { OrderSite, OrderStatus, StoredOrderState, StoredScrapeStatus } from './types';

/** Delivered orders are removed from storage after this duration */
const DELIVERED_ORDER_RETENTION = Temporal.Duration.from({ days: 7 });

type StorageKey = `local:${string}`;

const ORDER_STATE_KEYS: Record<OrderSite, StorageKey> = {
  amazon: 'local:amazonOrderState',
  aliexpress: 'local:aliexpressOrderState',
  ebay: 'local:ebayOrderState',
};

const SCRAPE_STATUS_KEYS: Record<OrderSite, StorageKey> = {
  amazon: 'local:amazonScrapeStatus',
  aliexpress: 'local:aliexpressScrapeStatus',
  ebay: 'local:ebayScrapeStatus',
};

const LEGACY_AMAZON_STATE_KEY: StorageKey = 'local:orderState';

const DELIVERED_TERMINAL_BY_SITE: Record<OrderSite, boolean> = {
  amazon: true,
  aliexpress: true,
  ebay: true,
};

const DEFAULT_SCRAPE_STATUS: StoredScrapeStatus = {
  lastAlarmFiredAt: null,
  isScrapeInProgress: false,
};

function getOrderStateKey(site: OrderSite): StorageKey {
  return ORDER_STATE_KEYS[site];
}

function getScrapeStatusKey(site: OrderSite): StorageKey {
  return SCRAPE_STATUS_KEYS[site];
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

export async function getScrapeStatus(site: OrderSite): Promise<StoredScrapeStatus> {
  const key = getScrapeStatusKey(site);
  const status = await storage.getItem<StoredScrapeStatus>(key);
  if (status) {
    return status;
  }

  return { ...DEFAULT_SCRAPE_STATUS };
}

export async function updateScrapeStatus(
  site: OrderSite,
  updates: Partial<StoredScrapeStatus>
): Promise<StoredScrapeStatus> {
  const current = await getScrapeStatus(site);
  const next = { ...current, ...updates };
  await storage.setItem<StoredScrapeStatus>(getScrapeStatusKey(site), next);
  return next;
}

function isOrderCancelled(order: OrderStatus): boolean {
  return order.status.toLowerCase().includes('cancelled');
}

/**
 * Save order state.
 *
 * Delivered orders are immutable: once an order is marked delivered, its stored
 * state is frozen and will not be overwritten by new scrape data.
 *
 * Cancelled orders are never stored.
 *
 * Expired orders (delivered 7+ days ago, or delivered with missing deliveredAt)
 * are filtered out during writes.
 */
export async function saveOrders(site: OrderSite, orders: OrderStatus[]): Promise<void> {
  const stored = await getStoredOrders(site);
  const ordersRecord = { ...stored.orders };
  const now = Temporal.Now.instant();

  // Merge incoming orders, stamping deliveredAt on first delivery detection
  for (const order of orders) {
    // Never store cancelled orders
    if (isOrderCancelled(order)) {
      delete ordersRecord[order.orderId];
      continue;
    }

    const existing = ordersRecord[order.orderId];
    if (existing?.isDelivered) {
      // Already delivered, preserve existing state (immutable)
      continue;
    }

    if (order.isDelivered && !existing?.deliveredAt) {
      // First time seeing this order as delivered - stamp deliveredAt
      ordersRecord[order.orderId] = {
        ...order,
        deliveredAt: now.toString(),
      };
    } else {
      ordersRecord[order.orderId] = order;
    }
  }

  // Filter out expired orders before writing
  const filteredOrders: Record<string, OrderStatus> = {};
  for (const [orderId, order] of Object.entries(ordersRecord)) {
    if (!isOrderExpired(order, now)) {
      filteredOrders[orderId] = order;
    }
  }

  await storage.setItem<StoredOrderState>(getOrderStateKey(site), {
    orders: filteredOrders,
    lastChecked: Date.now(),
  });
}

/**
 * Check if a delivered order has expired.
 * Expired means: isDelivered AND (deliveredAt is null OR older than retention period)
 */
function isOrderExpired(order: OrderStatus, now: Temporal.Instant): boolean {
  if (!order.isDelivered) {
    return false;
  }

  if (!order.deliveredAt) {
    // Legacy delivered order without timestamp - expire immediately
    return true;
  }

  const deliveredAt = Temporal.Instant.from(order.deliveredAt);
  const elapsed = now.since(deliveredAt);
  return Temporal.Duration.compare(elapsed, DELIVERED_ORDER_RETENTION) >= 0;
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
    // Never report cancelled orders as changed
    if (isOrderCancelled(order)) {
      continue;
    }

    const prev = stored.orders[order.orderId];
    if (!prev) {
      // New order we haven't seen before
      // Skip delivered orders without history - likely expired entries reappearing
      if (!isFirstRun && !order.isDelivered) {
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
