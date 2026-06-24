export type OrderSite = 'amazon' | 'aliexpress' | 'ebay';

export type ParseFailurePhase =
  | 'amazon-orders'
  | 'aliexpress-orders'
  | 'aliexpress-order-details'
  | 'aliexpress-tracking'
  | 'ebay-orders'
  | 'background-parse';

/**
 * Represents the status of a single order/shipment.
 */
export interface OrderStatus {
  /** Site this order belongs to */
  site: OrderSite;

  /** Order ID (e.g., "702-5274541-7015439") */
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

  /** ISO timestamp when delivery was first detected, null if not yet delivered */
  deliveredAt: string | null;
}

export interface AliExpressDiscoveredOrder {
  orderId: string;
  highLevelStatus: 'Awaiting delivery' | 'Completed';
  orderDate: string | null;
  storeName: string;
  orderDetailsUrl: string | null;
  trackingUrl: string | null;
}

export interface AliExpressOrderDetailsResult {
  orderId: string;
  productTitle: string;
  productUrl: string;
}

export interface AliExpressTrackingResult {
  orderId: string;
  currentStatus: string;
  statusDetail: string;
  isDelivered: boolean;
  estimatedDelivery: string | null;
  timestamp: string;
}

/**
 * Stored state for tracking order changes.
 */
export interface StoredOrderState {
  orders: Record<string, OrderStatus>;
  lastChecked: number;
}

export interface StoredScrapeStatus {
  lastAlarmFiredAt: number | null;
  isScrapeInProgress: boolean;
}
