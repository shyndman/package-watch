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
  let closeScrapeTabSpy: ReturnType<typeof vi.fn>;
  let navigateScrapeTabSpy: ReturnType<typeof vi.fn>;
  let processOrdersForSiteSpy: ReturnType<typeof vi.fn>;
  let handleScrapeFailureSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    aliexpress = await import('./aliexpress');

    closeScrapeTabSpy = vi.fn();
    navigateScrapeTabSpy = vi.fn();
    processOrdersForSiteSpy = vi.fn();
    handleScrapeFailureSpy = vi.fn();

    deps = {
      openOrderListTab: vi.fn(),
      handleScrapeFailure: handleScrapeFailureSpy,
      closeScrapeTab: closeScrapeTabSpy,
      clearScrapeTimeout: vi.fn(),
      processOrdersForSite: processOrdersForSiteSpy,
      sendAuthFailedNotification: vi.fn(),
      navigateScrapeTab: navigateScrapeTabSpy,
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
      expect(navigateScrapeTabSpy).toHaveBeenCalledTimes(1);
      expect(navigateScrapeTabSpy).toHaveBeenCalledWith(
        tabId,
        'https://www.aliexpress.com/p/order/detail.html?orderId=order1'
      );

      // Simulate details response for order1
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order1'), tabId, deps);
      await flushPromises();

      // Should navigate to order2 details
      expect(navigateScrapeTabSpy).toHaveBeenCalledTimes(2);
      expect(navigateScrapeTabSpy).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/order/detail.html?orderId=order2'
      );

      // Simulate details response for order2
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order2'), tabId, deps);
      await flushPromises();

      // Should navigate to order1 tracking
      expect(navigateScrapeTabSpy).toHaveBeenCalledTimes(3);
      expect(navigateScrapeTabSpy).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order1'
      );

      // Simulate tracking response for order1
      aliexpress.handleAliExpressTrackingMessage(makeTracking('order1'), tabId, deps);
      await flushPromises();

      // Should navigate to order2 tracking
      expect(navigateScrapeTabSpy).toHaveBeenCalledTimes(4);
      expect(navigateScrapeTabSpy).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order2'
      );

      // Simulate tracking response for order2
      aliexpress.handleAliExpressTrackingMessage(makeTracking('order2'), tabId, deps);
      await scrapePromise;

      // Tab should be closed exactly once at the end
      expect(closeScrapeTabSpy).toHaveBeenCalledTimes(1);
      expect(closeScrapeTabSpy).toHaveBeenCalledWith('aliexpress', tabId);

      // Orders should be processed
      expect(processOrdersForSiteSpy).toHaveBeenCalledTimes(1);
    });

    it('skips tracking for completed orders', async () => {
      const orders = [makeOrder('order1', true), makeOrder('order2', false)];
      const tabId = 42;

      const scrapePromise = aliexpress.handleAliExpressOrdersDiscovered(orders, tabId, deps);

      // Details for order1
      await flushPromises();
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order1'), tabId, deps);
      await flushPromises();

      // Details for order2
      aliexpress.handleAliExpressOrderDetailsMessage(makeDetails('order2'), tabId, deps);
      await flushPromises();

      // Only tracking for order2 (order1 is completed)
      expect(navigateScrapeTabSpy).toHaveBeenCalledTimes(3); // 2 details + 1 tracking
      expect(navigateScrapeTabSpy).toHaveBeenLastCalledWith(
        tabId,
        'https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=order2'
      );

      aliexpress.handleAliExpressTrackingMessage(makeTracking('order2'), tabId, deps);
      await scrapePromise;

      expect(closeScrapeTabSpy).toHaveBeenCalledTimes(1);
    });

    it('closes tab on failure when no tabId provided', async () => {
      await aliexpress.handleAliExpressOrdersDiscovered([], undefined, deps);

      expect(handleScrapeFailureSpy).toHaveBeenCalledWith('aliexpress');
      expect(navigateScrapeTabSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleAliExpressOrderDetailsMessage', () => {
    it('resolves pending request without closing tab', async () => {
      const tabId = 42;
      const orders = [
        {
          orderId: 'order1',
          highLevelStatus: 'Completed' as const,
          orderDate: '2025-01-01',
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
      expect(closeScrapeTabSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleAliExpressTrackingMessage', () => {
    it('resolves pending request without closing tab', async () => {
      const tabId = 42;
      const orders = [
        {
          orderId: 'order1',
          highLevelStatus: 'Awaiting delivery' as const,
          orderDate: '2025-01-01',
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
      expect(closeScrapeTabSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('closes tab on order details parse failure', async () => {
      const tabId = 42;
      // Use a completed order so there's no tracking phase after details
      const orders = [
        {
          orderId: 'order1',
          highLevelStatus: 'Completed' as const,
          orderDate: '2025-01-01',
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
      expect(closeScrapeTabSpy).toHaveBeenCalledWith('aliexpress', tabId);
    });

    it('closes tab on tracking parse failure', async () => {
      const tabId = 42;
      const orders = [
        {
          orderId: 'order1',
          highLevelStatus: 'Awaiting delivery' as const,
          orderDate: '2025-01-01',
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
      expect(closeScrapeTabSpy).toHaveBeenCalledWith('aliexpress', tabId);
    });
  });
});
