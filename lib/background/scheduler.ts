import type { OrderSite, OrderStatus } from '../types';

export const AMAZON_SITE: OrderSite = 'amazon';
export const ALIEXPRESS_SITE: OrderSite = 'aliexpress';

const AMAZON_ALARM_NAME = 'scrape-amazon';
const ALIEXPRESS_ALARM_NAME = 'scrape-aliexpress';

const DEFAULT_INTERVAL_MINUTES_BY_SITE: Record<OrderSite, number> = {
  amazon: 30,
  aliexpress: 120,
};

const ACTIVE_INTERVAL_MINUTES_BY_SITE: Record<OrderSite, number> = {
  amazon: 10,
  aliexpress: 10,
};

const ACTIVE_HOURS_START = 7;
const ACTIVE_HOURS_END = 22;

export const SCRAPE_TIMEOUT_MS = 30000;

const SITE_LABELS: Record<OrderSite, string> = {
  amazon: 'Amazon Orders',
  aliexpress: 'AliExpress Orders',
};

export function getAlarmName(site: OrderSite): string {
  return site === AMAZON_SITE ? AMAZON_ALARM_NAME : ALIEXPRESS_ALARM_NAME;
}

export function getSiteLabel(site: OrderSite): string {
  return SITE_LABELS[site];
}

export function scheduleNextCheck(site: OrderSite, orders: OrderStatus[]): void {
  const intervalMinutes = calculateInterval(site, orders);
  console.log(`[${getSiteLabel(site)}] Scheduling next check in ${intervalMinutes} minutes`);

  browser.alarms.create(getAlarmName(site), {
    delayInMinutes: intervalMinutes,
  });
}

function calculateInterval(site: OrderSite, orders: OrderStatus[]): number {
  const hasActiveDeliveryToday = orders.some(
    (order) => order.isDeliveryExpectedToday && !order.isDelivered
  );

  if (!hasActiveDeliveryToday) {
    return DEFAULT_INTERVAL_MINUTES_BY_SITE[site];
  }

  const hour = Temporal.Now.plainDateTimeISO().hour;
  const isActiveHours = hour >= ACTIVE_HOURS_START && hour < ACTIVE_HOURS_END;

  return isActiveHours
    ? ACTIVE_INTERVAL_MINUTES_BY_SITE[site]
    : DEFAULT_INTERVAL_MINUTES_BY_SITE[site];
}
