import type { AliExpressTrackingResult, MessageType } from '../lib/types';

export default defineContentScript({
  matches: ['*://www.aliexpress.com/p/tracking/index.html*'],

  async main() {
    console.log('[AliExpress Tracking] Content script loaded');

    const tracking = await waitForTrackingAndParse();
    if (!tracking) {
      console.warn('[AliExpress Tracking] No tracking data parsed');
      return;
    }

    browser.runtime.sendMessage({
      type: 'ALIEXPRESS_TRACKING_SCRAPED',
      tracking,
    } satisfies MessageType);
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

async function waitForTrackingAndParse(): Promise<AliExpressTrackingResult | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    const headerEl = document.querySelector(HEADER_SELECTOR);
    if (headerEl) {
      return parseTrackingPage(headerEl as HTMLElement);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.warn('[AliExpress Tracking] Timed out waiting for tracking header');
  return null;
}

function parseTrackingPage(headerEl: HTMLElement): AliExpressTrackingResult | null {
  const orderId = getOrderId();
  if (!orderId) {
    console.error('[AliExpress Tracking] Missing tradeOrderId in URL');
    return null;
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
  const isDelivered = headerText.toLowerCase().includes('delivered');
  const estimatedDeliveryMatch = headerText.match(ESTIMATED_DELIVERY_REGEX);
  const estimatedDelivery = estimatedDeliveryMatch?.[1]?.trim() ?? null;

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
    console.warn('[AliExpress Tracking] No timeline nodes found');
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
