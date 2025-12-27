import type { OrderStatus, MessageType } from '../lib/types';
import { detectChanges, saveOrders } from '../lib/storage';

const ALARM_NAME = 'amazon-order-check';
const AMAZON_ORDERS_URL = 'https://www.amazon.ca/gp/css/order-history';
const DEFAULT_INTERVAL_MINUTES = 30;
const ACTIVE_INTERVAL_MINUTES = 10;
const SCRAPE_TIMEOUT_MS = 30000;

// Track tab IDs we opened for scraping (so we don't close user's tabs)
const scrapeTabIds = new Set<number>();

export default defineBackground(() => {
  console.log('[Amazon Orders] Background script loaded');

  // Set up alarm listener
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      console.log('[Amazon Orders] Alarm triggered, starting scrape');
      performScrape();
    }
  });

  // Listen for messages from content script
  browser.runtime.onMessage.addListener((message: MessageType, sender) => {
    if (message.type === 'ORDERS_SCRAPED') {
      console.log('[Amazon Orders] Received orders from content script');
      handleScrapedOrders(message.orders, sender.tab?.id);
    } else if (message.type === 'SCRAPE_ERROR') {
      console.error('[Amazon Orders] Scrape error:', message.error);
      scheduleNextCheck([]);
    }
  });

  // Set up initial alarm on install/startup
  browser.runtime.onInstalled.addListener(() => {
    console.log('[Amazon Orders] Extension installed, setting up alarm');
    scheduleNextCheck([]);
    // Also do an immediate check
    performScrape();
  });

  // Also set up alarm on startup (in case browser was closed)
  browser.runtime.onStartup.addListener(() => {
    console.log('[Amazon Orders] Browser started, checking alarm');
    scheduleNextCheck([]);
  });
});

async function performScrape(): Promise<void> {
  console.log('[Amazon Orders] Opening Amazon orders page in background tab');

  let tab: Browser.tabs.Tab | undefined;

  try {
    // Open Amazon orders page in a background tab
    tab = await browser.tabs.create({
      url: AMAZON_ORDERS_URL,
      active: false,
    });

    if (tab.id) {
      scrapeTabIds.add(tab.id);
    }

    // Set a timeout to close the tab if we don't get a response
    setTimeout(() => {
      if (tab?.id) {
        scrapeTabIds.delete(tab.id);
        browser.tabs.remove(tab.id).catch(() => {
          // Tab might already be closed
        });
      }
    }, SCRAPE_TIMEOUT_MS);
  } catch (e) {
    console.error('[Amazon Orders] Error creating tab:', e);
    scheduleNextCheck([]);
  }
}

async function handleScrapedOrders(
  orders: OrderStatus[],
  tabId: number | undefined
): Promise<void> {
  // Only close the tab if we opened it for scraping
  if (tabId && scrapeTabIds.has(tabId)) {
    scrapeTabIds.delete(tabId);
    try {
      await browser.tabs.remove(tabId);
    } catch {
      // Tab might already be closed
    }
  }

  // Detect changes
  const { changed, isFirstRun, previousOrders } = await detectChanges(orders);

  if (isFirstRun) {
    console.log('[Amazon Orders] First run, storing initial state');
  } else if (changed.length > 0) {
    console.log(`[Amazon Orders] ${changed.length} order(s) changed`);
    for (const order of changed) {
      const prevOrder = previousOrders[order.orderId];
      const shouldPlaySound = order.isDelivered && !prevOrder?.isDelivered;
      await sendNotification(order, shouldPlaySound);
    }
  } else {
    console.log('[Amazon Orders] No changes detected');
  }

  // Save current state
  await saveOrders(orders);

  // Schedule next check based on current orders
  scheduleNextCheck(orders);
}

async function sendNotification(order: OrderStatus, shouldPlaySound: boolean): Promise<void> {
  const productSummary =
    order.productTitles.length > 0
      ? order.productTitles[0].slice(0, 50) +
        (order.productTitles[0].length > 50 ? '...' : '')
      : 'Unknown item';

  const title = order.status;
  const message = `${productSummary}\n${order.statusDetail}`;

  console.log(`[Amazon Orders] Sending notification: ${title}`);

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
    console.error('[Amazon Orders] Error sending notification:', e);
  }
}

function scheduleNextCheck(orders: OrderStatus[]): void {
  const intervalMinutes = calculateInterval(orders);

  console.log(`[Amazon Orders] Scheduling next check in ${intervalMinutes} minutes`);

  browser.alarms.create(ALARM_NAME, {
    delayInMinutes: intervalMinutes,
  });
}

function calculateInterval(orders: OrderStatus[]): number {
  // Check if any order has delivery expected today and is not yet delivered
  const hasActiveDeliveryToday = orders.some(
    (o) => o.isDeliveryExpectedToday && !o.isDelivered
  );

  if (!hasActiveDeliveryToday) {
    return DEFAULT_INTERVAL_MINUTES;
  }

  // Check if current time is between 7AM and 10PM local time
  const hour = new Date().getHours();
  const isActiveHours = hour >= 7 && hour < 22;

  if (isActiveHours) {
    return ACTIVE_INTERVAL_MINUTES;
  }

  return DEFAULT_INTERVAL_MINUTES;
}
