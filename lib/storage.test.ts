import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderStatus } from './types';

const makeStorageStub = () => {
  const store = new Map<string, unknown>();
  return {
    storage: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      _store: store,
    },
  };
};

const makeOrder = (overrides: Partial<OrderStatus> = {}): OrderStatus => ({
  site: 'amazon',
  orderId: 'order-1',
  status: 'Shipped',
  statusDetail: '',
  productTitles: ['Test Product'],
  productUrls: ['https://example.com/product'],
  orderUrl: 'https://example.com/order',
  orderDate: '2025-01-01',
  isDeliveryExpectedToday: false,
  isDelivered: false,
  deliveredAt: null,
  ...overrides,
});

describe('saveOrders', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('deliveredAt stamping', () => {
    it('stamps deliveredAt when order transitions to delivered', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // First save: order is not delivered
      await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: false })]);

      // Second save: order is now delivered
      await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: true })]);

      const stored = await getStoredOrders('amazon');
      expect(stored.orders['order-1'].deliveredAt).not.toBeNull();
      expect(stored.orders['order-1'].isDelivered).toBe(true);
    });

    it('preserves existing deliveredAt timestamp on subsequent saves', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // First save: order is delivered
      await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: true })]);

      const firstSave = await getStoredOrders('amazon');
      const originalDeliveredAt = firstSave.orders['order-1'].deliveredAt;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second save: order is still delivered
      await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: true })]);

      const secondSave = await getStoredOrders('amazon');
      expect(secondSave.orders['order-1'].deliveredAt).toBe(originalDeliveredAt);
    });

    it('does not stamp deliveredAt for non-delivered orders', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      await saveOrders('amazon', [makeOrder({ orderId: 'order-1', isDelivered: false })]);

      const stored = await getStoredOrders('amazon');
      expect(stored.orders['order-1'].deliveredAt).toBeNull();
    });
  });

  describe('expiration filtering', () => {
    it('removes orders delivered more than 7 days ago', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // Set up an order that was delivered 8 days ago
      const eightDaysAgo = Temporal.Now.instant().subtract({ hours: 8 * 24 }).toString();
      storageStub.storage._store.set('local:amazonOrderState', {
        orders: {
          'order-1': makeOrder({
            orderId: 'order-1',
            isDelivered: true,
            deliveredAt: eightDaysAgo,
          }),
        },
        lastChecked: Date.now(),
      });

      // Save a new order (triggers expiration filtering)
      await saveOrders('amazon', [makeOrder({ orderId: 'order-2', isDelivered: false })]);

      const stored = await getStoredOrders('amazon');
      expect(stored.orders['order-1']).toBeUndefined();
      expect(stored.orders['order-2']).toBeDefined();
    });

    it('keeps orders delivered less than 7 days ago', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // Set up an order that was delivered 6 days ago
      const sixDaysAgo = Temporal.Now.instant().subtract({ hours: 6 * 24 }).toString();
      storageStub.storage._store.set('local:amazonOrderState', {
        orders: {
          'order-1': makeOrder({
            orderId: 'order-1',
            isDelivered: true,
            deliveredAt: sixDaysAgo,
          }),
        },
        lastChecked: Date.now(),
      });

      // Save a new order (triggers expiration filtering)
      await saveOrders('amazon', [makeOrder({ orderId: 'order-2', isDelivered: false })]);

      const stored = await getStoredOrders('amazon');
      expect(stored.orders['order-1']).toBeDefined();
      expect(stored.orders['order-2']).toBeDefined();
    });

    it('removes legacy delivered orders without deliveredAt', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // Set up a legacy order with isDelivered but no deliveredAt
      storageStub.storage._store.set('local:amazonOrderState', {
        orders: {
          'order-1': makeOrder({
            orderId: 'order-1',
            isDelivered: true,
            deliveredAt: null,
          }),
        },
        lastChecked: Date.now(),
      });

      // Save a new order (triggers expiration filtering)
      await saveOrders('amazon', [makeOrder({ orderId: 'order-2', isDelivered: false })]);

      const stored = await getStoredOrders('amazon');
      expect(stored.orders['order-1']).toBeUndefined();
      expect(stored.orders['order-2']).toBeDefined();
    });

    it('does not remove non-delivered orders regardless of age', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // Set up an old non-delivered order
      storageStub.storage._store.set('local:amazonOrderState', {
        orders: {
          'order-1': makeOrder({
            orderId: 'order-1',
            isDelivered: false,
            deliveredAt: null,
          }),
        },
        lastChecked: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      });

      // Save a new order (triggers expiration filtering)
      await saveOrders('amazon', [makeOrder({ orderId: 'order-2', isDelivered: false })]);

      const stored = await getStoredOrders('amazon');
      expect(stored.orders['order-1']).toBeDefined();
      expect(stored.orders['order-2']).toBeDefined();
    });

    it('removes order exactly at 7 day boundary', async () => {
      const storageStub = makeStorageStub();
      vi.doMock('@wxt-dev/storage', () => storageStub);

      const { saveOrders, getStoredOrders } = await import('./storage');

      // Set up an order that was delivered exactly 7 days ago
      const sevenDaysAgo = Temporal.Now.instant().subtract({ hours: 7 * 24 }).toString();
      storageStub.storage._store.set('local:amazonOrderState', {
        orders: {
          'order-1': makeOrder({
            orderId: 'order-1',
            isDelivered: true,
            deliveredAt: sevenDaysAgo,
          }),
        },
        lastChecked: Date.now(),
      });

      // Save a new order (triggers expiration filtering)
      await saveOrders('amazon', [makeOrder({ orderId: 'order-2', isDelivered: false })]);

      const stored = await getStoredOrders('amazon');
      // At exactly 7 days, the order should be removed (>= comparison)
      expect(stored.orders['order-1']).toBeUndefined();
    });
  });
});

describe('detectChanges', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not report expired delivered orders reappearing as changed', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    const { detectChanges } = await import('./storage');

    // Storage has an existing non-delivered order (so this isn't first run)
    storageStub.storage._store.set('local:amazonOrderState', {
      orders: {
        'order-existing': makeOrder({ orderId: 'order-existing', isDelivered: false }),
      },
      lastChecked: Date.now(),
    });

    // Scrape returns a delivered order we haven't seen (simulating an expired order reappearing)
    const scrapedOrders = [
      makeOrder({ orderId: 'order-expired', isDelivered: true }),
      makeOrder({ orderId: 'order-existing', isDelivered: false }),
    ];

    const { changed, isFirstRun } = await detectChanges(scrapedOrders, 'amazon');

    expect(isFirstRun).toBe(false);
    expect(changed).toHaveLength(0);
  });

  it('reports new non-delivered orders as changed', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    const { detectChanges } = await import('./storage');

    // Storage has an existing order (so this isn't first run)
    storageStub.storage._store.set('local:amazonOrderState', {
      orders: {
        'order-existing': makeOrder({ orderId: 'order-existing', isDelivered: false }),
      },
      lastChecked: Date.now(),
    });

    // Scrape returns a new non-delivered order
    const scrapedOrders = [
      makeOrder({ orderId: 'order-new', isDelivered: false, status: 'Shipped' }),
      makeOrder({ orderId: 'order-existing', isDelivered: false }),
    ];

    const { changed, isFirstRun } = await detectChanges(scrapedOrders, 'amazon');

    expect(isFirstRun).toBe(false);
    expect(changed).toHaveLength(1);
    expect(changed[0].orderId).toBe('order-new');
  });

  it('does not report any orders as changed on first run', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    const { detectChanges } = await import('./storage');

    // Empty storage (first run)
    storageStub.storage._store.set('local:amazonOrderState', {
      orders: {},
      lastChecked: 0,
    });

    const scrapedOrders = [
      makeOrder({ orderId: 'order-1', isDelivered: false }),
      makeOrder({ orderId: 'order-2', isDelivered: true }),
    ];

    const { changed, isFirstRun } = await detectChanges(scrapedOrders, 'amazon');

    expect(isFirstRun).toBe(true);
    expect(changed).toHaveLength(0);
  });
});
