import type {
  AliExpressDiscoveredOrder,
  AliExpressTrackingResult,
  MessageType,
  OrderSite,
  OrderStatus,
} from '../lib/types';
import { detectChanges, saveOrders } from '../lib/storage';

const AMAZON_SITE: OrderSite = 'amazon';
const ALIEXPRESS_SITE: OrderSite = 'aliexpress';

const AMAZON_ALARM_NAME = 'scrape-amazon';
const ALIEXPRESS_ALARM_NAME = 'scrape-aliexpress';

const AMAZON_ORDERS_URL = 'https://www.amazon.ca/gp/css/order-history';
const ALIEXPRESS_ORDERS_URL = 'https://www.aliexpress.com/p/order/index.html';
const ALIEXPRESS_TRACKING_URL_BASE =
  'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=';

const DEFAULT_INTERVAL_MINUTES_BY_SITE: Record<OrderSite, number> = {
  amazon: 30,
  aliexpress: 120,
};

const ACTIVE_INTERVAL_MINUTES_BY_SITE: Record<OrderSite, number> = {
  amazon: 10,
  aliexpress: 10,
};

const ACTIVE_HOURS_START = 7;
const ACTIVE_HOURS_END = 22;
const SCRAPE_TIMEOUT_MS = 30000;

const SITE_LABELS: Record<OrderSite, string> = {
  amazon: 'Amazon Orders',
  aliexpress: 'AliExpress Orders',
};

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

const scrapeTabIdsBySite = new Map<OrderSite, Set<number>>([
  [AMAZON_SITE, new Set()],
  [ALIEXPRESS_SITE, new Set()],
]);

const scrapeInProgressBySite: Record<OrderSite, boolean> = {
  amazon: false,
  aliexpress: false,
};

const pendingAliExpressTracking = new Map<number, PendingTrackingRequest>();
const orderListTimeouts = new Map<OrderSite, ReturnType<typeof setTimeout>>();

export default defineBackground(() => {
  console.log('[Orders] Background script loaded');

  browser.alarms.onAlarm.addListener(handleAlarm);
  browser.runtime.onMessage.addListener(handleMessage);

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Orders] Extension installed, setting up alarms');
    scheduleNextCheck(AMAZON_SITE, []);
    scheduleNextCheck(ALIEXPRESS_SITE, []);
    startScrape(AMAZON_SITE);
    startScrape(ALIEXPRESS_SITE);
  });

  browser.runtime.onStartup.addListener(() => {
    console.log('[Orders] Browser started, checking alarms');
    scheduleNextCheck(AMAZON_SITE, []);
    scheduleNextCheck(ALIEXPRESS_SITE, []);
  });
});

function handleAlarm(alarm: Browser.alarms.Alarm): void {
  if (alarm.name === AMAZON_ALARM_NAME) {
    startScrape(AMAZON_SITE);
    return;
  }

  if (alarm.name === ALIEXPRESS_ALARM_NAME) {
    startScrape(ALIEXPRESS_SITE);
  }
}

function handleMessage(message: MessageType, sender: Browser.runtime.MessageSender): void {
  if (message.type === 'ORDERS_SCRAPED' && message.site === AMAZON_SITE) {
    void handleAmazonOrdersScraped(message.orders, sender.tab?.id);
    return;
  }

  if (message.type === 'ALIEXPRESS_ORDERS_DISCOVERED') {
    void handleAliExpressOrdersDiscovered(message.orders, sender.tab?.id);
    return;
  }

  if (message.type === 'ALIEXPRESS_TRACKING_SCRAPED') {
    handleAliExpressTrackingMessage(message.tracking, sender.tab?.id);
    return;
  }

  if (message.type === 'ALIEXPRESS_AUTH_FAILED') {
    void handleAliExpressAuthFailed(sender.tab?.id);
    return;
  }

  if (message.type === 'SCRAPE_ERROR') {
    console.error('[Orders] Scrape error:', message.error);
    handleScrapeFailure(AMAZON_SITE);
  }
}

function startScrape(site: OrderSite): void {
  if (scrapeInProgressBySite[site]) {
    console.log(`[${SITE_LABELS[site]}] Scrape already in progress`);
    return;
  }

  scrapeInProgressBySite[site] = true;

  if (site === AMAZON_SITE) {
    void performAmazonScrape();
    return;
  }

  void performAliExpressScrape();
}

async function performAmazonScrape(): Promise<void> {
  console.log(`[${SITE_LABELS[AMAZON_SITE]}] Opening orders page in background tab`);
  const tabId = await openOrderListTab(AMAZON_SITE, AMAZON_ORDERS_URL);
  if (!tabId) {
    handleScrapeFailure(AMAZON_SITE);
  }
}

async function performAliExpressScrape(): Promise<void> {
  console.log(`[${SITE_LABELS[ALIEXPRESS_SITE]}] Opening orders page in background tab`);
  const tabId = await openOrderListTab(ALIEXPRESS_SITE, ALIEXPRESS_ORDERS_URL);
  if (!tabId) {
    handleScrapeFailure(ALIEXPRESS_SITE);
  }
}

async function openOrderListTab(site: OrderSite, url: string): Promise<number | null> {
  try {
    const tab = await browser.tabs.create({
      url,
      active: false,
    });

    if (!tab.id) {
      return null;
    }

    trackScrapeTab(site, tab.id);
    scheduleScrapeTimeout(site, tab.id);
    return tab.id;
  } catch (e) {
    console.error(`[${SITE_LABELS[site]}] Error creating tab:`, e);
    return null;
  }
}

function scheduleScrapeTimeout(site: OrderSite, tabId: number): void {
  const existing = orderListTimeouts.get(site);
  if (existing) {
    clearTimeout(existing);
  }

  const timeoutId = setTimeout(() => {
    orderListTimeouts.delete(site);
    if (!scrapeInProgressBySite[site]) {
      return;
    }

    console.warn(`[${SITE_LABELS[site]}] Scrape timed out`);
    void closeScrapeTab(site, tabId);
    handleScrapeFailure(site);
  }, SCRAPE_TIMEOUT_MS);

  orderListTimeouts.set(site, timeoutId);
}

function clearScrapeTimeout(site: OrderSite): void {
  const timeoutId = orderListTimeouts.get(site);
  if (!timeoutId) {
    return;
  }

  clearTimeout(timeoutId);
  orderListTimeouts.delete(site);
}

function handleScrapeFailure(site: OrderSite): void {
  clearScrapeTimeout(site);
  scheduleNextCheck(site, []);
  scrapeInProgressBySite[site] = false;
}

function trackScrapeTab(site: OrderSite, tabId: number): void {
  scrapeTabIdsBySite.get(site)?.add(tabId);
}

async function closeScrapeTab(site: OrderSite, tabId: number | undefined): Promise<void> {
  if (!tabId) {
    return;
  }

  const tabSet = scrapeTabIdsBySite.get(site);
  if (!tabSet?.has(tabId)) {
    return;
  }

  tabSet.delete(tabId);
  try {
    await browser.tabs.remove(tabId);
  } catch {
    // Tab might already be closed
  }
}

async function handleAmazonOrdersScraped(
  orders: OrderStatus[],
  tabId: number | undefined
): Promise<void> {
  clearScrapeTimeout(AMAZON_SITE);
  await closeScrapeTab(AMAZON_SITE, tabId);
  await processOrdersForSite(AMAZON_SITE, orders);
}

async function handleAliExpressAuthFailed(tabId: number | undefined): Promise<void> {
  clearScrapeTimeout(ALIEXPRESS_SITE);
  await closeScrapeTab(ALIEXPRESS_SITE, tabId);
  await sendAuthFailedNotification();
  handleScrapeFailure(ALIEXPRESS_SITE);
}

async function handleAliExpressOrdersDiscovered(
  orders: AliExpressDiscoveredOrder[],
  tabId: number | undefined
): Promise<void> {
  clearScrapeTimeout(ALIEXPRESS_SITE);
  await closeScrapeTab(ALIEXPRESS_SITE, tabId);

  const trackingResults = await scrapeAliExpressTrackingForOrders(orders);
  const orderStatuses = buildAliExpressOrderStatuses(orders, trackingResults);
  await processOrdersForSite(ALIEXPRESS_SITE, orderStatuses);
}

function handleAliExpressTrackingMessage(
  tracking: AliExpressTrackingResult,
  tabId: number | undefined
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
  void closeScrapeTab(ALIEXPRESS_SITE, tabId);

  if (pending.expectedOrderId !== tracking.orderId) {
    console.warn('[AliExpress Orders] Tracking order ID mismatch', {
      expected: pending.expectedOrderId,
      received: tracking.orderId,
    });
  }

  pending.resolve(tracking);
}

async function scrapeAliExpressTrackingForOrders(
  orders: AliExpressDiscoveredOrder[]
): Promise<AliExpressTrackingResult[]> {
  const results: AliExpressTrackingResult[] = [];

  for (const order of orders) {
    if (order.highLevelStatus === 'Completed') {
      continue;
    }

    const trackingUrl = order.trackingUrl ?? buildAliExpressTrackingUrl(order.orderId);
    const tracking = trackingUrl
      ? await scrapeAliExpressTracking(trackingUrl, order.orderId)
      : null;

    if (tracking) {
      results.push(tracking);
    }
  }

  return results;
}

async function scrapeAliExpressTracking(
  trackingUrl: string,
  orderId: string
): Promise<AliExpressTrackingResult | null> {
  const tab = await browser.tabs.create({
    url: trackingUrl,
    active: false,
  });

  if (!tab.id) {
    return null;
  }

  trackScrapeTab(ALIEXPRESS_SITE, tab.id);
  return waitForAliExpressTracking(tab.id, orderId);
}

function waitForAliExpressTracking(
  tabId: number,
  orderId: string
): Promise<AliExpressTrackingResult | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      pendingAliExpressTracking.delete(tabId);
      void closeScrapeTab(ALIEXPRESS_SITE, tabId);
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

async function processOrdersForSite(site: OrderSite, orders: OrderStatus[]): Promise<void> {
  if (orders.length === 0) {
    await sendParseFailureNotification(site);
  }

  const { changed, isFirstRun, previousOrders } = await detectChanges(orders, site);

  if (isFirstRun) {
    console.log(`[${SITE_LABELS[site]}] First run, storing initial state`);
  } else if (changed.length > 0) {
    console.log(`[${SITE_LABELS[site]}] ${changed.length} order(s) changed`);
    await notifyChanges(site, changed, previousOrders);
  } else {
    console.log(`[${SITE_LABELS[site]}] No changes detected`);
  }

  await saveOrders(site, orders);
  scheduleNextCheck(site, orders);
  scrapeInProgressBySite[site] = false;
}

async function notifyChanges(
  site: OrderSite,
  changed: OrderStatus[],
  previousOrders: Record<string, OrderStatus>
): Promise<void> {
  for (const order of changed) {
    const prevOrder = previousOrders[order.orderId];
    const shouldPlaySound = shouldPlaySoundForOrder(site, order, prevOrder);
    await sendNotification(order, shouldPlaySound, site);
  }
}

function shouldPlaySoundForOrder(
  site: OrderSite,
  order: OrderStatus,
  previousOrder: OrderStatus | undefined
): boolean {
  if (site !== AMAZON_SITE) {
    return false;
  }

  return order.isDelivered && !previousOrder?.isDelivered;
}

async function sendNotification(
  order: OrderStatus,
  shouldPlaySound: boolean,
  site: OrderSite
): Promise<void> {
  const productSummary =
    order.productTitles.length > 0
      ? order.productTitles[0].slice(0, 50) +
        (order.productTitles[0].length > 50 ? '...' : '')
      : 'Unknown item';

  const title = order.status;
  const message = `${productSummary}\n${order.statusDetail}`.trim();

  console.log(`[${SITE_LABELS[site]}] Sending notification: ${title}`);

  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
    });

    if (shouldPlaySound) {
      const audio = new Audio(browser.runtime.getURL('/assets/notification.mp3'));
      audio.play();
    }
  } catch (e) {
    console.error(`[${SITE_LABELS[site]}] Error sending notification:`, e);
  }
}

async function sendParseFailureNotification(site: OrderSite): Promise<void> {
  const title =
    site === AMAZON_SITE
      ? 'Amazon parsing may be broken'
      : 'AliExpress parsing may be broken';
  const message =
    site === AMAZON_SITE
      ? 'No orders found. The Amazon page structure may have changed.'
      : 'No orders found. The AliExpress page structure may have changed.';

  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title,
      message,
    });
  } catch (e) {
    console.error(`[${SITE_LABELS[site]}] Error sending parse failure notification:`, e);
  }
}

async function sendAuthFailedNotification(): Promise<void> {
  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: 'AliExpress session expired',
      message: 'Please log in to AliExpress to resume order tracking.',
    });
  } catch (e) {
    console.error('[AliExpress Orders] Error sending auth failed notification:', e);
  }
}

function scheduleNextCheck(site: OrderSite, orders: OrderStatus[]): void {
  const intervalMinutes = calculateInterval(site, orders);
  console.log(`[${SITE_LABELS[site]}] Scheduling next check in ${intervalMinutes} minutes`);

  const alarmName = site === AMAZON_SITE ? AMAZON_ALARM_NAME : ALIEXPRESS_ALARM_NAME;
  browser.alarms.create(alarmName, {
    delayInMinutes: intervalMinutes,
  });
}

function calculateInterval(site: OrderSite, orders: OrderStatus[]): number {
  const hasActiveDeliveryToday = orders.some(
    (order) => order.isDeliveryExpectedToday && !order.isDelivered
  );

  if (!hasActiveDeliveryToday) {
    return DEFAULT_INTERVAL_MINUTES_BY_SITE[site];
  }

  const hour = new Date().getHours();
  const isActiveHours = hour >= ACTIVE_HOURS_START && hour < ACTIVE_HOURS_END;

  return isActiveHours
    ? ACTIVE_INTERVAL_MINUTES_BY_SITE[site]
    : DEFAULT_INTERVAL_MINUTES_BY_SITE[site];
}
