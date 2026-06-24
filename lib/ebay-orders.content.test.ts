// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import fixtureHtml from './__fixtures__/ebay-purchase.html?raw';
import {
  deliveryEstimatesReady,
  isDeliveryExpectedToday,
  parseEbayOrders,
} from '../entrypoints/ebay-orders.content';

const MONTH_ABBRS = [
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
] as const;

const estimate = (...dates: Temporal.PlainDate[]) =>
  `Estimated delivery ${dates
    .map((date) => `${MONTH_ABBRS[date.month - 1]} ${date.day}`)
    .join(' - ')} Returns accepted through Dec 31.`;

describe('parseEbayOrders', () => {
  document.body.innerHTML = fixtureHtml;
  const orders = parseEbayOrders(document.body);
  const byId = new Map(orders.map((order) => [order.orderId, order]));

  it('parses all six order cards with the expected order IDs', () => {
    expect(orders).toHaveLength(6);
    expect(orders.map((order) => order.orderId)).toEqual([
      '13-14732-11976',
      '01-14752-35116',
      '18-14571-84937',
      '19-12196-53422',
      '12-12145-59116',
      '12-12145-59117',
    ]);
  });

  it('maps the in-transit NVLink order', () => {
    const order = byId.get('13-14732-11976')!;
    expect(order.orderDate).toBe('2026-06-06');
    expect(order.status).toBe('Tracking available');
    expect(order.isDelivered).toBe(false);
    // ETA is Jul 3 (no year), today is not Jul 3.
    expect(order.isDeliveryExpectedToday).toBe(false);
    expect(order.productTitles[0]).toContain('Nvidia NVLink Bridge');
    expect(order.productUrls[0]).toContain('/itm/336219247033');
    expect(order.orderUrl).toContain('order.ebay');
  });

  it('maps a delivered order', () => {
    const order = byId.get('01-14752-35116')!;
    expect(order.status).toBe('Delivered');
    expect(order.isDelivered).toBe(true);
    expect(order.orderDate).toBe('2026-06-06');
  });

  it('treats a refunded-but-delivered order as delivered', () => {
    const order = byId.get('18-14571-84937')!;
    expect(order.status).toBe('Refunded');
    expect(order.isDelivered).toBe(true);
  });
});

describe('isDeliveryExpectedToday', () => {
  it('returns true when the single estimate date is today', () => {
    const today = Temporal.Now.plainDateISO();
    expect(isDeliveryExpectedToday(estimate(today))).toBe(true);
  });

  it('returns false for a far-future single date', () => {
    const future = Temporal.Now.plainDateISO().add({ days: 120 });
    expect(isDeliveryExpectedToday(estimate(future))).toBe(false);
  });

  it('returns true for a range that straddles today', () => {
    const today = Temporal.Now.plainDateISO();
    expect(
      isDeliveryExpectedToday(estimate(today.subtract({ days: 1 }), today.add({ days: 1 })))
    ).toBe(true);
  });

  it('throws when no delivery date can be parsed', () => {
    expect(() => isDeliveryExpectedToday('Estimated delivery sometime soon')).toThrow();
  });
});

describe('deliveryEstimatesReady', () => {
  const card = (deliveryText: string) =>
    `<div class="m-order-card"><div class="container-item-col__info-item-info-deliveryEstimateMessage">${deliveryText}</div></div>`;

  it('is false while only the returns clause has loaded', () => {
    document.body.innerHTML = card('Returns accepted through Aug 5.');
    expect(deliveryEstimatesReady(document.body)).toBe(false);
  });

  it('is true once the estimate line is injected', () => {
    document.body.innerHTML = card('Estimated delivery Friday Jul 3 Returns accepted through Aug 5.');
    expect(deliveryEstimatesReady(document.body)).toBe(true);
  });

  it('treats delivered cards as ready', () => {
    document.body.innerHTML = card('Delivered on Tue, Jun 16 Returns accepted through Jul 1.');
    expect(deliveryEstimatesReady(document.body)).toBe(true);
  });

  it('is false when no cards are present', () => {
    document.body.innerHTML = '';
    expect(deliveryEstimatesReady(document.body)).toBe(false);
  });
});
