import { Temporal } from '@js-temporal/polyfill';
import type { OrderStatus, MessageType } from '../lib/types';

export default defineContentScript({
  matches: ['*://www.amazon.ca/gp/css/order-history*', '*://www.amazon.ca/your-orders/*'],

  async main() {
    console.log('[Amazon Orders] Content script loaded');

    // Wait for order cards to appear in the DOM
    const orders = await waitForOrdersAndParse();
    console.log(`[Amazon Orders] Found ${orders.length} orders`);

    browser.runtime.sendMessage({
      type: 'ORDERS_SCRAPED',
      orders,
    } satisfies MessageType);
  },
});

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

  for (const card of orderCards) {
    try {
      const order = parseOrderCard(card as HTMLElement);
      if (order) {
        orders.push(order);
      }
    } catch (e) {
      console.error('[Amazon Orders] Error parsing order card:', e);
    }
  }

  return orders;
}

function parseOrderCard(card: HTMLElement): OrderStatus | null {
  // Extract order ID
  const orderIdEl = card.querySelector('.yohtmlc-order-id span[dir="ltr"]');
  const orderId = orderIdEl?.textContent?.trim();
  if (!orderId) {
    console.warn('[Amazon Orders] Could not find order ID, skipping card');
    return null;
  }
  console.log(`[Amazon Orders] Parsing order ${orderId}`);

  // Extract status (primary text like "Delivered today", "Out for delivery")
  const statusEl = card.querySelector('.delivery-box__primary-text');
  const status = statusEl?.textContent?.trim() ?? 'Unknown';
  console.log(`[Amazon Orders]   status: "${status}"${!statusEl ? ' (element not found)' : ''}`);

  // Extract status detail (secondary text like "Package was left near the front door")
  const statusDetailEl = card.querySelector('.delivery-box__secondary-text');
  const statusDetail = statusDetailEl?.textContent?.trim() ?? '';
  console.log(`[Amazon Orders]   statusDetail: "${statusDetail}"${!statusDetailEl ? ' (element not found)' : ''}`);

  // Extract product titles and URLs (there can be multiple items in one shipment)
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
  console.log(`[Amazon Orders]   products (${productTitles.length}): ${productTitles.map((t) => `"${t.slice(0, 40)}..."`).join(', ') || '(none found)'}`);

  // Build order details URL
  const orderUrl = `https://www.amazon.ca/gp/css/order-details?orderID=${orderId}`;

  // Extract order date from header
  const orderDate = extractOrderDate(card);
  console.log(`[Amazon Orders]   orderDate: ${orderDate ?? '(not found)'}`);

  // Determine delivery status flags
  const statusLower = status.toLowerCase();
  const isDelivered = statusLower.includes('delivered');
  const isDeliveryExpectedToday =
    !isDelivered &&
    (statusLower.includes('arriving today') ||
      statusLower.includes('out for delivery') ||
      statusLower.includes('will be delivered today'));
  console.log(`[Amazon Orders]   isDelivered: ${isDelivered}, isDeliveryExpectedToday: ${isDeliveryExpectedToday}`);

  return {
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
