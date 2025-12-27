import type {
  AliExpressDiscoveredOrder,
  AliExpressTrackingResult,
  OrderSite,
  OrderStatus,
} from '../types';
import { ALIEXPRESS_SITE, SCRAPE_TIMEOUT_MS, getSiteLabel } from './scheduler';

const ALIEXPRESS_ORDERS_URL = 'https://www.aliexpress.com/p/order/index.html';
const ALIEXPRESS_TRACKING_URL_BASE =
  'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=';

const ESTIMATED_DELIVERY_REGEX = /([A-Za-z]{3})\s+(\d{1,2})/;
const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

type PendingTrackingRequest = {
  resolve: (result: AliExpressTrackingResult | null) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  expectedOrderId: string;
};

type AliExpressDependencies = {
  openOrderListTab: (site: OrderSite, url: string) => Promise<number | null>;
  handleScrapeFailure: (site: OrderSite) => void;
  closeScrapeTab: (site: OrderSite, tabId: number | undefined) => Promise<void>;
  clearScrapeTimeout: (site: OrderSite) => void;
  processOrdersForSite: (site: OrderSite, orders: OrderStatus[]) => Promise<void>;
  sendAuthFailedNotification: () => Promise<void>;
  openTrackingTab: (url: string) => Promise<number | null>;
};

const pendingAliExpressTracking = new Map<number, PendingTrackingRequest>();

export async function performAliExpressScrape(deps: AliExpressDependencies): Promise<void> {
  console.log(`[${getSiteLabel(ALIEXPRESS_SITE)}] Opening orders page in background tab`);
  const tabId = await deps.openOrderListTab(ALIEXPRESS_SITE, ALIEXPRESS_ORDERS_URL);
  if (!tabId) {
    deps.handleScrapeFailure(ALIEXPRESS_SITE);
  }
}

export async function handleAliExpressAuthFailed(
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  deps.clearScrapeTimeout(ALIEXPRESS_SITE);
  await deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
  await deps.sendAuthFailedNotification();
  deps.handleScrapeFailure(ALIEXPRESS_SITE);
}

export async function handleAliExpressOrdersDiscovered(
  orders: AliExpressDiscoveredOrder[],
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  deps.clearScrapeTimeout(ALIEXPRESS_SITE);
  await deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);

  const trackingResults = await scrapeAliExpressTrackingForOrders(orders, deps);
  const orderStatuses = buildAliExpressOrderStatuses(orders, trackingResults);
  await deps.processOrdersForSite(ALIEXPRESS_SITE, orderStatuses);
}

export function handleAliExpressTrackingMessage(
  tracking: AliExpressTrackingResult,
  tabId: number | undefined,
  deps: AliExpressDependencies
): void {
  if (!tabId) {
    return;
  }

  const pending = pendingAliExpressTracking.get(tabId);
  if (!pending) {
    console.warn('[AliExpress Orders] Tracking result for unknown tab', tabId);
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingAliExpressTracking.delete(tabId);
  void deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);

  if (pending.expectedOrderId !== tracking.orderId) {
    console.warn('[AliExpress Orders] Tracking order ID mismatch', {
      expected: pending.expectedOrderId,
      received: tracking.orderId,
    });
  }

  pending.resolve(tracking);
}

async function scrapeAliExpressTrackingForOrders(
  orders: AliExpressDiscoveredOrder[],
  deps: AliExpressDependencies
): Promise<AliExpressTrackingResult[]> {
  const results: AliExpressTrackingResult[] = [];

  for (const order of orders) {
    if (order.highLevelStatus === 'Completed') {
      continue;
    }

    const trackingUrl = order.trackingUrl ?? buildAliExpressTrackingUrl(order.orderId);
    const tracking = trackingUrl
      ? await scrapeAliExpressTracking(trackingUrl, order.orderId, deps)
      : null;

    if (tracking) {
      results.push(tracking);
    }
  }

  return results;
}

async function scrapeAliExpressTracking(
  trackingUrl: string,
  orderId: string,
  deps: AliExpressDependencies
): Promise<AliExpressTrackingResult | null> {
  const tabId = await deps.openTrackingTab(trackingUrl);
  if (!tabId) {
    return null;
  }

  return waitForAliExpressTracking(tabId, orderId, deps);
}

function waitForAliExpressTracking(
  tabId: number,
  orderId: string,
  deps: AliExpressDependencies
): Promise<AliExpressTrackingResult | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingAliExpressTracking.delete(tabId);
      void deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
      resolve(null);
    }, SCRAPE_TIMEOUT_MS);

    pendingAliExpressTracking.set(tabId, {
      resolve,
      timeoutId,
      expectedOrderId: orderId,
    });
  });
}

function buildAliExpressOrderStatuses(
  orders: AliExpressDiscoveredOrder[],
  trackingResults: AliExpressTrackingResult[]
): OrderStatus[] {
  const trackingByOrderId = new Map(
    trackingResults.map((tracking) => [tracking.orderId, tracking])
  );

  return orders.map((order) => {
    const tracking = trackingByOrderId.get(order.orderId) ?? null;
    const statusDetail = buildAliExpressStatusDetail(tracking);
    const estimatedDelivery = tracking?.estimatedDelivery ?? null;

    return {
      site: ALIEXPRESS_SITE,
      orderId: order.orderId,
      status: tracking?.currentStatus ?? order.highLevelStatus,
      statusDetail,
      productTitles: order.productTitles,
      productUrls: order.productUrls,
      orderUrl: order.trackingUrl ?? buildAliExpressTrackingUrl(order.orderId),
      orderDate: order.orderDate,
      isDeliveryExpectedToday: isEstimatedDeliveryToday(estimatedDelivery),
      isDelivered: tracking?.isDelivered ?? order.highLevelStatus === 'Completed',
    };
  });
}

function buildAliExpressStatusDetail(tracking: AliExpressTrackingResult | null): string {
  if (!tracking) {
    return '';
  }

  const parts = [tracking.statusDetail, tracking.timestamp].filter(Boolean);
  return parts.join(' ');
}

function isEstimatedDeliveryToday(estimatedDelivery: string | null): boolean {
  if (!estimatedDelivery) {
    return false;
  }

  const match = estimatedDelivery.match(ESTIMATED_DELIVERY_REGEX);
  if (!match) {
    return false;
  }

  const [, monthAbbr, dayRaw] = match;
  const month = MONTH_MAP[monthAbbr.toLowerCase()];
  if (month === undefined) {
    return false;
  }

  const now = new Date();
  const deliveryDate = new Date(now.getFullYear(), month, parseInt(dayRaw, 10));
  if (deliveryDate.getMonth() < now.getMonth() - 1) {
    deliveryDate.setFullYear(now.getFullYear() + 1);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return deliveryDate.getTime() === today.getTime();
}

function buildAliExpressTrackingUrl(orderId: string): string {
  return `${ALIEXPRESS_TRACKING_URL_BASE}${orderId}`;
}
