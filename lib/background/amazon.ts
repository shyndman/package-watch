import type { OrderSite, OrderStatus } from '../types';
import { AMAZON_SITE, getSiteLabel } from './scheduler';

const AMAZON_ORDERS_URL = 'https://www.amazon.ca/gp/css/order-history';

type AmazonDependencies = {
  openOrderListTab: (site: OrderSite, url: string) => Promise<number | null>;
  handleScrapeFailure: (site: OrderSite) => void;
  closeScrapeTab: (tabId: number | undefined) => Promise<void>;
  clearScrapeTimeout: (site: OrderSite) => void;
  processOrdersForSite: (site: OrderSite, orders: OrderStatus[]) => Promise<void>;
};

export async function performAmazonScrape(deps: AmazonDependencies): Promise<void> {
  console.log(`[${getSiteLabel(AMAZON_SITE)}] Opening orders page in background tab`);
  const tabId = await deps.openOrderListTab(AMAZON_SITE, AMAZON_ORDERS_URL);
  if (!tabId) {
    deps.handleScrapeFailure(AMAZON_SITE);
  }
}

export async function handleAmazonOrdersScraped(
  orders: OrderStatus[],
  tabId: number | undefined,
  deps: AmazonDependencies
): Promise<void> {
  deps.clearScrapeTimeout(AMAZON_SITE);
  await deps.closeScrapeTab(tabId);
  await deps.processOrdersForSite(AMAZON_SITE, orders);
}
