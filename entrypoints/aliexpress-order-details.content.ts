import { defineScrapingScript } from '../lib/define-scraping-script';
import { sendMessage } from '../lib/messaging';
import { ParseFailureError, isParseFailureError } from '../lib/parse-failure';
import type { AliExpressOrderDetailsResult } from '../lib/types';

export default defineScrapingScript({
  matches: ['*://www.aliexpress.com/p/order/detail.html*'],

  async scrape() {
    console.log('[AliExpress Order Details] Scraping details');

    try {
      const details = await waitForOrderDetailsAndParse();

      await sendMessage('aliexpress:orderDetails', { details });
    } catch (error) {
      if (!isParseFailureError(error)) {
        throw error;
      }

      console.error('[AliExpress Order Details] Parse failure:', error);
      await sendMessage('scrape:parseFailure', {
        site: 'aliexpress',
        phase: 'aliexpress-order-details',
        reason: error.reason ?? error.message,
        url: error.url ?? location.href,
      });
    }
  },
});

const MAX_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 500;

const ITEM_TITLE_SELECTOR = '.order-detail-item-content-info .item-title a';
const ORDER_ID_PARAM = 'orderId';

async function waitForOrderDetailsAndParse(): Promise<AliExpressOrderDetailsResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const titleEl = document.querySelector(ITEM_TITLE_SELECTOR);
    if (titleEl) {
      return parseOrderDetails(titleEl as HTMLAnchorElement);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new ParseFailureError('Timed out waiting for order detail item title', undefined, location.href);
}

function parseOrderDetails(titleEl: HTMLAnchorElement): AliExpressOrderDetailsResult {
  const orderId = getOrderId();
  if (!orderId) {
    throw new ParseFailureError('Missing orderId in URL', undefined, location.href);
  }

  const title = titleEl.textContent?.trim();
  if (!title) {
    throw new ParseFailureError(`Order ${orderId}: missing product title`, undefined, location.href);
  }

  const href = titleEl.href;
  if (!href) {
    throw new ParseFailureError(`Order ${orderId}: missing product URL`, undefined, location.href);
  }

  return {
    orderId,
    productTitle: title,
    productUrl: href,
  };
}

function getOrderId(): string | null {
  return new URLSearchParams(location.search).get(ORDER_ID_PARAM);
}
