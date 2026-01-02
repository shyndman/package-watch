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
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export type AliExpressDependencies = {
  openOrderListTab: (site: OrderSite, url: string) => Promise<number | null>;
  handleScrapeFailure: (site: OrderSite) => void;
  closeScrapeTab: (tabId: number | undefined) => Promise<void>;
  clearScrapeTimeout: (site: OrderSite) => void;
  processOrdersForSite: (site: OrderSite, orders: OrderStatus[]) => Promise<void>;
  sendAuthFailedNotification: () => Promise<void>;
  navigateScrapeTab: (tabId: number, url: string) => Promise<void>;
};

type PendingRequest<T> = {
  resolve: (result: T | null) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  expectedOrderId: string;
};

/** Single pending request for the current scrape session (one at a time, sequential navigation) */
let pendingRequest: PendingRequest<AliExpressOrderDetailsResult | AliExpressTrackingResult> | null =
  null;

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
  await deps.closeScrapeTab(tabId);
  await deps.sendAuthFailedNotification();
  deps.handleScrapeFailure(ALIEXPRESS_SITE);
}

export async function handleAliExpressOrdersDiscovered(
  orders: AliExpressDiscoveredOrder[],
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  deps.clearScrapeTimeout(ALIEXPRESS_SITE);

  if (!tabId) {
    deps.handleScrapeFailure(ALIEXPRESS_SITE);
    return;
  }

  try {
    const orderDetailsResults = await scrapeAliExpressOrderDetailsForOrders(orders, tabId, deps);
    const trackingResults = await scrapeAliExpressTrackingForOrders(orders, tabId, deps);
    const orderStatuses = buildAliExpressOrderStatuses(orders, orderDetailsResults, trackingResults);
    await deps.processOrdersForSite(ALIEXPRESS_SITE, orderStatuses);
  } finally {
    await deps.closeScrapeTab(tabId);
  }
}

export function handleAliExpressOrderDetailsMessage(
  details: AliExpressOrderDetailsResult,
  _tabId: number | undefined,
  _deps: AliExpressDependencies
): void {
  if (!pendingRequest) {
    console.warn('[AliExpress Orders] Order details result with no pending request');
    return;
  }

  clearTimeout(pendingRequest.timeoutId);

  if (pendingRequest.expectedOrderId !== details.orderId) {
    console.warn('[AliExpress Orders] Order details order ID mismatch', {
      expected: pendingRequest.expectedOrderId,
      received: details.orderId,
    });
  }

  const { resolve } = pendingRequest;
  pendingRequest = null;
  resolve(details);
}

export function handleAliExpressTrackingMessage(
  tracking: AliExpressTrackingResult,
  _tabId: number | undefined,
  _deps: AliExpressDependencies
): void {
  if (!pendingRequest) {
    console.warn('[AliExpress Orders] Tracking result with no pending request');
    return;
  }

  clearTimeout(pendingRequest.timeoutId);

  if (pendingRequest.expectedOrderId !== tracking.orderId) {
    console.warn('[AliExpress Orders] Tracking order ID mismatch', {
      expected: pendingRequest.expectedOrderId,
      received: tracking.orderId,
    });
  }

  const { resolve } = pendingRequest;
  pendingRequest = null;
  resolve(tracking);
}

export async function handleAliExpressOrderDetailsParseFailure(
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  if (!pendingRequest) {
    await deps.closeScrapeTab(tabId);
    return;
  }

  clearTimeout(pendingRequest.timeoutId);
  const { resolve } = pendingRequest;
  pendingRequest = null;
  await deps.closeScrapeTab(tabId);
  resolve(null);
}

export async function handleAliExpressTrackingParseFailure(
  tabId: number | undefined,
  deps: AliExpressDependencies
): Promise<void> {
  if (!pendingRequest) {
    await deps.closeScrapeTab(tabId);
    return;
  }

  clearTimeout(pendingRequest.timeoutId);
  const { resolve } = pendingRequest;
  pendingRequest = null;
  await deps.closeScrapeTab(tabId);
  resolve(null);
}

async function scrapeAliExpressOrderDetailsForOrders(
  orders: AliExpressDiscoveredOrder[],
  tabId: number,
  deps: AliExpressDependencies
): Promise<AliExpressOrderDetailsResult[]> {
  const results: AliExpressOrderDetailsResult[] = [];

  for (const order of orders) {
    const detailsUrl = order.orderDetailsUrl ?? buildAliExpressOrderDetailsUrl(order.orderId);
    if (!detailsUrl) {
      continue;
    }

    const details = await scrapeAliExpressOrderDetails(detailsUrl, order.orderId, tabId, deps);
    if (details) {
      results.push(details);
    }
  }

  return results;
}

async function scrapeAliExpressOrderDetails(
  detailsUrl: string,
  orderId: string,
  tabId: number,
  deps: AliExpressDependencies
): Promise<AliExpressOrderDetailsResult | null> {
  await deps.navigateScrapeTab(tabId, detailsUrl);
  return waitForScrapeResult<AliExpressOrderDetailsResult>(orderId, tabId, deps);
}

async function scrapeAliExpressTrackingForOrders(
  orders: AliExpressDiscoveredOrder[],
  tabId: number,
  deps: AliExpressDependencies
): Promise<AliExpressTrackingResult[]> {
  const results: AliExpressTrackingResult[] = [];

  for (const order of orders) {
    if (order.highLevelStatus === 'Completed') {
      continue;
    }

    const trackingUrl = order.trackingUrl ?? buildAliExpressTrackingUrl(order.orderId);
    if (!trackingUrl) {
      continue;
    }

    const tracking = await scrapeAliExpressTracking(trackingUrl, order.orderId, tabId, deps);
    if (tracking) {
      results.push(tracking);
    }
  }

  return results;
}

async function scrapeAliExpressTracking(
  trackingUrl: string,
  orderId: string,
  tabId: number,
  deps: AliExpressDependencies
): Promise<AliExpressTrackingResult | null> {
  await deps.navigateScrapeTab(tabId, trackingUrl);
  return waitForScrapeResult<AliExpressTrackingResult>(orderId, tabId, deps);
}

function waitForScrapeResult<T>(
  orderId: string,
  tabId: number,
  deps: AliExpressDependencies
): Promise<T | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingRequest = null;
      void deps.closeScrapeTab(tabId);
      resolve(null);
    }, SCRAPE_TIMEOUT_MS);

    pendingRequest = {
      resolve: resolve as (result: AliExpressOrderDetailsResult | AliExpressTrackingResult | null) => void,
      timeoutId,
      expectedOrderId: orderId,
    };
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
      deliveredAt: null,
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

  const today = Temporal.Now.plainDateISO();
  let deliveryDate = Temporal.PlainDate.from({
    year: today.year,
    month,
    day: parseInt(dayRaw, 10),
  });

  // If delivery date is more than a month in the past, assume it's next year
  if (today.since(deliveryDate).total('days') > 30) {
    deliveryDate = deliveryDate.with({ year: today.year + 1 });
  }

  return Temporal.PlainDate.compare(deliveryDate, today) === 0;
}

function buildAliExpressTrackingUrl(orderId: string): string {
  return `${ALIEXPRESS_TRACKING_URL_BASE}${orderId}`;
}

function buildAliExpressOrderDetailsUrl(orderId: string): string {
  return `${ALIEXPRESS_ORDER_DETAILS_URL_BASE}${orderId}`;
}
