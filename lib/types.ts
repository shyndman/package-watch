export type OrderSite = 'amazon' | 'aliexpress';

export type ParseFailurePhase =
  | 'amazon-orders'
  | 'aliexpress-orders'
  | 'aliexpress-tracking'
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
}

export interface AliExpressDiscoveredOrder {
  orderId: string;
  highLevelStatus: 'Awaiting delivery' | 'Completed';
  orderDate: string | null;
  storeName: string;
  productTitles: string[];
  productUrls: string[];
  trackingUrl: string | null;
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

/**
 * Message types for communication between content script and background.
 */
export type MessageType =
  | { type: 'ORDERS_SCRAPED'; site: OrderSite; orders: OrderStatus[] }
  | { type: 'ALIEXPRESS_ORDERS_DISCOVERED'; orders: AliExpressDiscoveredOrder[] }
  | { type: 'ALIEXPRESS_TRACKING_SCRAPED'; tracking: AliExpressTrackingResult }
  | { type: 'ALIEXPRESS_AUTH_FAILED' }
  | {
      type: 'PARSE_FAILURE';
      site: OrderSite;
      phase: ParseFailurePhase;
      reason?: string;
      url?: string;
      tabId?: number;
    }
  | { type: 'SCRAPE_ERROR'; error: string }
  | { type: 'TRIGGER_SCRAPE' };
