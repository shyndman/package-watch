import type { OrderSite, OrderStatus } from '../types';
import { AMAZON_SITE, getSiteLabel } from './scheduler';

const NOTIFICATION_ICON_PATH = '/icon/128.png';
const NOTIFICATION_SOUND_PATH = '/assets/notification.mp3';
const PRODUCT_SUMMARY_MAX_LENGTH = 50;
const PRODUCT_SUMMARY_SUFFIX = '...';

/** Maps notification IDs to order URLs for click handling */
const notificationUrlMap = new Map<string, string>();

export function getNotificationUrl(notificationId: string): string | undefined {
  return notificationUrlMap.get(notificationId);
}

export function clearNotificationUrl(notificationId: string): void {
  notificationUrlMap.delete(notificationId);
}

export async function sendNotification(
  order: OrderStatus,
  shouldPlaySound: boolean,
  site: OrderSite
): Promise<void> {
  const productSummary = buildProductSummary(order);
  const title = order.status;
  const message = `${productSummary}\n${order.statusDetail}`.trim();

  console.log(`[${getSiteLabel(site)}] Sending notification: ${title}`);

  try {
    const notificationId = await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL(NOTIFICATION_ICON_PATH),
      title,
      message,
    });

    notificationUrlMap.set(notificationId, order.orderUrl);

    if (shouldPlaySound) {
      const audio = new Audio(browser.runtime.getURL(NOTIFICATION_SOUND_PATH));
      audio.play();
    }
  } catch (e) {
    console.error(`[${getSiteLabel(site)}] Error sending notification:`, e);
  }
}

export async function sendParseFailureNotification(
  site: OrderSite,
  reason?: string,
  url?: string
): Promise<void> {
  const title =
    site === AMAZON_SITE
      ? 'Amazon parsing may be broken'
      : 'AliExpress parsing may be broken';
  const baseMessage =
    site === AMAZON_SITE
      ? 'Parsing failed. The Amazon page structure may have changed.'
      : 'Parsing failed. The AliExpress page structure may have changed.';
  const messageParts = [baseMessage];
  if (reason) {
    messageParts.push(`Reason: ${reason}`);
  }
  if (url) {
    messageParts.push(`URL: ${url}`);
  }
  const message = messageParts.join('\n');

  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL(NOTIFICATION_ICON_PATH),
      title,
      message,
    });
  } catch (e) {
    console.error(`[${getSiteLabel(site)}] Error sending parse failure notification:`, e);
  }
}

export async function sendAuthFailedNotification(): Promise<void> {
  try {
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL(NOTIFICATION_ICON_PATH),
      title: 'AliExpress session expired',
      message: 'Please log in to AliExpress to resume order tracking.',
    });
  } catch (e) {
    console.error('[AliExpress Orders] Error sending auth failed notification:', e);
  }
}

function buildProductSummary(order: OrderStatus): string {
  if (order.productTitles.length === 0) {
    return 'Unknown item';
  }

  const title = order.productTitles[0];
  if (title.length <= PRODUCT_SUMMARY_MAX_LENGTH) {
    return title;
  }

  return `${title.slice(0, PRODUCT_SUMMARY_MAX_LENGTH)}${PRODUCT_SUMMARY_SUFFIX}`;
}
