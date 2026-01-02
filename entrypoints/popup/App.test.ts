// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const makeScrapeStatus = (overrides?: Partial<{ lastAlarmFiredAt: number | null; isScrapeInProgress: boolean }>) => ({
  lastAlarmFiredAt: null,
  isScrapeInProgress: false,
  ...overrides,
});

const makeStoredOrders = (
  orders: Array<{ isDelivered: boolean; orderDate?: string | null; deliveredAt?: string | null }>
) => ({
  orders: Object.fromEntries(
    orders.map((order, index) => [
      String(index),
      {
        site: 'amazon' as const,
        orderId: `order-${index}`,
        status: 'Processing',
        statusDetail: '',
        productTitles: ['Test Product'],
        productUrls: ['https://example.com/product'],
        orderUrl: 'https://example.com/order',
        orderDate: order.orderDate ?? '2025-01-01',
        isDeliveryExpectedToday: false,
        isDelivered: order.isDelivered,
        deliveredAt: order.deliveredAt ?? null,
      },
    ])
  ),
  lastChecked: 0,
});

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const mountApp = async () => {
  const { default: App } = await import('./App.vue');
  const { createApp, nextTick } = await import('vue');

  const root = document.createElement('div');
  document.body.appendChild(root);

  const app = createApp(App);
  app.mount(root);

  await flushPromises();
  await nextTick();

  return { app, root };
};

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('popup status display', () => {
  it('shows -- when no last alarm fired timestamp is stored', async () => {
    vi.doMock('@/lib/storage', () => ({
      getScrapeStatus: vi.fn(async () => makeScrapeStatus()),
      getStoredOrders: vi.fn(async () => makeStoredOrders([])),
    }));

    const { app, root } = await mountApp();

    const timeLabels = Array.from(root.querySelectorAll('.site-stat-time'));
    expect(timeLabels.length).toBeGreaterThan(0);
    timeLabels.forEach((node) => expect(node.textContent).toBe('--'));

    app.unmount();
  });

  it('shows an ISO formatted timestamp when available', async () => {
    const timestamp = new Date('2025-12-27T10:05:07Z').getTime();

    vi.doMock('@/lib/storage', () => ({
      getScrapeStatus: vi.fn(async () => makeScrapeStatus({ lastAlarmFiredAt: timestamp })),
      getStoredOrders: vi.fn(async () => makeStoredOrders([])),
    }));

    const { app, root } = await mountApp();
    const formatted = new Date(timestamp).toISOString().slice(0, 16);

    const matches = Array.from(root.querySelectorAll('.site-stat-time')).filter(
      (node) => node.textContent === formatted
    );
    expect(matches.length).toBeGreaterThan(0);

    app.unmount();
  });

  it('shows in-flight order counts based on undelivered orders', async () => {
    vi.doMock('@/lib/storage', () => ({
      getScrapeStatus: vi.fn(async () => makeScrapeStatus()),
      getStoredOrders: vi.fn(async () =>
        makeStoredOrders([
          { isDelivered: false },
          { isDelivered: true, deliveredAt: '2025-01-02T10:00:00Z' },
          { isDelivered: false },
        ])
      ),
    }));

    const { app, root } = await mountApp();

    const counts = Array.from(root.querySelectorAll('.site-stat-count'));
    expect(counts.length).toBeGreaterThan(0);
    counts.forEach((node) => expect(node.textContent).toBe('2'));

    app.unmount();
  });

  it('shows the in-progress badge when a scrape is running', async () => {
    vi.doMock('@/lib/storage', () => ({
      getScrapeStatus: vi.fn(async () => makeScrapeStatus({ isScrapeInProgress: true })),
      getStoredOrders: vi.fn(async () => makeStoredOrders([])),
    }));

    const { app, root } = await mountApp();

    const badges = Array.from(root.querySelectorAll('.status-pill'));
    expect(badges.length).toBeGreaterThan(0);
    badges.forEach((node) => expect(node.textContent).toBe('In progress'));

    app.unmount();
  });
});
