import type {
  AliExpressDiscoveredOrder,
  AliExpressOrderDetailsResult,
  AliExpressTrackingResult,
  OrderSite,
  OrderStatus,
} from '../types';
import { ALIEXPRESS_SITE, SCRAPE_TIMEOUT_MS, getSiteLabel } from './scheduler';

const ALIEXPRESS_ORDERS_URL = 'https://www.aliexpress.com/p/order/index.html';
const ALIEXPRESS_ORDER_DETAILS_URL_BASE =
  'https://www.aliexpress.com/p/order/detail.html?orderId=';
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
  openOrderDetailsTab: (url: string) => Promise<number | null>;
  openTrackingTab: (url: string) => Promise<number | null>;
};

type PendingOrderDetailsRequest = {
  resolve: (result: AliExpressOrderDetailsResult | null) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  expectedOrderId: string;
};

const pendingAliExpressOrderDetails = new Map<number, PendingOrderDetailsRequest>();
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

  const orderDetailsResults = await scrapeAliExpressOrderDetailsForOrders(orders, deps);
  const trackingResults = await scrapeAliExpressTrackingForOrders(orders, deps);
  const orderStatuses = buildAliExpressOrderStatuses(orders, orderDetailsResults, trackingResults);
  await deps.processOrdersForSite(ALIEXPRESS_SITE, orderStatuses);
}

export function handleAliExpressOrderDetailsMessage(
  details: AliExpressOrderDetailsResult,
  tabId: number | undefined,
  deps: AliExpressDependencies
): void {
  if (!tabId) {
    return;
  }

  const pending = pendingAliExpressOrderDetails.get(tabId);
  if (!pending) {
    console.warn('[AliExpress Orders] Order details result for unknown tab', tabId);
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingAliExpressOrderDetails.delete(tabId);
  void deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);

  if (pending.expectedOrderId !== details.orderId) {
    console.warn('[AliExpress Orders] Order details order ID mismatch', {
      expected: pending.expectedOrderId,
      received: details.orderId,
    });
  }

  pending.resolve(details);
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

export async function handleAliExpressOrderDetailsParseFailure(
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  if (!tabId) {
    return;
  }

  const pending = pendingAliExpressOrderDetails.get(tabId);
  if (!pending) {
    await deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingAliExpressOrderDetails.delete(tabId);
  await deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
  pending.resolve(null);
}

export async function handleAliExpressTrackingParseFailure(
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  if (!tabId) {
    return;
  }

  const pending = pendingAliExpressTracking.get(tabId);
  if (!pending) {
    await deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
    return;
  }

  clearTimeout(pending.timeoutId);
  pendingAliExpressTracking.delete(tabId);
  await deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
  pending.resolve(null);
}

async function scrapeAliExpressOrderDetailsForOrders(
  orders: AliExpressDiscoveredOrder[],
  deps: AliExpressDependencies
): Promise<AliExpressOrderDetailsResult[]> {
  const results: AliExpressOrderDetailsResult[] = [];

  for (const order of orders) {
    const detailsUrl = order.orderDetailsUrl ?? buildAliExpressOrderDetailsUrl(order.orderId);
    if (!detailsUrl) {
      continue;
    }

    const details = await scrapeAliExpressOrderDetails(detailsUrl, order.orderId, deps);
    if (details) {
      results.push(details);
    }
  }

  return results;
}

async function scrapeAliExpressOrderDetails(
  detailsUrl: string,
  orderId: string,
  deps: AliExpressDependencies
): Promise<AliExpressOrderDetailsResult | null> {
  const tabId = await deps.openOrderDetailsTab(detailsUrl);
  if (!tabId) {
    return null;
  }

  return waitForAliExpressOrderDetails(tabId, orderId, deps);
}

function waitForAliExpressOrderDetails(
  tabId: number,
  orderId: string,
  deps: AliExpressDependencies
): Promise<AliExpressOrderDetailsResult | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingAliExpressOrderDetails.delete(tabId);
      void deps.closeScrapeTab(ALIEXPRESS_SITE, tabId);
      resolve(null);
    }, SCRAPE_TIMEOUT_MS);

    pendingAliExpressOrderDetails.set(tabId, {
      resolve,
      timeoutId,
      expectedOrderId: orderId,
    });
  });
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
  orderDetailsResults: AliExpressOrderDetailsResult[],
  trackingResults: AliExpressTrackingResult[]
): OrderStatus[] {
  const detailsByOrderId = new Map(
    orderDetailsResults.map((details) => [details.orderId, details])
  );
  const trackingByOrderId = new Map(
    trackingResults.map((tracking) => [tracking.orderId, tracking])
  );

  return orders.map((order) => {
    const tracking = trackingByOrderId.get(order.orderId) ?? null;
    const details = detailsByOrderId.get(order.orderId) ?? null;
    const statusDetail = buildAliExpressStatusDetail(tracking);
    const estimatedDelivery = tracking?.estimatedDelivery ?? null;
    const productTitles = details?.productTitle ? [details.productTitle] : [];
    const productUrls = details?.productUrl ? [details.productUrl] : [];

    if (!details) {
      console.warn('[AliExpress Orders] Missing order details for', order.orderId);
    }

    return {
      site: ALIEXPRESS_SITE,
      orderId: order.orderId,
      status: tracking?.currentStatus ?? order.highLevelStatus,
      statusDetail,
      productTitles,
      productUrls,
      orderUrl: order.orderDetailsUrl ?? buildAliExpressOrderDetailsUrl(order.orderId),
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

function buildAliExpressOrderDetailsUrl(orderId: string): string {
  return `${ALIEXPRESS_ORDER_DETAILS_URL_BASE}${orderId}`;
}
