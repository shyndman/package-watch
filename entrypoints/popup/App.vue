<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import type { OrderSite, OrderStatus } from '@/lib/types';
import { getScrapeStatus, getStoredOrders } from '@/lib/storage';

type SiteConfig = {
  site: OrderSite;
  label: string;
};

type SiteViewState = {
  site: OrderSite;
  label: string;
  lastCheckLabel: string;
  inFlightCount: number;
  isScrapeInProgress: boolean;
};

const MISSING_TIMESTAMP_LABEL = '--';
const IN_PROGRESS_LABEL = 'In progress';

const SITE_CONFIG: SiteConfig[] = [
  { site: 'amazon', label: 'Amazon' },
  { site: 'aliexpress', label: 'AliExpress' },
];

const sites = ref<SiteViewState[]>(
  SITE_CONFIG.map((config) => ({
    site: config.site,
    label: config.label,
    lastCheckLabel: MISSING_TIMESTAMP_LABEL,
    inFlightCount: 0,
    isScrapeInProgress: false,
  }))
);

const orders = ref<OrderStatus[]>([]);

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) {
    return MISSING_TIMESTAMP_LABEL;
  }
  return new Date(timestamp).toISOString().slice(0, 16);
}

function productDisplay(order: OrderStatus): string {
  if (order.productTitles.length === 1) {
    return order.productTitles[0];
  }
  return `${order.productTitles[0]} +${order.productTitles.length - 1} more`;
}

function compareOrders(a: OrderStatus, b: OrderStatus): number {
  // Non-delivered first
  if (a.isDelivered !== b.isDelivered) {
    return a.isDelivered ? 1 : -1;
  }

  // Within each group, sort by date descending (nulls last)
  if (a.isDelivered) {
    // Delivered: sort by deliveredAt
    if (a.deliveredAt === null && b.deliveredAt === null) return 0;
    if (a.deliveredAt === null) return 1;
    if (b.deliveredAt === null) return -1;
    return b.deliveredAt.localeCompare(a.deliveredAt);
  } else {
    // Non-delivered: sort by orderDate
    if (a.orderDate === null && b.orderDate === null) return 0;
    if (a.orderDate === null) return 1;
    if (b.orderDate === null) return -1;
    return b.orderDate.localeCompare(a.orderDate);
  }
}

function closePopup(): void {
  window.close();
}

async function buildSiteViewState(config: SiteConfig): Promise<SiteViewState> {
  const [storedOrders, scrapeStatus] = await Promise.all([
    getStoredOrders(config.site),
    getScrapeStatus(config.site),
  ]);

  const inFlightCount = Object.values(storedOrders.orders).filter(
    (order) => !order.isDelivered
  ).length;

  return {
    site: config.site,
    label: config.label,
    lastCheckLabel: formatTimestamp(scrapeStatus.lastAlarmFiredAt),
    inFlightCount,
    isScrapeInProgress: scrapeStatus.isScrapeInProgress,
  };
}

async function loadData(): Promise<void> {
  const siteStates = await Promise.all(SITE_CONFIG.map(buildSiteViewState));
  sites.value = siteStates;

  // Load orders from all sites
  const allOrders: OrderStatus[] = [];
  for (const config of SITE_CONFIG) {
    const storedOrders = await getStoredOrders(config.site);
    allOrders.push(...Object.values(storedOrders.orders));
  }
  orders.value = allOrders.sort(compareOrders);
}

onMounted(() => {
  void loadData();
});
</script>

<template>
  <div class="popup">
    <header class="header">
      <h1>Order Status</h1>
      <div class="site-stats">
        <span v-for="site in sites" :key="site.site" class="site-stat">
          <span class="site-stat-label">{{ site.label }}:</span>
          <span class="site-stat-count">{{ site.inFlightCount }}</span>
          <span class="site-stat-separator">·</span>
          <span class="site-stat-time">{{ site.lastCheckLabel }}</span>
          <span v-if="site.isScrapeInProgress" class="status-pill">
            {{ IN_PROGRESS_LABEL }}
          </span>
        </span>
      </div>
    </header>

    <section class="order-list">
      <a
        v-for="order in orders"
        :key="order.orderId"
        :href="order.orderUrl"
        target="_blank"
        class="order-card"
        :class="{ delivered: order.isDelivered }"
        @click="closePopup"
      >
        <div class="order-header">
          <span class="site-badge">{{ order.site }}</span>
          <span class="product-title">{{ productDisplay(order) }}</span>
        </div>
        <div class="order-status">
          {{ order.status }}{{ order.statusDetail ? ' · ' + order.statusDetail : '' }}
        </div>
      </a>

      <div v-if="orders.length === 0" class="empty-state">
        No orders being tracked
      </div>
    </section>
  </div>
</template>
