import type { OrderSite, OrderStatus } from '../types';
import { EBAY_SITE, getSiteLabel } from './scheduler';

const EBAY_ORDERS_URL = 'https://www.ebay.ca/mye/myebay/purchase';

type EbayDependencies = {
  openOrderListTab: (site: OrderSite, url: string) => Promise<number | null>;
  handleScrapeFailure: (site: OrderSite) => void;
  closeScrapeTab: (tabId: number | undefined) => Promise<void>;
  clearScrapeTimeout: (site: OrderSite) => void;
  processOrdersForSite: (site: OrderSite, orders: OrderStatus[]) => Promise<void>;
};

export async function performEbayScrape(deps: EbayDependencies): Promise<void> {
  console.log(`[${getSiteLabel(EBAY_SITE)}] Opening orders page in background tab`);
  const tabId = await deps.openOrderListTab(EBAY_SITE, EBAY_ORDERS_URL);
  if (!tabId) {
    deps.handleScrapeFailure(EBAY_SITE);
  }
}

export async function handleEbayOrdersScraped(
  orders: OrderStatus[],
  tabId: number | undefined,
  deps: EbayDependencies
): Promise<void> {
  deps.clearScrapeTimeout(EBAY_SITE);
  await deps.closeScrapeTab(tabId);
  await deps.processOrdersForSite(EBAY_SITE, orders);
}
