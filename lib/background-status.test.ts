import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startScrapeSpy = vi.fn();
const scheduleNextCheckSpy = vi.fn();

const makeStorageStub = () => {
  const store = new Map<string, unknown>();
  return {
    storage: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      _dump: () => store,
    },
  };
};

const flushPromises = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** Creates a message in the format @webext-core/messaging expects */
let messageId = 0;
const createMessage = <T>(type: string, data: T) => ({
  type,
  data,
  timestamp: Date.now(),
  id: ++messageId,
});

const initBackgroundEntrypoint = (entry: unknown) => {
  if (typeof entry === 'function') {
    entry();
    return;
  }

  if (entry && typeof entry === 'object') {
    const maybeMain = (entry as { main?: () => void }).main;
    if (typeof maybeMain === 'function') {
      maybeMain();
      return;
    }
  }

  throw new Error('Unexpected background entrypoint shape');
};

let fakeBrowser: Awaited<typeof import('wxt/testing')>['fakeBrowser'];

beforeEach(async () => {
  ({ fakeBrowser } = await import('wxt/testing'));
  fakeBrowser.reset();
  fakeBrowser.tabs.create = vi.fn(async () => ({ id: 1 }));
  fakeBrowser.tabs.remove = vi.fn(async () => undefined);
  messageId = 0;
});

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('background scrape status', () => {
  it('logs and records scrape status on alarm fire', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    vi.doMock('../lib/background/amazon', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/amazon')>(
        '../lib/background/amazon'
      );
      return {
        ...actual,
        performAmazonScrape: startScrapeSpy,
      };
    });
    vi.doMock('../lib/background/aliexpress', () => ({
      performAliExpressScrape: vi.fn(),
      handleAliExpressOrdersDiscovered: vi.fn(),
      handleAliExpressOrderDetailsMessage: vi.fn(),
      handleAliExpressTrackingMessage: vi.fn(),
      handleAliExpressAuthFailed: vi.fn(),
      handleAliExpressOrderDetailsParseFailure: vi.fn(),
    }));
    vi.doMock('../lib/background/scheduler', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/scheduler')>(
        '../lib/background/scheduler'
      );
      return {
        ...actual,
        scheduleNextCheck: scheduleNextCheckSpy,
      };
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const { default: entrypoint } = await import('../entrypoints/background');
    initBackgroundEntrypoint(entrypoint);

    await fakeBrowser.alarms.onAlarm.trigger({ name: 'scrape-amazon' });
    await flushPromises();

    const status = await storageStub.storage.getItem('local:amazonScrapeStatus');

    expect(consoleSpy).toHaveBeenCalledWith('Alarm fired: Amazon order check started');
    expect(status).toEqual({
      lastAlarmFiredAt: expect.any(Number),
      isScrapeInProgress: true,
    });
    expect(startScrapeSpy).toHaveBeenCalled();
  });

  it('clears in-progress status on successful scrape', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    vi.doMock('../lib/background/amazon', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/amazon')>(
        '../lib/background/amazon'
      );
      return {
        ...actual,
        performAmazonScrape: vi.fn(),
      };
    });
    vi.doMock('../lib/background/aliexpress', () => ({
      performAliExpressScrape: vi.fn(),
      handleAliExpressOrdersDiscovered: vi.fn(),
      handleAliExpressOrderDetailsMessage: vi.fn(),
      handleAliExpressTrackingMessage: vi.fn(),
      handleAliExpressAuthFailed: vi.fn(),
      handleAliExpressOrderDetailsParseFailure: vi.fn(),
    }));
    vi.doMock('../lib/background/scheduler', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/scheduler')>(
        '../lib/background/scheduler'
      );
      return {
        ...actual,
        scheduleNextCheck: scheduleNextCheckSpy,
      };
    });

    const { default: entrypoint } = await import('../entrypoints/background');
    initBackgroundEntrypoint(entrypoint);

    await fakeBrowser.alarms.onAlarm.trigger({ name: 'scrape-amazon' });

    await fakeBrowser.runtime.onMessage.trigger(
      createMessage('orders:scraped', {
        site: 'amazon',
        orders: [
          {
            site: 'amazon',
            orderId: '1',
            status: 'Delivered',
            statusDetail: '',
            productTitles: [],
            productUrls: [],
            orderUrl: 'https://example.com',
            orderDate: null,
            isDeliveryExpectedToday: false,
            isDelivered: true,
          },
        ],
      }),
      { tab: { id: 1 } }
    );
    await flushPromises();

    const status = await storageStub.storage.getItem('local:amazonScrapeStatus');
    expect(status).toEqual({
      lastAlarmFiredAt: expect.any(Number),
      isScrapeInProgress: false,
    });
  });

  it('clears in-progress status on scrape error', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    vi.doMock('../lib/background/amazon', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/amazon')>(
        '../lib/background/amazon'
      );
      return {
        ...actual,
        performAmazonScrape: vi.fn(),
      };
    });
    vi.doMock('../lib/background/aliexpress', () => ({
      performAliExpressScrape: vi.fn(),
      handleAliExpressOrdersDiscovered: vi.fn(),
      handleAliExpressOrderDetailsMessage: vi.fn(),
      handleAliExpressTrackingMessage: vi.fn(),
      handleAliExpressAuthFailed: vi.fn(),
      handleAliExpressOrderDetailsParseFailure: vi.fn(),
    }));
    vi.doMock('../lib/background/scheduler', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/scheduler')>(
        '../lib/background/scheduler'
      );
      return {
        ...actual,
        scheduleNextCheck: scheduleNextCheckSpy,
      };
    });

    const { default: entrypoint } = await import('../entrypoints/background');
    initBackgroundEntrypoint(entrypoint);

    await fakeBrowser.alarms.onAlarm.trigger({ name: 'scrape-amazon' });

    await fakeBrowser.runtime.onMessage.trigger(
      createMessage('scrape:error', { error: 'boom' }),
      { tab: { id: 1 } }
    );
    await flushPromises();

    const status = await storageStub.storage.getItem('local:amazonScrapeStatus');
    expect(status).toEqual({
      lastAlarmFiredAt: expect.any(Number),
      isScrapeInProgress: false,
    });
  });

  it('routes AliExpress order details message to handler', async () => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    const handleAliExpressOrderDetailsMessage = vi.fn();

    vi.doMock('../lib/background/amazon', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/amazon')>(
        '../lib/background/amazon'
      );
      return {
        ...actual,
        performAmazonScrape: vi.fn(),
      };
    });
    vi.doMock('../lib/background/aliexpress', () => ({
      performAliExpressScrape: vi.fn(),
      handleAliExpressOrdersDiscovered: vi.fn(),
      handleAliExpressOrderDetailsMessage,
      handleAliExpressTrackingMessage: vi.fn(),
      handleAliExpressAuthFailed: vi.fn(),
      handleAliExpressOrderDetailsParseFailure: vi.fn(),
      handleAliExpressTrackingParseFailure: vi.fn(),
    }));

    const { default: entrypoint } = await import('../entrypoints/background');
    initBackgroundEntrypoint(entrypoint);

    const details = {
      orderId: '8207771346365504',
      productTitle: 'PD65W Step Down Module',
      productUrl: 'https://www.aliexpress.com/item/1005006935868690.html',
    };

    await fakeBrowser.runtime.onMessage.trigger(
      createMessage('aliexpress:orderDetails', { details }),
      { tab: { id: 42 } }
    );
    await flushPromises();

    expect(handleAliExpressOrderDetailsMessage).toHaveBeenCalledTimes(1);
    expect(handleAliExpressOrderDetailsMessage).toHaveBeenCalledWith(
      details,
      42,
      expect.any(Object)
    );
  });
});

describe('background parse failure notifications', () => {
  const setupBackground = async (sendParseFailureNotification: ReturnType<typeof vi.fn>) => {
    const storageStub = makeStorageStub();
    vi.doMock('@wxt-dev/storage', () => storageStub);

    vi.doMock('../lib/background/amazon', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/amazon')>(
        '../lib/background/amazon'
      );
      return {
        ...actual,
        performAmazonScrape: vi.fn(),
      };
    });
    vi.doMock('../lib/background/aliexpress', () => ({
      performAliExpressScrape: vi.fn(),
      handleAliExpressOrdersDiscovered: vi.fn(),
      handleAliExpressOrderDetailsMessage: vi.fn(),
      handleAliExpressTrackingMessage: vi.fn(),
      handleAliExpressAuthFailed: vi.fn(),
      handleAliExpressTrackingParseFailure: vi.fn(),
      handleAliExpressOrderDetailsParseFailure: vi.fn(),
    }));
    vi.doMock('../lib/background/notifications', () => ({
      sendParseFailureNotification,
      sendNotification: vi.fn(),
      sendAuthFailedNotification: vi.fn(),
    }));
    vi.doMock('../lib/background/scheduler', async () => {
      const actual = await vi.importActual<typeof import('../lib/background/scheduler')>(
        '../lib/background/scheduler'
      );
      return {
        ...actual,
        scheduleNextCheck: scheduleNextCheckSpy,
      };
    });

    const { default: entrypoint } = await import('../entrypoints/background');
    initBackgroundEntrypoint(entrypoint);

    return storageStub;
  };

  it('sends parse failure notification with reason', async () => {
    const sendParseFailureNotification = vi.fn();
    await setupBackground(sendParseFailureNotification);

    await fakeBrowser.alarms.onAlarm.trigger({ name: 'scrape-amazon' });

    await fakeBrowser.runtime.onMessage.trigger(
      createMessage('scrape:parseFailure', {
        site: 'amazon',
        phase: 'amazon-orders',
        reason: 'Missing order ID',
        url: 'https://www.amazon.ca/example',
      }),
      { tab: { id: 1 } }
    );
    await flushPromises();

    expect(sendParseFailureNotification).toHaveBeenCalledTimes(1);
    expect(sendParseFailureNotification).toHaveBeenCalledWith(
      'amazon',
      'Missing order ID',
      'https://www.amazon.ca/example'
    );
  });

  it('aggregates parse failure notifications and sends when reason is missing', async () => {
    const sendParseFailureNotification = vi.fn();
    await setupBackground(sendParseFailureNotification);

    await fakeBrowser.alarms.onAlarm.trigger({ name: 'scrape-amazon' });

    await fakeBrowser.runtime.onMessage.trigger(
      createMessage('scrape:parseFailure', {
        site: 'amazon',
        phase: 'amazon-orders',
      }),
      { tab: { id: 1 } }
    );
    await fakeBrowser.runtime.onMessage.trigger(
      createMessage('scrape:parseFailure', {
        site: 'amazon',
        phase: 'amazon-orders',
        reason: 'Another failure',
        url: 'https://www.amazon.ca/example-2',
      }),
      { tab: { id: 1 } }
    );
    await flushPromises();

    expect(sendParseFailureNotification).toHaveBeenCalledTimes(1);
    expect(sendParseFailureNotification).toHaveBeenCalledWith('amazon', undefined, undefined);
  });
});
