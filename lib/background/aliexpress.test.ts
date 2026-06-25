import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AliExpressDiscoveredOrder,
  AliExpressOrderDetailsResult,
  AliExpressTrackingResult,
} from '../types';
import type { AliExpressDependencies } from './aliexpress';

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('AliExpress single-tab scrape', () => {
  let aliexpress: typeof import('./aliexpress');
  let deps: AliExpressDependencies;

  beforeEach(async () => {
    vi.resetModules();
    aliexpress = await import('./aliexpress');

    deps = {
      openOrderListTab: vi.fn(),
      handleScrapeFailure: vi.fn(),
      closeScrapeTab: vi.fn(),
      clearScrapeTimeout: vi.fn(),
      processOrdersForSite: vi.fn(),
      sendAuthFailedNotification: vi.fn(),
      navigateScrapeTab: vi.fn(),
      getStoredOrders: vi.fn().mockResolvedValue({ orders: {}, lastChecked: 0 }),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleAliExpressOrdersDiscovered', () => {
    const makeOrder = (orderId: string, completed = false): AliExpressDiscoveredOrder => ({
      orderId,
      highLevelStatus: completed ? 'Completed' : 'Awaiting delivery',
      orderDate: '2025-01-01',
      storeName: 'Test Store',
      orderDetailsUrl: `https://www.aliexpress.com/p/order/detail.html?orderId=${orderId}`,
      trackingUrl: completed
        ? null
        : `https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=${orderId}`,
    });

    const makeDetails = (orderId: string): AliExpressOrderDetailsResult => ({
      orderId,
      productTitle: `Product ${orderId}`,
      productUrl: `https://www.aliexpress.com/item/${orderId}.html`,
    });

    const makeTracking = (orderId: string): AliExpressTrackingResult => ({
      orderId,
      currentStatus: 'In transit',
      statusDetail: 'Package in transit',
      isDelivered: false,
      estimatedDelivery: 'Jan 15',
      timestamp: '2025-01-10',
    });

    it('uses single tab for entire scrape sequence', async () => {
      const orders = [makeOrder('order1'), makeOrder('order2')];
      const tabId = 42;

      // Start the scrape
      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);

      // Wait for first navigation (order1 details)
      await flushPromises();
      expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(1);
      expect(deps.navigateScrapeTab).toHaveBeenCalledWith(
        tabId,
        'https://www.aliexpress.com/p/order/detail.html?orderId=order1'
      );

      // Simulate details response for order1
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order1'), tabId, deps);
      await flushPromises();

      // Should navigate to order2 details
      expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(2);
      expect(deps.navigateScrapeTab).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/order/detail.html?orderId=order2'
      );

      // Simulate details response for order2
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order2'), tabId, deps);
      await flushPromises();

      // Should navigate to order1 tracking
      expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(3);
      expect(deps.navigateScrapeTab).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order1'
      );

      // Simulate tracking response for order1
      aliexpress.handleAliExpressTrackingMessage(makeTracking('order1'), tabId, deps);
      await flushPromises();

      // Should navigate to order2 tracking
      expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(4);
      expect(deps.navigateScrapeTab).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order2'
      );

      // Simulate tracking response for order2
      aliexpress.handleAliExpressTrackingMessage(makeTracking('order2'), tabId, deps);
      await scrapePromise;

      // Tab should be closed exactly once at the end
      expect(deps.closeScrapeTab).toHaveBeenCalledTimes(1);
      expect(deps.closeScrapeTab).toHaveBeenCalledWith(tabId);

      // Orders should be processed
      expect(deps.processOrdersForSite).toHaveBeenCalledTimes(1);
    });

    it('skips details and tracking for completed orders', async () => {
      const orders = [makeOrder('order1', true), makeOrder('order2', false)];
      const tabId = 42;

      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);

      // order1 is completed: its detail page is skipped. First navigation is order2 details.
      await flushPromises();
      expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(1);
      expect(deps.navigateScrapeTab).toHaveBeenCalledWith(
        tabId,
        'https://www.aliexpress.com/p/order/detail.html?orderId=order2'
      );

      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order2'), tabId, deps);
      await flushPromises();

      // Only tracking for order2 (order1 is completed)
      expect(deps.navigateScrapeTab).toHaveBeenCalledTimes(2);
      expect(deps.navigateScrapeTab).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order2'
      );

      // No call ever used an order1 URL.
      const calledUrls = (deps.navigateScrapeTab as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[1]
      );
      expect(calledUrls.some((url: string) => url.includes('order1'))).toBe(false);

      aliexpress.handleAliExpressTrackingMessage(makeTracking('order2'), tabId, deps);
      await scrapePromise;

      expect(deps.closeScrapeTab).toHaveBeenCalledTimes(1);
    });

    it('backfills product info for completed orders from stored state', async () => {
      const orders = [makeOrder('order1', true), makeOrder('order2', false)];
      const tabId = 42;

      (deps.getStoredOrders as ReturnType<typeof vi.fn>).mockResolvedValue({
        orders: {
          order1: {
            site: 'aliexpress',
            orderId: 'order1',
            status: 'Completed',
            statusDetail: '',
            productTitles: ['Stored P1'],
            productUrls: ['https://stored/1'],
            orderUrl: 'https://www.aliexpress.com/p/order/detail.html?orderId=order1',
            orderDate: '2025-01-01',
            isDeliveryExpectedToday: false,
            isDelivered: true,
            deliveredAt: '2025-01-05',
          },
        },
        lastChecked: 0,
      });

      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);

      await flushPromises();
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order2'), tabId, deps);
      await flushPromises();
      aliexpress.handleAliExpressTrackingMessage(makeTracking('order2'), tabId, deps);
      await scrapePromise;

      expect(deps.processOrdersForSite).toHaveBeenCalledTimes(1);
      const processed = (deps.processOrdersForSite as ReturnType<typeof vi.fn>).mock
        .calls[0][1] as import('../types').OrderStatus[];
      const order1Status = processed.find((status) => status.orderId === 'order1');
      expect(order1Status?.productTitles).toEqual(['Stored P1']);
      expect(order1Status?.productUrls).toEqual(['https://stored/1']);
    });

    it('closes tab on failure when no tabId provided', async () => {
      await aliexpress.handleAliExpressOrdersDiscovered([], undefined, deps);

      expect(deps.handleScrapeFailure).toHaveBeenCalledWith('aliexpress');
      expect(deps.navigateScrapeTab).not.toHaveBeenCalled();
    });
  });

  describe('handleAliExpressOrderDetailsMessage', () => {
    it('resolves pending request without closing tab', async () => {
      const tabId = 42;
      const orders: AliExpressDiscoveredOrder[] = [
        {
          orderId: 'order1',
          highLevelStatus: 'Completed',
          orderDate: '2025-01-01',
          storeName: 'Test Store',
          orderDetailsUrl: 'https://www.aliexpress.com/p/order/detail.html?orderId=order1',
          trackingUrl: null,
        },
      ];

      // Start scrape to set up pending request
      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);
      await flushPromises();

      // Handle the message
      aliexpress.handleAliExpressOrderDetailsMessage(
        { orderId: 'order1', productTitle: 'Test', productUrl: 'https://example.com' },
        tabId,
        deps
      );

      await scrapePromise;

      // Tab should only be closed once at the end by orchestrator, not by message handler
      expect(deps.closeScrapeTab).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleAliExpressTrackingMessage', () => {
    it('resolves pending request without closing tab', async () => {
      const tabId = 42;
      const orders: AliExpressDiscoveredOrder[] = [
        {
          orderId: 'order1',
          highLevelStatus: 'Awaiting delivery',
          orderDate: '2025-01-01',
          storeName: 'Test Store',
          orderDetailsUrl: 'https://www.aliexpress.com/p/order/detail.html?orderId=order1',
          trackingUrl: 'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order1',
        },
      ];

      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);
      await flushPromises();

      // Details phase
      aliexpress.handleAliExpressOrderDetailsMessage(
        { orderId: 'order1', productTitle: 'Test', productUrl: 'https://example.com' },
        tabId,
        deps
      );
      await flushPromises();

      // Tracking phase
      aliexpress.handleAliExpressTrackingMessage(
        {
          orderId: 'order1',
          currentStatus: 'In transit',
          statusDetail: 'Package in transit',
          isDelivered: false,
          estimatedDelivery: 'Jan 15',
          timestamp: '2025-01-10',
        },
        tabId,
        deps
      );

      await scrapePromise;

      // Tab closed once at the end
      expect(deps.closeScrapeTab).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('closes tab on order details parse failure', async () => {
      const tabId = 42;
      // Use a completed order so there's no tracking phase after details
      const orders: AliExpressDiscoveredOrder[] = [
        {
          orderId: 'order1',
          highLevelStatus: 'Completed',
          orderDate: '2025-01-01',
          storeName: 'Test Store',
          orderDetailsUrl: 'https://www.aliexpress.com/p/order/detail.html?orderId=order1',
          trackingUrl: null,
        },
      ];

      // Start scrape
      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);
      await flushPromises();

      // Simulate parse failure (this closes the tab and resolves with null)
      await aliexpress.handleAliExpressOrderDetailsParseFailure(tabId, deps);

      // The scrape should complete (with null result for details)
      await scrapePromise;

      // Tab should be closed by parse failure handler
      expect(deps.closeScrapeTab).toHaveBeenCalledWith(tabId);
    });

    it('closes tab on tracking parse failure', async () => {
      const tabId = 42;
      const orders: AliExpressDiscoveredOrder[] = [
        {
          orderId: 'order1',
          highLevelStatus: 'Awaiting delivery',
          orderDate: '2025-01-01',
          storeName: 'Test Store',
          orderDetailsUrl: 'https://www.aliexpress.com/p/order/detail.html?orderId=order1',
          trackingUrl: 'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order1',
        },
      ];

      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);
      await flushPromises();

      // Complete details phase
      aliexpress.handleAliExpressOrderDetailsMessage(
        { orderId: 'order1', productTitle: 'Test', productUrl: 'https://example.com' },
        tabId,
        deps
      );
      await flushPromises();

      // Simulate tracking parse failure (this closes the tab and resolves with null)
      await aliexpress.handleAliExpressTrackingParseFailure(tabId, deps);

      await scrapePromise;

      // Tab should be closed by parse failure handler
      expect(deps.closeScrapeTab).toHaveBeenCalledWith(tabId);
    });
  });
});

describe('isEstimatedDeliveryToday', () => {
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  let isEstimatedDeliveryToday: typeof import('./aliexpress').isEstimatedDeliveryToday;

  beforeEach(async () => {
    vi.resetModules();
    ({ isEstimatedDeliveryToday } = await import('./aliexpress'));
  });

  const fmt = (date: Temporal.PlainDate, withPeriod: boolean): string =>
    `${MONTHS[date.month - 1]}${withPeriod ? '.' : ''} ${date.day}`;

  it('returns true for a single date that is today, with a period', () => {
    const today = Temporal.Now.plainDateISO();
    expect(isEstimatedDeliveryToday(`Delivery: ${fmt(today, true)}`)).toBe(true);
  });

  it('returns true for a single date that is today, without a period', () => {
    const today = Temporal.Now.plainDateISO();
    expect(isEstimatedDeliveryToday(fmt(today, false))).toBe(true);
  });

  it('returns false for a date range even when today is the start of it', () => {
    const today = Temporal.Now.plainDateISO();
    const end = today.add({ days: 7 });
    expect(isEstimatedDeliveryToday(`${fmt(today, true)} - ${fmt(end, true)}`)).toBe(false);
  });

  it('returns false when the single date is not today', () => {
    const other = Temporal.Now.plainDateISO().add({ days: 3 });
    expect(isEstimatedDeliveryToday(fmt(other, true))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEstimatedDeliveryToday(null)).toBe(false);
  });
});
