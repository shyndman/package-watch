import { describe, expect, it, vi } from 'vitest';
import type { OrderSite, StoredOrderState } from '../types';
import { formatInFlightBadgeText, updateInFlightBadge } from './badge';

function makeStoredOrderState(inFlightCount: number): StoredOrderState {
  const orders = Object.fromEntries(
    Array.from({ length: inFlightCount }, (_, index) => [
      `order-${index}`,
      {
        site: 'amazon' as const,
        orderId: `order-${index}`,
        status: 'Shipped',
        statusDetail: '',
        productTitles: ['Test'],
        productUrls: ['https://example.com'],
        orderUrl: 'https://example.com',
        orderDate: '2025-01-01',
        isDeliveryExpectedToday: false,
        isDelivered: false,
        deliveredAt: null,
      },
    ])
  );

  return { orders, lastChecked: 0 };
}

describe('formatInFlightBadgeText', () => {
  it('clears badge when count is 0', () => {
    expect(formatInFlightBadgeText(0)).toBe('');
  });

  it('shows count when between 1 and 99', () => {
    expect(formatInFlightBadgeText(5)).toBe('5');
    expect(formatInFlightBadgeText(99)).toBe('99');
  });

  it('caps badge at 99+', () => {
    expect(formatInFlightBadgeText(120)).toBe('99+');
  });
});

describe('updateInFlightBadge', () => {
  it('sets combined total across supported sites', async () => {
    const fetchStoredOrders = vi.fn(async (site: OrderSite) => {
      if (site === 'amazon') return makeStoredOrderState(2);
      if (site === 'aliexpress') return makeStoredOrderState(3);
      return { orders: {}, lastChecked: 0 };
    });

    const actionApi = {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    };

    await updateInFlightBadge({ fetchStoredOrders, actionApi });

    expect(actionApi.setBadgeText).toHaveBeenCalledWith({ text: '5' });
  });

  it('clears badge when combined total is 0', async () => {
    const fetchStoredOrders = vi.fn(async (_site: OrderSite): Promise<StoredOrderState> => ({
      orders: {},
      lastChecked: 0,
    }));

    const actionApi = {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    };

    await updateInFlightBadge({ fetchStoredOrders, actionApi });
    expect(actionApi.setBadgeText).toHaveBeenCalledWith({ text: '' });
  });

  it('caps badge at 99+ when combined total is >= 100', async () => {
    const fetchStoredOrders = vi.fn(async (site: OrderSite) => {
      if (site === 'amazon') return makeStoredOrderState(60);
      if (site === 'aliexpress') return makeStoredOrderState(60);
      return { orders: {}, lastChecked: 0 };
    });

    const actionApi = {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    };

    await updateInFlightBadge({ fetchStoredOrders, actionApi });
    expect(actionApi.setBadgeText).toHaveBeenCalledWith({ text: '99+' });
  });
});
