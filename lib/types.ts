/**
 * Represents the status of a single Amazon order/shipment.
 */
export interface OrderStatus {
  /** Amazon order ID (e.g., "702-5274541-7015439") */
  orderId: string;

  /** Primary status text (e.g., "Delivered today", "Out for delivery") */
  status: string;

  /** Secondary status detail (e.g., "Package was left near the front door") */
  statusDetail: string;

  /** Product title(s) in this shipment */
  productTitles: string[];

  /** Product page URLs (parallel to productTitles) */
  productUrls: string[];

  /** Order details page URL */
  orderUrl: string;

  /** Order placement date as ISO string (e.g., "2025-12-10"), null if unparseable */
  orderDate: string | null;

  /** Whether this appears to be a delivery expected today */
  isDeliveryExpectedToday: boolean;

  /** Whether this order has been delivered */
  isDelivered: boolean;
}

/**
 * Stored state for tracking order changes.
 */
export interface StoredOrderState {
  orders: Record<string, OrderStatus>;
  lastChecked: number;
}

/**
 * Message types for communication between content script and background.
 */
export type MessageType =
  | { type: 'ORDERS_SCRAPED'; orders: OrderStatus[] }
  | { type: 'SCRAPE_ERROR'; error: string }
  | { type: 'TRIGGER_SCRAPE' };
