import { defineExtensionMessaging } from '@webext-core/messaging';
import type {
  AliExpressDiscoveredOrder,
  AliExpressOrderDetailsResult,
  AliExpressTrackingResult,
  OrderSite,
  OrderStatus,
  ParseFailurePhase,
} from './types';

/**
 * Extension messaging protocol.
 *
 * All communication between content scripts and background uses this typed
 * protocol via @webext-core/messaging.
 */
interface ProtocolMap {
  /**
   * Content scripts query this on load to determine if they should proceed
   * with scraping. Background responds true only for tabs it opened.
   */
  'scrape:checkActivation': () => boolean;

  /** Amazon orders scraped from order history page */
  'orders:scraped': (data: { site: OrderSite; orders: OrderStatus[] }) => void;

  /** AliExpress order list discovered (triggers detail/tracking scraping) */
  'aliexpress:ordersDiscovered': (data: { orders: AliExpressDiscoveredOrder[] }) => void;

  /** AliExpress order details scraped */
  'aliexpress:orderDetails': (data: { details: AliExpressOrderDetailsResult }) => void;

  /** AliExpress tracking info scraped */
  'aliexpress:tracking': (data: { tracking: AliExpressTrackingResult }) => void;

  /** AliExpress authentication failed (user not logged in) */
  'aliexpress:authFailed': () => void;

  /** Parse failure during scraping */
  'scrape:parseFailure': (data: {
    site: OrderSite;
    phase: ParseFailurePhase;
    reason?: string;
    url?: string;
    tabId?: number;
  }) => void;

  /** Generic scrape error */
  'scrape:error': (data: { error: string }) => void;

  /** Trigger a manual scrape (from popup) */
  'scrape:trigger': () => void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
