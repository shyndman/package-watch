import { toISODateString } from '../lib/date';
import { defineScrapingScript } from '../lib/define-scraping-script';
import { sendMessage } from '../lib/messaging';
import { ParseFailureError, isParseFailureError } from '../lib/parse-failure';
import type { AliExpressDiscoveredOrder } from '../lib/types';

export default defineScrapingScript({
  matches: ['*://www.aliexpress.com/p/order/index.html*'],

  async scrape() {
    console.log('[AliExpress Orders] Scraping orders');

    try {
      const { orders, isAuthFailure } = await waitForOrdersAndParse();

      if (isAuthFailure) {
        console.warn('[AliExpress Orders] Auth failure detected');
        await sendMessage('aliexpress:authFailed', undefined);
        return;
      }

      console.log(`[AliExpress Orders] Found ${orders.length} orders`);
      await sendMessage('aliexpress:ordersDiscovered', { orders });
    } catch (error) {
      if (!isParseFailureError(error)) {
        throw error;
      }

      console.error('[AliExpress Orders] Parse failure:', error);
      await sendMessage('scrape:parseFailure', {
        site: 'aliexpress',
        phase: 'aliexpress-orders',
        reason: error.reason ?? error.message,
        url: error.url ?? location.href,
      });
    }
  },
});

const MAX_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 500;

const ORDER_ITEM_SELECTOR = '.order-item';
const ORDER_STATUS_SELECTOR = '.order-item-header-status-text';
const ORDER_INFO_SELECTOR = '.order-item-header-right-info';
const STORE_LINK_SELECTOR = 'a[href*="/store/"]';
const ORDER_DETAILS_LINK_SELECTOR = 'a[href*="/p/order/detail.html"]';
const TRACKING_LINK_SELECTOR = 'a[href*="/tracking/"]';
const GREETING_TOKEN = 'hi,';
const LOGIN_URL_TOKENS = ['login', 'signin'];

const ORDER_ID_REGEX = /Ref\.\s*Number:\s*(\d+)/i;
const ORDER_DATE_REGEX = /Date:\s*([A-Za-z]{3}\s+\d{1,2},?\s*\d{4})/i;

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

async function waitForOrdersAndParse(): Promise<{
  orders: AliExpressDiscoveredOrder[];
  isAuthFailure: boolean;
}> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    if (hasOrderItems()) {
      return { orders: parseOrderItems(), isAuthFailure: false };
    }

    if (isLoginPage()) {
      return { orders: [], isAuthFailure: true };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.warn('[AliExpress Orders] Timed out waiting for order items');
  if (isAuthFailure()) {
    return { orders: [], isAuthFailure: true };
  }

  throw new ParseFailureError('Timed out waiting for order items', undefined, location.href);
}

function hasOrderItems(): boolean {
  return document.querySelectorAll(ORDER_ITEM_SELECTOR).length > 0;
}

function isLoginPage(): boolean {
  return LOGIN_URL_TOKENS.some((token) => location.href.includes(token));
}

function isAuthFailure(): boolean {
  const text = document.body.textContent?.toLowerCase() ?? '';
  const hasGreeting = text.includes(GREETING_TOKEN);
  return !hasGreeting && !hasOrderItems();
}

function parseOrderItems(): AliExpressDiscoveredOrder[] {
  const orderItems = document.querySelectorAll(ORDER_ITEM_SELECTOR);
  if (orderItems.length === 0) {
    throw new ParseFailureError('No order items found', undefined, location.href);
  }

  return Array.from(orderItems).map((item, index) =>
    parseOrderItem(item as HTMLElement, index)
  );
}

function parseOrderItem(item: HTMLElement, index: number): AliExpressDiscoveredOrder {
  const highLevelStatus = parseHighLevelStatus(item, index);
  const orderInfo = parseOrderInfo(item, index);

  const storeName = parseStoreName(item);
  const orderDetailsUrl = parseOrderDetailsUrl(item, orderInfo.orderId, index);
  const trackingUrl = parseTrackingUrl(item);

  return {
    orderId: orderInfo.orderId,
    highLevelStatus,
    orderDate: orderInfo.orderDate,
    storeName,
    orderDetailsUrl,
    trackingUrl,
  };
}

function parseHighLevelStatus(
  item: HTMLElement,
  index: number
): 'Awaiting delivery' | 'Completed' {
  const statusEl = item.querySelector(ORDER_STATUS_SELECTOR);
  if (!statusEl) {
    throw new ParseFailureError(
      `Order item ${index + 1}: missing status element`,
      undefined,
      location.href
    );
  }

  const statusText = statusEl.textContent?.trim();
  if (!statusText) {
    throw new ParseFailureError(
      `Order item ${index + 1}: empty status text`,
      undefined,
      location.href
    );
  }

  return statusText === 'Completed' ? 'Completed' : 'Awaiting delivery';
}

function parseOrderInfo(
  item: HTMLElement,
  index: number
): { orderId: string; orderDate: string } {
  const infoEl = item.querySelector(ORDER_INFO_SELECTOR);
  const infoText = infoEl?.textContent ?? '';
  const orderIdMatch = infoText.match(ORDER_ID_REGEX);
  const orderId = orderIdMatch?.[1]?.trim();
  if (!orderId) {
    throw new ParseFailureError(
      `Order item ${index + 1}: missing order ID`,
      undefined,
      location.href
    );
  }

  const orderDateMatch = infoText.match(ORDER_DATE_REGEX);
  const orderDateText = orderDateMatch?.[1]?.trim();
  if (!orderDateText) {
    throw new ParseFailureError(
      `Order ${orderId}: missing or unparseable order date`,
      undefined,
      location.href
    );
  }

  const orderDate = parseDateToISO(orderDateText, orderId);

  return { orderId, orderDate };
}

function parseStoreName(item: HTMLElement): string {
  return item.querySelector(STORE_LINK_SELECTOR)?.textContent?.trim() ?? '';
}

function parseOrderDetailsUrl(item: HTMLElement, orderId: string, index: number): string | null {
  const detailsEl = item.querySelector(ORDER_DETAILS_LINK_SELECTOR) as HTMLAnchorElement | null;
  const href = detailsEl?.href ?? null;
  if (!href) {
    throw new ParseFailureError(
      `Order item ${index + 1} (${orderId}): missing order details URL`,
      undefined,
      location.href
    );
  }

  return href;
}

function parseTrackingUrl(item: HTMLElement): string | null {
  const trackingEl = item.querySelector(TRACKING_LINK_SELECTOR) as HTMLAnchorElement | null;
  return trackingEl?.href ?? null;
}

function parseDateToISO(dateText: string, orderId: string): string {
  const match = dateText.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})?$/);
  if (!match) {
    throw new ParseFailureError(
      `Order ${orderId}: could not parse date: ${dateText}`,
      undefined,
      location.href
    );
  }

  const [, monthAbbr, dayRaw, yearRaw] = match;
  const month = MONTH_MAP[monthAbbr.toLowerCase()];
  if (!month) {
    throw new ParseFailureError(
      `Order ${orderId}: unknown month: ${monthAbbr}`,
      undefined,
      location.href
    );
  }

  const year = yearRaw ? parseInt(yearRaw, 10) : Temporal.Now.plainDateISO().year;

  return toISODateString(year, month, parseInt(dayRaw, 10));
}
