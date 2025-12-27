import { Temporal } from '@js-temporal/polyfill';
import type { OrderSite, OrderStatus, MessageType } from '../lib/types';

export default defineContentScript({
  matches: ['*://www.amazon.ca/gp/css/order-history*', '*://www.amazon.ca/your-orders/*'],

  async main() {
    console.log('[Amazon Orders] Content script loaded');

    // Wait for order cards to appear in the DOM
    const orders = await waitForOrdersAndParse();
    console.log(`[Amazon Orders] Found ${orders.length} orders`);

    browser.runtime.sendMessage({
      type: 'ORDERS_SCRAPED',
      site: SITE,
      orders,
    } satisfies MessageType);
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

  console.warn('[Amazon Orders] Timed out waiting for order cards');
  return [];
}

function parseOrderCards(): OrderStatus[] {
  const orderCards = document.querySelectorAll('.order-card');
  const orders: OrderStatus[] = [];

  for (const [index, card] of Array.from(orderCards).entries()) {
    try {
      const order = parseOrderCard(card as HTMLElement);
      if (order) {
        orders.push(order);
      }
    } catch (e) {
      console.error('[Amazon Orders] Error parsing order card:', {
        index,
        error: e,
      });
    }
  }

  return orders;
}

function parseOrderCard(card: HTMLElement): OrderStatus | null {
  const orderId = extractOrderId(card);
  if (!orderId) {
    return null;
  }

  console.log(`[Amazon Orders] Parsing order ${orderId}`);

  const { status, statusDetail } = extractStatus(card);
  const { productTitles, productUrls } = extractProducts(card);
  const orderDate = extractOrderDate(card);
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
  };
}

const AMAZON_ORDER_DETAILS_URL_BASE = 'https://www.amazon.ca/gp/css/order-details?orderID=';

function extractOrderId(card: HTMLElement): string | null {
  const orderIdEl = card.querySelector('.yohtmlc-order-id span[dir="ltr"]');
  const orderId = orderIdEl?.textContent?.trim();
  if (!orderId) {
    console.warn('[Amazon Orders] Could not find order ID, skipping card');
    return null;
  }

  return orderId;
}

function extractStatus(card: HTMLElement): { status: string; statusDetail: string } {
  const statusEl = card.querySelector('.delivery-box__primary-text');
  const status = statusEl?.textContent?.trim() ?? 'Unknown';
  console.log(`[Amazon Orders]   status: "${status}"${!statusEl ? ' (element not found)' : ''}`);

  const statusDetailEl = card.querySelector('.delivery-box__secondary-text');
  const statusDetail = statusDetailEl?.textContent?.trim() ?? '';
  console.log(
    `[Amazon Orders]   statusDetail: "${statusDetail}"${!statusDetailEl ? ' (element not found)' : ''}`
  );

  return { status, statusDetail };
}

function extractProducts(card: HTMLElement): { productTitles: string[]; productUrls: string[] } {
  const productTitleEls = card.querySelectorAll('.yohtmlc-product-title a');
  const productTitles: string[] = [];
  const productUrls: string[] = [];

  for (const el of productTitleEls) {
    const title = el.textContent?.trim();
    const href = (el as HTMLAnchorElement).href;
    if (title) {
      productTitles.push(title);
      productUrls.push(href);
    }
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

function extractOrderDate(card: HTMLElement): string | null {
  // Look for the "Order placed" label and get the date from the next row
  const headerItems = card.querySelectorAll('.order-header__header-list-item');

  for (const item of headerItems) {
    const labelEl = item.querySelector('.a-text-caps');
    if (labelEl?.textContent?.toLowerCase().includes('order placed')) {
      // The date is in a sibling element
      const dateEl = item.querySelector('.a-size-base.a-color-secondary');
      const dateText = dateEl?.textContent?.trim();
      if (dateText) {
        return parseDateToISO(dateText);
      }
    }
  }

  return null;
}

function parseDateToISO(dateText: string): string | null {
  // Parse "December 10, 2025" format
  const match = dateText.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!match) {
    console.warn(`[Amazon Orders] Could not parse date: ${dateText}`);
    return null;
  }

  const [, monthName, day, year] = match;
  const month = MONTH_MAP[monthName.toLowerCase()];
  if (!month) {
    console.warn(`[Amazon Orders] Unknown month: ${monthName}`);
    return null;
  }

  const plainDate = Temporal.PlainDate.from({
    year: parseInt(year, 10),
    month,
    day: parseInt(day, 10),
  });

  return plainDate.toString();
}
