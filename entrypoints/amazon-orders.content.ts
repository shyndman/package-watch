import { toISODateString } from '../lib/date';
import { ParseFailureError, isParseFailureError } from '../lib/parse-failure';
import type { OrderSite, OrderStatus, MessageType } from '../lib/types';

export default defineContentScript({
  matches: ['*://www.amazon.ca/gp/css/order-history*', '*://www.amazon.ca/your-orders/*'],

  async main() {
    console.log('[Amazon Orders] Content script loaded');

    try {
      // Wait for order cards to appear in the DOM
      const orders = await waitForOrdersAndParse();
      console.log(`[Amazon Orders] Found ${orders.length} orders`);

      browser.runtime.sendMessage({
        type: 'ORDERS_SCRAPED',
        site: SITE,
        orders,
      } satisfies MessageType);
    } catch (error) {
      if (!isParseFailureError(error)) {
        throw error;
      }

      console.error('[Amazon Orders] Parse failure:', error);
      browser.runtime.sendMessage({
        type: 'PARSE_FAILURE',
        site: SITE,
        phase: 'amazon-orders',
        reason: error.reason ?? error.message,
        url: error.url ?? location.href,
      } satisfies MessageType);
    }
  },
});

const SITE: OrderSite = 'amazon';
const MAX_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 500;

async function waitForOrdersAndParse(): Promise<OrderStatus[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const orderCards = document.querySelectorAll('.order-card');
    if (orderCards.length > 0) {
      return parseOrderCards();
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new ParseFailureError('Timed out waiting for order cards', undefined, location.href);
}

function parseOrderCards(): OrderStatus[] {
  const orderCards = document.querySelectorAll('.order-card');
  if (orderCards.length === 0) {
    throw new ParseFailureError('No order cards found', undefined, location.href);
  }

  return Array.from(orderCards).map((card, index) => parseOrderCard(card as HTMLElement, index));
}

function parseOrderCard(card: HTMLElement, index: number): OrderStatus {
  const orderId = extractOrderId(card, index);
  console.log(`[Amazon Orders] Parsing order ${orderId}`);

  const { status, statusDetail } = extractStatus(card, orderId);
  const { productTitles, productUrls } = extractProducts(card, orderId);
  const orderDate = extractOrderDate(card, orderId);
  const { isDelivered, isDeliveryExpectedToday } = extractDeliveryFlags(status);
  const orderUrl = buildOrderDetailsUrl(orderId);

  return {
    site: SITE,
    orderId,
    status,
    statusDetail,
    productTitles,
    productUrls,
    orderUrl,
    orderDate,
    isDelivered,
    isDeliveryExpectedToday,
    deliveredAt: null,
  };
}

const AMAZON_ORDER_DETAILS_URL_BASE = 'https://www.amazon.ca/gp/css/order-details?orderID=';

function extractOrderId(card: HTMLElement, index: number): string {
  const orderIdEl = card.querySelector('.yohtmlc-order-id span[dir="ltr"]');
  const orderId = orderIdEl?.textContent?.trim();
  if (!orderId) {
    throw new ParseFailureError(
      `Order card ${index + 1}: missing order ID`,
      undefined,
      location.href
    );
  }

  return orderId;
}

function extractStatus(card: HTMLElement, orderId: string): { status: string; statusDetail: string } {
  const statusEl = card.querySelector('.delivery-box__primary-text');
  const status = statusEl?.textContent?.trim();
  if (!status) {
    throw new ParseFailureError(
      `Order ${orderId}: missing status element`,
      undefined,
      location.href
    );
  }
  console.log(`[Amazon Orders]   status: "${status}"`);

  const statusDetailEl = card.querySelector('.delivery-box__secondary-text');
  const statusDetail = statusDetailEl?.textContent?.trim() ?? '';
  console.log(
    `[Amazon Orders]   statusDetail: "${statusDetail}"${!statusDetailEl ? ' (element not found)' : ''}`
  );

  return { status, statusDetail };
}

function extractProducts(
  card: HTMLElement,
  orderId: string
): { productTitles: string[]; productUrls: string[] } {
  const productTitleEls = card.querySelectorAll('.yohtmlc-product-title a');
  const productTitles: string[] = [];
  const productUrls: string[] = [];

  for (const [productIndex, el] of Array.from(productTitleEls).entries()) {
    const title = el.textContent?.trim();
    const href = (el as HTMLAnchorElement).href;
    if (!title) {
      throw new ParseFailureError(
        `Order ${orderId}: product ${productIndex + 1} title missing`,
        undefined,
        location.href
      );
    }
    if (!href) {
      throw new ParseFailureError(
        `Order ${orderId}: product ${productIndex + 1} URL missing`,
        undefined,
        location.href
      );
    }

    productTitles.push(title);
    productUrls.push(href);
  }

  if (productTitles.length === 0) {
    throw new ParseFailureError(
      `Order ${orderId}: no product titles found`,
      undefined,
      location.href
    );
  }

  console.log(
    `[Amazon Orders]   products (${productTitles.length}): ${
      productTitles.map((t) => `\"${t.slice(0, 40)}...\"`).join(', ') || '(none found)'
    }`
  );

  return { productTitles, productUrls };
}

function extractDeliveryFlags(status: string): {
  isDelivered: boolean;
  isDeliveryExpectedToday: boolean;
} {
  const statusLower = status.toLowerCase();
  const isDelivered = statusLower.includes('delivered');
  const isDeliveryExpectedToday =
    !isDelivered &&
    (statusLower.includes('arriving today') ||
      statusLower.includes('out for delivery') ||
      statusLower.includes('will be delivered today'));

  console.log(
    `[Amazon Orders]   isDelivered: ${isDelivered}, isDeliveryExpectedToday: ${isDeliveryExpectedToday}`
  );

  return { isDelivered, isDeliveryExpectedToday };
}

function buildOrderDetailsUrl(orderId: string): string {
  return `${AMAZON_ORDER_DETAILS_URL_BASE}${orderId}`;
}

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function extractOrderDate(card: HTMLElement, orderId: string): string {
  // Look for the "Order placed" label and get the date from the next row
  const headerItems = card.querySelectorAll('.order-header__header-list-item');

  for (const item of headerItems) {
    const labelEl = item.querySelector('.a-text-caps');
    if (labelEl?.textContent?.toLowerCase().includes('order placed')) {
      // The date is in a sibling element
      const dateEl = item.querySelector('.a-size-base.a-color-secondary');
      const dateText = dateEl?.textContent?.trim();
      if (!dateText) {
        throw new ParseFailureError(
          `Order ${orderId}: order date element is missing text`,
          undefined,
          location.href
        );
      }

      return parseDateToISO(dateText);
    }
  }

  throw new ParseFailureError(
    `Order ${orderId}: order date not found`,
    undefined,
    location.href
  );
}

function parseDateToISO(dateText: string): string {
  // Parse "December 10, 2025" format
  const match = dateText.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) {
    throw new ParseFailureError(
      `Could not parse order date: ${dateText}`,
      undefined,
      location.href
    );
  }

  const [, monthName, dayRaw, yearRaw] = match;
  const month = MONTH_MAP[monthName.toLowerCase()];
  if (!month) {
    throw new ParseFailureError(
      `Unknown month in order date: ${monthName}`,
      undefined,
      location.href
    );
  }

  return toISODateString(parseInt(yearRaw, 10), month, parseInt(dayRaw, 10));
}
