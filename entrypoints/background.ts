import type { MessageType, OrderSite, OrderStatus } from '../lib/types';
import { detectChanges, saveOrders, updateScrapeStatus } from '../lib/storage';
import {
  handleAliExpressAuthFailed,
  handleAliExpressOrderDetailsMessage,
  handleAliExpressOrderDetailsParseFailure,
  handleAliExpressOrdersDiscovered,
  handleAliExpressTrackingParseFailure,
  handleAliExpressTrackingMessage,
  performAliExpressScrape,
} from '../lib/background/aliexpress';
import { handleAmazonOrdersScraped, performAmazonScrape } from '../lib/background/amazon';
import {
  clearNotificationUrl,
  getNotificationUrl,
  sendAuthFailedNotification,
  sendNotification,
  sendParseFailureNotification,
} from '../lib/background/notifications';
import {
  ALIEXPRESS_SITE,
  AMAZON_SITE,
  SCRAPE_TIMEOUT_MS,
  getAlarmName,
  getSiteLabel,
  scheduleNextCheck,
} from '../lib/background/scheduler';

const scrapeTabIdsBySite = new Map<OrderSite, Set<number>>([
  [AMAZON_SITE, new Set()],
  [ALIEXPRESS_SITE, new Set()],
]);

const scrapeInProgressBySite: Record<OrderSite, boolean> = {
  amazon: false,
  aliexpress: false,
};

const parseFailureNotifiedBySite: Record<OrderSite, boolean> = {
  amazon: false,
  aliexpress: false,
};

const orderListTimeouts = new Map<OrderSite, ReturnType<typeof setTimeout>>();

const ALARM_LOG_LABEL_BY_SITE: Record<OrderSite, string> = {
  amazon: 'Amazon',
  aliexpress: 'AliExpress',
};
const ALARM_LOG_PREFIX = 'Alarm fired: ';
const ALARM_LOG_SUFFIX = ' order check started';

export default defineBackground(() => {
  console.log('[Orders] Background script loaded');

  browser.alarms.onAlarm.addListener(handleAlarm);
  browser.runtime.onMessage.addListener(handleMessage);
  browser.notifications.onClicked.addListener(handleNotificationClick);

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Orders] Extension installed, setting up alarms');
    scheduleNextCheck(AMAZON_SITE, []);
    scheduleNextCheck(ALIEXPRESS_SITE, []);
    void startScrape(AMAZON_SITE);
    void startScrape(ALIEXPRESS_SITE);
  });

  browser.runtime.onStartup.addListener(() => {
    console.log('[Orders] Browser started, checking alarms');
    scheduleNextCheck(AMAZON_SITE, []);
    scheduleNextCheck(ALIEXPRESS_SITE, []);
    void startScrape(AMAZON_SITE);
    void startScrape(ALIEXPRESS_SITE);
  });
});

function handleAlarm(alarm: Browser.alarms.Alarm): void {
  if (alarm.name === getAlarmName(AMAZON_SITE)) {
    void startScrape(AMAZON_SITE);
    return;
  }

  if (alarm.name === getAlarmName(ALIEXPRESS_SITE)) {
    void startScrape(ALIEXPRESS_SITE);
  }
}

function handleNotificationClick(notificationId: string): void {
  const url = getNotificationUrl(notificationId);
  if (url) {
    void browser.tabs.create({ url, active: true });
    clearNotificationUrl(notificationId);
  }
}

function handleMessage(message: MessageType, sender: Browser.runtime.MessageSender): void {
  if (message.type === 'ORDERS_SCRAPED' && message.site === AMAZON_SITE) {
    void handleAmazonOrdersScraped(message.orders, sender.tab?.id, getAmazonDeps());
    return;
  }

  if (message.type === 'ALIEXPRESS_ORDERS_DISCOVERED') {
    void handleAliExpressOrdersDiscovered(message.orders, sender.tab?.id, getAliExpressDeps());
    return;
  }

  if (message.type === 'ALIEXPRESS_ORDER_DETAILS_SCRAPED') {
    handleAliExpressOrderDetailsMessage(message.details, sender.tab?.id, getAliExpressDeps());
    return;
  }

  if (message.type === 'ALIEXPRESS_TRACKING_SCRAPED') {
    handleAliExpressTrackingMessage(message.tracking, sender.tab?.id, getAliExpressDeps());
    return;
  }

  if (message.type === 'ALIEXPRESS_AUTH_FAILED') {
    void handleAliExpressAuthFailed(sender.tab?.id, getAliExpressDeps());
    return;
  }

  if (message.type === 'PARSE_FAILURE') {
    void handleParseFailureMessage(message, sender);
    return;
  }

  if (message.type === 'SCRAPE_ERROR') {
    console.error('[Orders] Scrape error:', message.error);
    handleScrapeFailure(AMAZON_SITE);
  }
}

async function startScrape(site: OrderSite): Promise<void> {
  if (scrapeInProgressBySite[site]) {
    console.log(`[${getSiteLabel(site)}] Scrape already in progress`);
    return;
  }

  parseFailureNotifiedBySite[site] = false;
  scrapeInProgressBySite[site] = true;
  await recordScrapeStart(site);

  if (site === AMAZON_SITE) {
    void performAmazonScrape(getAmazonDeps());
    return;
  }

  void performAliExpressScrape(getAliExpressDeps());
}

function getAmazonDeps() {
  return {
    openOrderListTab,
    handleScrapeFailure,
    closeScrapeTab,
    clearScrapeTimeout,
    processOrdersForSite,
  };
}

function getAliExpressDeps() {
  return {
    openOrderListTab,
    handleScrapeFailure,
    closeScrapeTab,
    clearScrapeTimeout,
    processOrdersForSite,
    sendAuthFailedNotification,
    openOrderDetailsTab,
    openTrackingTab,
  };
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
    console.error(`[${getSiteLabel(site)}] Error creating tab:`, e);
    return null;
  }
}

async function openTrackingTab(url: string): Promise<number | null> {
  if (!scrapeInProgressBySite[ALIEXPRESS_SITE]) {
    return null;
  }

  try {
    const tab = await browser.tabs.create({
      url,
      active: false,
    });

    if (!tab.id) {
      return null;
    }

    trackScrapeTab(ALIEXPRESS_SITE, tab.id);
    return tab.id;
  } catch (e) {
    console.error(`[${getSiteLabel(ALIEXPRESS_SITE)}] Error creating tracking tab:`, e);
    return null;
  }
}

async function openOrderDetailsTab(url: string): Promise<number | null> {
  if (!scrapeInProgressBySite[ALIEXPRESS_SITE]) {
    return null;
  }

  try {
    const tab = await browser.tabs.create({
      url,
      active: false,
    });

    if (!tab.id) {
      return null;
    }

    trackScrapeTab(ALIEXPRESS_SITE, tab.id);
    return tab.id;
  } catch (e) {
    console.error(`[${getSiteLabel(ALIEXPRESS_SITE)}] Error creating order details tab:`, e);
    return null;
  }
}

async function handleParseFailureMessage(
  message: Extract<MessageType, { type: 'PARSE_FAILURE' }>,
  sender: Browser.runtime.MessageSender
): Promise<void> {
  const tabId = message.tabId ?? sender.tab?.id;
  const label = getSiteLabel(message.site);

  console.error(`[${label}] Parse failure (${message.phase})`, {
    reason: message.reason,
    url: message.url,
    tabId,
  });

  if (message.site === ALIEXPRESS_SITE && message.phase === 'aliexpress-tracking') {
    await handleAliExpressTrackingParseFailure(tabId, getAliExpressDeps());
  } else if (message.site === ALIEXPRESS_SITE && message.phase === 'aliexpress-order-details') {
    await handleAliExpressOrderDetailsParseFailure(tabId, getAliExpressDeps());
  } else if (tabId !== undefined) {
    await closeScrapeTab(message.site, tabId);
  }

  await closeAllScrapeTabs(message.site);

  if (!parseFailureNotifiedBySite[message.site]) {
    parseFailureNotifiedBySite[message.site] = true;
    await sendParseFailureNotification(message.site, message.reason, message.url);
  }

  if (scrapeInProgressBySite[message.site]) {
    handleScrapeFailure(message.site);
  }
}

async function closeAllScrapeTabs(site: OrderSite): Promise<void> {
  const tabSet = scrapeTabIdsBySite.get(site);
  if (!tabSet || tabSet.size === 0) {
    return;
  }

  const tabIds = Array.from(tabSet);
  await Promise.all(tabIds.map((tabId) => closeScrapeTab(site, tabId)));
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

    console.warn(`[${getSiteLabel(site)}] Scrape timed out`);
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
  void recordScrapeEnd(site);
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

async function processOrdersForSite(site: OrderSite, orders: OrderStatus[]): Promise<void> {
  if (parseFailureNotifiedBySite[site]) {
    console.warn(`[${getSiteLabel(site)}] Parse failure already reported; skipping order save`);
    return;
  }

  const { changed, isFirstRun, previousOrders } = await detectChanges(orders, site);

  if (isFirstRun) {
    console.log(`[${getSiteLabel(site)}] First run, storing initial state`);
  } else if (changed.length > 0) {
    console.log(`[${getSiteLabel(site)}] ${changed.length} order(s) changed`);
    await notifyChanges(site, changed, previousOrders);
  } else {
    console.log(`[${getSiteLabel(site)}] No changes detected`);
  }

  await saveOrders(site, orders);
  scheduleNextCheck(site, orders);
  scrapeInProgressBySite[site] = false;
  void recordScrapeEnd(site);
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

function buildAlarmFiredMessage(site: OrderSite): string {
  return `${ALARM_LOG_PREFIX}${ALARM_LOG_LABEL_BY_SITE[site]}${ALARM_LOG_SUFFIX}`;
}

async function recordScrapeStart(site: OrderSite): Promise<void> {
  console.log(buildAlarmFiredMessage(site));
  try {
    await updateScrapeStatus(site, {
      lastAlarmFiredAt: Date.now(),
      isScrapeInProgress: true,
    });
  } catch (e) {
    console.error(`[${getSiteLabel(site)}] Error updating scrape status:`, e);
  }
}

async function recordScrapeEnd(site: OrderSite): Promise<void> {
  try {
    await updateScrapeStatus(site, { isScrapeInProgress: false });
  } catch (e) {
    console.error(`[${getSiteLabel(site)}] Error updating scrape status:`, e);
  }
}
