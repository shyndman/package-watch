import { toISODateString } from '../lib/date';
import { defineScrapingScript } from '../lib/define-scraping-script';
import { sendMessage } from '../lib/messaging';
import { ParseFailureError, isParseFailureError } from '../lib/parse-failure';
import type { OrderSite, OrderStatus } from '../lib/types';

export default defineScrapingScript({
  matches: ['*://www.ebay.ca/mye/myebay/purchase*'],

  async scrape() {
    console.log('[eBay Orders] Scraping orders');

    try {
      const orders = await waitForOrdersAndParse();
      console.log(`[eBay Orders] Found ${orders.length} orders`);

      await sendMessage('orders:scraped', { site: SITE, orders });
    } catch (error) {
      if (!isParseFailureError(error)) {
        throw error;
      }

      console.error('[eBay Orders] Parse failure:', error);
      await sendMessage('scrape:parseFailure', {
        site: SITE,
        phase: 'ebay-orders',
        reason: error.reason ?? error.message,
        url: error.url ?? location.href,
      });
    }
  },
});

const SITE: OrderSite = 'ebay';
const MAX_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 500;
const ORDER_CARD_SELECTOR = '.m-order-card';

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

const ORDER_ID_REGEX = /Order number:\s*([\d-]+)/;
const ORDER_DATE_REGEX = /Order date:\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/;
const DELIVERED_PREFIX_REGEX = /^\s*Delivered\b/;
// Weekday words are noise: a 3-letter weekday is always followed by another word
// (e.g. "Mon Jun"), never by a day number, so this only captures "<Mon> <Day>".
const DELIVERY_DATE_REGEX = /([A-Z][a-z]{2}) (\d{1,2})/g;
const DELIVERY_READY_REGEX = /Delivered\b|Estimated delivery/i;

async function waitForOrdersAndParse(): Promise<OrderStatus[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    if (deliveryEstimatesReady(document.body)) {
      return parseEbayOrders(document.body);
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, POLL_INTERVAL_MS);
    await promise;
  }

  throw new ParseFailureError(
    'Order cards or delivery estimates did not finish loading',
    undefined,
    location.href
  );
}

/**
 * eBay injects the "Estimated delivery ..." line into each card asynchronously,
 * after the card itself renders; until then the estimate element holds only the
 * trailing "Returns accepted ..." clause. Parsing in that window misreads an
 * in-transit order as dateless and throws. Ready = at least one card present and
 * every card's estimate either shows a delivery date or is already delivered.
 */
export function deliveryEstimatesReady(root: ParentNode): boolean {
  const cards = root.querySelectorAll<HTMLElement>(ORDER_CARD_SELECTOR);
  if (cards.length === 0) {
    return false;
  }
  for (const card of cards) {
    const text = card.querySelector('[class*="deliveryEstimateMessage"]')?.textContent ?? '';
    if (!DELIVERY_READY_REGEX.test(text)) {
      return false;
    }
  }
  return true;
}

/**
 * Parses every eBay purchase card within `root` into an OrderStatus. Pure: the
 * only side effect is the ParseFailureError thrown by an unparseable in-transit
 * delivery estimate (the live-day safety net).
 */
export function parseEbayOrders(root: ParentNode): OrderStatus[] {
  const cards = root.querySelectorAll<HTMLElement>(ORDER_CARD_SELECTOR);
  return Array.from(cards).map(parseEbayOrderCard);
}

function parseEbayOrderCard(card: HTMLElement): OrderStatus {
  const secondaryText = card.querySelector('.secondaryMessage')?.textContent ?? '';
  const orderId = secondaryText.match(ORDER_ID_REGEX)?.[1] ?? '';

  const dateMatch = secondaryText.match(ORDER_DATE_REGEX);
  let orderDate: string | null = null;
  if (dateMatch) {
    const [, monthAbbr, day, year] = dateMatch;
    const month = MONTH_MAP[monthAbbr.toLowerCase()];
    if (month !== undefined) {
      orderDate = toISODateString(parseInt(year, 10), month, parseInt(day, 10));
    }
  }

  const orderUrl =
    card.querySelector<HTMLAnchorElement>('a[href*="order.ebay"]')?.getAttribute('href') ?? '';

  const productTitles: string[] = [];
  const productUrls: string[] = [];
  for (const item of card.querySelectorAll<HTMLElement>('.m-item-card')) {
    const titleEl =
      item.querySelector('.title-heading') ??
      item.querySelector('[class*="item-info-title"] .title-heading');
    productTitles.push(titleEl?.textContent?.trim() ?? '');
    productUrls.push(
      item.querySelector<HTMLAnchorElement>('a[href*="/itm/"]')?.getAttribute('href') ?? ''
    );
  }

  const status = card.querySelector('.primaryMessage')?.textContent?.trim() ?? '';
  const deliveryMessage =
    card.querySelector('[class*="deliveryEstimateMessage"]')?.textContent ?? '';
  const statusDetail = deliveryMessage.trim();
  const isDelivered = DELIVERED_PREFIX_REGEX.test(deliveryMessage);

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
    isDeliveryExpectedToday: isDelivered ? false : isDeliveryExpectedToday(deliveryMessage),
    deliveredAt: null,
  };
}

/**
 * True iff today falls within the in-transit estimate's delivery window. eBay
 * estimates carry no year ("Estimated delivery Friday Jul 3 ..." or a range
 * "... Mon Jun 30 - Wed Jul 2 ..."); the year is inferred, rolling to next year
 * when the month is already behind us (Dec->Jan).
 *
 * Throws when the wording yields no parseable date so the scrape fails loudly
 * the day eBay changes the format, rather than silently never notifying.
 */
export function isDeliveryExpectedToday(estimatedText: string): boolean {
  const body = estimatedText
    .replace(/^\s*Estimated delivery\s*/i, '')
    .split(/\bReturns?\b/)[0];

  const today = Temporal.Now.plainDateISO();
  const dates: Temporal.PlainDate[] = [];
  for (const [, monthAbbr, day] of body.matchAll(DELIVERY_DATE_REGEX)) {
    const month = MONTH_MAP[monthAbbr.toLowerCase()];
    if (month === undefined) {
      continue;
    }
    const year = month < today.month ? today.year + 1 : today.year;
    dates.push(Temporal.PlainDate.from({ year, month, day: parseInt(day, 10) }));
  }

  if (dates.length === 0) {
    throw new ParseFailureError('Unparseable eBay delivery estimate', estimatedText, location.href);
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  return (
    Temporal.PlainDate.compare(firstDate, today) <= 0 &&
    Temporal.PlainDate.compare(today, lastDate) <= 0
  );
}
