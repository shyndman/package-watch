import type { OrderSite, OrderStatus, ParseFailurePhase } from '../lib/types';
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
import { handleEbayOrdersScraped, performEbayScrape } from '../lib/background/ebay';
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
  EBAY_SITE,
  SCRAPE_TIMEOUT_MS,
  getAlarmName,
  getSiteLabel,
  scheduleNextCheck,
} from '../lib/background/scheduler';
import { updateInFlightBadge } from '../lib/background/badge';
import { onMessage } from '../lib/messaging';

/** Tracks all tabs opened by this extension for scraping. */
const scrapeTabIds = new Set<number>();

const scrapeInProgressBySite: Record<OrderSite, boolean> = {
  amazon: false,
  aliexpress: false,
  ebay: false,
};

const parseFailureNotifiedBySite: Record<OrderSite, boolean> = {
  amazon: false,
  aliexpress: false,
  ebay: false,
};

const orderListTimeouts = new Map<OrderSite, ReturnType<typeof setTimeout>>();

const ALARM_LOG_LABEL_BY_SITE: Record<OrderSite, string> = {
  amazon: 'Amazon',
  aliexpress: 'AliExpress',
  ebay: 'eBay',
};
const ALARM_LOG_PREFIX = 'Alarm fired: ';
const ALARM_LOG_SUFFIX = ' order check started';

/** Pause before navigating the scrape tab to each page, to avoid bot-like rapid navigation. */
const PAGE_DWELL_MS = 3000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export default defineBackground(() => {
  console.log('[Orders] Background script loaded');

  // Initialize toolbar badge from stored state.
  void updateInFlightBadge();

  // Register all message handlers
  onMessage('scrape:checkActivation', ({ sender }) => {
    const tabId = sender.tab?.id;
    return tabId !== undefined && scrapeTabIds.has(tabId);
  });

  onMessage('orders:scraped', ({ data, sender }) => {
    if (data.site === AMAZON_SITE) {
      void handleAmazonOrdersScraped(data.orders, sender.tab?.id, getAmazonDeps());
    } else if (data.site === EBAY_SITE) {
      void handleEbayOrdersScraped(data.orders, sender.tab?.id, getEbayDeps());
    }
  });

  onMessage('aliexpress:ordersDiscovered', ({ data, sender }) => {
    void handleAliExpressOrdersDiscovered(data.orders, sender.tab?.id, getAliExpressDeps());
  });

  onMessage('aliexpress:orderDetails', ({ data, sender }) => {
    handleAliExpressOrderDetailsMessage(data.details, sender.tab?.id, getAliExpressDeps());
  });

  onMessage('aliexpress:tracking', ({ data, sender }) => {
    handleAliExpressTrackingMessage(data.tracking, sender.tab?.id, getAliExpressDeps());
  });

  onMessage('aliexpress:authFailed', ({ sender }) => {
    void handleAliExpressAuthFailed(sender.tab?.id, getAliExpressDeps());
  });

  onMessage('scrape:parseFailure', ({ data, sender }) => {
    void handleParseFailureMessage(data, sender.tab?.id);
  });

  onMessage('scrape:error', ({ data }) => {
    console.error('[Orders] Scrape error:', data.error);
    handleScrapeFailure(AMAZON_SITE);
  });

  onMessage('scrape:trigger', () => {
    void startScrape(AMAZON_SITE);
    void startScrape(ALIEXPRESS_SITE);
    void startScrape(EBAY_SITE);
  });

  browser.alarms.onAlarm.addListener(handleAlarm);
  browser.notifications.onClicked.addListener(handleNotificationClick);

  browser.runtime.onInstalled.addListener(() => {
    console.log('[Orders] Extension installed, setting up alarms');
    scheduleNextCheck(AMAZON_SITE, []);
    scheduleNextCheck(ALIEXPRESS_SITE, []);
    scheduleNextCheck(EBAY_SITE, []);
    void startScrape(AMAZON_SITE);
    void startScrape(ALIEXPRESS_SITE);
    void startScrape(EBAY_SITE);
  });

  browser.runtime.onStartup.addListener(() => {
    console.log('[Orders] Browser started, checking alarms');
    scheduleNextCheck(AMAZON_SITE, []);
    scheduleNextCheck(ALIEXPRESS_SITE, []);
    scheduleNextCheck(EBAY_SITE, []);
    void startScrape(AMAZON_SITE);
    void startScrape(ALIEXPRESS_SITE);
    void startScrape(EBAY_SITE);
  });
});

function handleAlarm(alarm: Browser.alarms.Alarm): void {
  if (alarm.name === getAlarmName(AMAZON_SITE)) {
    void startScrape(AMAZON_SITE);
    return;
  }

  if (alarm.name === getAlarmName(ALIEXPRESS_SITE)) {
    void startScrape(ALIEXPRESS_SITE);
    return;
  }

  if (alarm.name === getAlarmName(EBAY_SITE)) {
    void startScrape(EBAY_SITE);
  }
}

function handleNotificationClick(notificationId: string): void {
  const url = getNotificationUrl(notificationId);
  if (url) {
    void browser.tabs.create({ url, active: true });
    clearNotificationUrl(notificationId);
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

  if (site === EBAY_SITE) {
    void performEbayScrape(getEbayDeps());
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

function getEbayDeps() {
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
    navigateScrapeTab,
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

    scrapeTabIds.add(tab.id);
    scheduleScrapeTimeout(site, tab.id);
    return tab.id;
  } catch (e) {
    console.error(`[${getSiteLabel(site)}] Error creating tab:`, e);
    return null;
  }
}

async function navigateScrapeTab(tabId: number, url: string): Promise<void> {
  try {
    await delay(PAGE_DWELL_MS);
    await browser.tabs.update(tabId, { url });
  } catch (e) {
    console.error(`[${getSiteLabel(ALIEXPRESS_SITE)}] Error navigating scrape tab:`, e);
    throw e;
  }
}

async function handleParseFailureMessage(
  data: {
    site: OrderSite;
    phase: ParseFailurePhase;
    reason?: string;
    url?: string;
    tabId?: number;
  },
  senderTabId: number | undefined
): Promise<void> {
  const tabId = data.tabId ?? senderTabId;
  const label = getSiteLabel(data.site);

  console.error(`[${label}] Parse failure (${data.phase})`, {
    reason: data.reason,
    url: data.url,
    tabId,
  });

  if (data.site === ALIEXPRESS_SITE && data.phase === 'aliexpress-tracking') {
    await handleAliExpressTrackingParseFailure(tabId, getAliExpressDeps());
  } else if (data.site === ALIEXPRESS_SITE && data.phase === 'aliexpress-order-details') {
    await handleAliExpressOrderDetailsParseFailure(tabId, getAliExpressDeps());
  } else if (tabId !== undefined) {
    await closeScrapeTab(tabId);
  }

  await closeAllScrapeTabs();

  if (!parseFailureNotifiedBySite[data.site]) {
    parseFailureNotifiedBySite[data.site] = true;
    await sendParseFailureNotification(data.site, data.reason, data.url);
  }

  if (scrapeInProgressBySite[data.site]) {
    handleScrapeFailure(data.site);
  }
}

async function closeAllScrapeTabs(): Promise<void> {
  if (scrapeTabIds.size === 0) {
    return;
  }

  const tabIds = Array.from(scrapeTabIds);
  await Promise.all(tabIds.map((tabId) => closeScrapeTab(tabId)));
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
    void closeScrapeTab(tabId);
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

async function closeScrapeTab(tabId: number | undefined): Promise<void> {
  if (!tabId) {
    return;
  }

  scrapeTabIds.delete(tabId);
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
  // Keep toolbar badge in sync with stored order state.
  void updateInFlightBadge();
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
