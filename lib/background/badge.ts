import type { OrderSite, StoredOrderState } from '../types';
import { getStoredOrders } from '../storage';

const SUPPORTED_SITES: readonly OrderSite[] = ['amazon', 'aliexpress'] as const;

const INFLIGHT_BADGE_MAX = 99;
const INFLIGHT_BADGE_CAPPED_TEXT = '99+';
const INFLIGHT_BADGE_BACKGROUND_COLOR = '#fcc419';

type BrowserActionApi = {
  setBadgeText(details: { text?: string | null; tabId?: number; windowId?: number }): Promise<void>;
  setBadgeBackgroundColor(details: { color: string | number[]; tabId?: number }): Promise<void>;
};

function getDefaultActionApi(): BrowserActionApi {
  const b = browser as unknown as {
    action?: BrowserActionApi;
    browserAction?: BrowserActionApi;
  };

  const api = b.action ?? b.browserAction;
  if (!api) {
    throw new Error('No browser action API available');
  }

  return api;
}

export function countInFlightOrders(stored: StoredOrderState): number {
  return Object.values(stored.orders).filter((order) => !order.isDelivered).length;
}

export function formatInFlightBadgeText(count: number): string {
  if (count <= 0) {
    return '';
  }

  if (count > INFLIGHT_BADGE_MAX) {
    return INFLIGHT_BADGE_CAPPED_TEXT;
  }

  return String(count);
}

async function getCombinedInFlightCount(
  fetchStoredOrders: (site: OrderSite) => Promise<StoredOrderState>
): Promise<number> {
  const all = await Promise.all(SUPPORTED_SITES.map((site) => fetchStoredOrders(site)));
  return all.reduce((sum, stored) => sum + countInFlightOrders(stored), 0);
}

export async function updateInFlightBadge(
  deps: {
    fetchStoredOrders?: (site: OrderSite) => Promise<StoredOrderState>;
    actionApi?: BrowserActionApi;
  } = {}
): Promise<void> {
  const fetchStoredOrders = deps.fetchStoredOrders ?? getStoredOrders;
  const actionApi = deps.actionApi ?? getDefaultActionApi();

  const inFlightCount = await getCombinedInFlightCount(fetchStoredOrders);
  const text = formatInFlightBadgeText(inFlightCount);

  await actionApi.setBadgeBackgroundColor({ color: INFLIGHT_BADGE_BACKGROUND_COLOR });
  await actionApi.setBadgeText({ text });
}
