import { ParseFailureError, isParseFailureError } from '../lib/parse-failure';
import type { AliExpressTrackingResult, MessageType } from '../lib/types';

export default defineContentScript({
  matches: ['*://www.aliexpress.com/p/tracking/index.html*'],

  async main() {
    console.log('[AliExpress Tracking] Content script loaded');

    try {
      const tracking = await waitForTrackingAndParse();

      browser.runtime.sendMessage({
        type: 'ALIEXPRESS_TRACKING_SCRAPED',
        tracking,
      } satisfies MessageType);
    } catch (error) {
      if (!isParseFailureError(error)) {
        throw error;
      }

      console.error('[AliExpress Tracking] Parse failure:', error);
      browser.runtime.sendMessage({
        type: 'PARSE_FAILURE',
        site: 'aliexpress',
        phase: 'aliexpress-tracking',
        reason: error.reason ?? error.message,
        url: error.url ?? location.href,
      } satisfies MessageType);
    }
  },
});

const MAX_WAIT_MS = 15000;
const POLL_INTERVAL_MS = 500;

const HEADER_SELECTOR = '[class*="arrival-time-v2--title"]';
const NODE_SELECTOR = '[class*="logistic-info-v2--node--"]';
const NODE_TITLE_SELECTOR = '[class*="nodeTitle"]';
const NODE_DESC_SELECTOR = '[class*="nodeDesc"]';
const NODE_TIME_SELECTOR = '[class*="nodeTime"]';
const ORDER_ID_PARAM = 'tradeOrderId';

const ESTIMATED_DELIVERY_REGEX = /Estimated delivery:\s*([^,]+)/i;
const ESTIMATED_DELIVERY_DATE_REGEX = /([A-Za-z]{3})\s+(\d{1,2})/;
const ESTIMATED_DELIVERY_MONTHS = new Set([
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]);

async function waitForTrackingAndParse(): Promise<AliExpressTrackingResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const headerEl = document.querySelector(HEADER_SELECTOR);
    if (headerEl) {
      return parseTrackingPage(headerEl as HTMLElement);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new ParseFailureError('Timed out waiting for tracking header', undefined, location.href);
}

function parseTrackingPage(headerEl: HTMLElement): AliExpressTrackingResult {
  const orderId = getOrderId();
  if (!orderId) {
    throw new ParseFailureError('Missing tradeOrderId in URL', undefined, location.href);
  }

  const { isDelivered, estimatedDelivery } = parseHeaderInfo(headerEl);
  const { statusTitle, statusDetail, timestamp } = parseCurrentNode(isDelivered);

  return {
    orderId,
    currentStatus: statusTitle,
    statusDetail,
    isDelivered,
    estimatedDelivery,
    timestamp,
  };
}

function getOrderId(): string | null {
  return new URLSearchParams(location.search).get(ORDER_ID_PARAM);
}

function parseHeaderInfo(headerEl: HTMLElement): {
  isDelivered: boolean;
  estimatedDelivery: string | null;
} {
  const headerText = headerEl.textContent?.trim() ?? '';
  const hasEstimatedDelivery = headerText.toLowerCase().includes('estimated delivery');
  const isDelivered = headerText.toLowerCase().includes('delivered');
  const estimatedDeliveryMatch = headerText.match(ESTIMATED_DELIVERY_REGEX);
  const estimatedDelivery = estimatedDeliveryMatch?.[1]?.trim() ?? null;

  if (hasEstimatedDelivery) {
    if (!estimatedDelivery) {
      throw new ParseFailureError(
        'Estimated delivery label found but no date parsed',
        undefined,
        location.href
      );
    }

    const dateMatch = estimatedDelivery.match(ESTIMATED_DELIVERY_DATE_REGEX);
    const month = dateMatch?.[1]?.toLowerCase() ?? null;
    if (!dateMatch || !month || !ESTIMATED_DELIVERY_MONTHS.has(month)) {
      throw new ParseFailureError(
        `Could not parse estimated delivery date: ${estimatedDelivery}`,
        undefined,
        location.href
      );
    }
  }

  return { isDelivered, estimatedDelivery };
}

function parseCurrentNode(isDelivered: boolean): {
  statusTitle: string;
  statusDetail: string;
  timestamp: string;
} {
  const nodes = document.querySelectorAll(NODE_SELECTOR);
  const currentNode = nodes.length > 0 ? (nodes[0] as HTMLElement) : null;

  if (!currentNode) {
    throw new ParseFailureError('No timeline nodes found', undefined, location.href);
  }

  const statusTitle =
    currentNode?.querySelector(NODE_TITLE_SELECTOR)?.textContent?.trim() ??
    (isDelivered ? 'Delivered' : 'In transit');

  const statusDescEls = currentNode?.querySelectorAll(NODE_DESC_SELECTOR) ?? [];
  const statusDetail = Array.from(statusDescEls)
    .map((el) => el.textContent?.trim())
    .filter((text): text is string => Boolean(text))
    .join(' ');

  const timestamp = currentNode?.querySelector(NODE_TIME_SELECTOR)?.textContent?.trim() ?? '';

  return { statusTitle, statusDetail, timestamp };
}
