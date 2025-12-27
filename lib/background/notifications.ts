import type { OrderSite, OrderStatus } from '../types';
import { AMAZON_SITE, getSiteLabel } from './scheduler';

const NOTIFICATION_ICON_PATH = '/icon/128.png';
const NOTIFICATION_SOUND_PATH = '/assets/notification.mp3';
const PRODUCT_SUMMARY_MAX_LENGTH = 50;
const PRODUCT_SUMMARY_SUFFIX = '...';

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
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL(NOTIFICATION_ICON_PATH),
      title,
      message,
    });

    if (shouldPlaySound) {
      const audio = new Audio(browser.runtime.getURL(NOTIFICATION_SOUND_PATH));
      audio.play();
    }
  } catch (e) {
    console.error(`[${getSiteLabel(site)}] Error sending notification:`, e);
  }
}

export async function sendParseFailureNotification(site: OrderSite): Promise<void> {
  const title =
    site === AMAZON_SITE
      ? 'Amazon parsing may be broken'
      : 'AliExpress parsing may be broken';
  const message =
    site === AMAZON_SITE
      ? 'No orders found. The Amazon page structure may have changed.'
      : 'No orders found. The AliExpress page structure may have changed.';

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
