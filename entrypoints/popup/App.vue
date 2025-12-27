<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import type { OrderSite } from '@/lib/types';
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

const PENDING_LABEL = 'PENDING';
const IN_PROGRESS_LABEL = 'In progress';

const SITE_CONFIG: SiteConfig[] = [
  { site: 'amazon', label: 'Amazon' },
  { site: 'aliexpress', label: 'AliExpress' },
];

const DATE_TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, DATE_TIME_FORMAT_OPTIONS);

const sites = ref<SiteViewState[]>(
  SITE_CONFIG.map((config) => ({
    site: config.site,
    label: config.label,
    lastCheckLabel: PENDING_LABEL,
    inFlightCount: 0,
    isScrapeInProgress: false,
  }))
);

function formatTimestamp(timestamp: number | null): string {
  if (timestamp === null) {
    return PENDING_LABEL;
  }

  return dateTimeFormatter.format(new Date(timestamp));
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

async function loadSiteStatus(): Promise<void> {
  const next = await Promise.all(SITE_CONFIG.map(buildSiteViewState));
  sites.value = next;
}

onMounted(() => {
  void loadSiteStatus();
});
</script>

<template>
  <div class="popup">
    <header class="header">
      <div>
        <p class="eyebrow">Order monitoring</p>
        <h1>Check Status</h1>
      </div>
      <span class="subtle">Amazon + AliExpress</span>
    </header>

    <section class="site-grid">
      <article v-for="site in sites" :key="site.site" class="site-card">
        <div class="site-header">
          <div class="site-name">{{ site.label }}</div>
          <span v-if="site.isScrapeInProgress" class="status-pill">
            {{ IN_PROGRESS_LABEL }}
          </span>
        </div>

        <div class="meta-row">
          <span class="meta-label">Last check</span>
          <span
            class="meta-value"
            :class="{ pending: site.lastCheckLabel === PENDING_LABEL }"
          >
            {{ site.lastCheckLabel }}
          </span>
        </div>

        <div class="meta-row">
          <span class="meta-label">In-flight orders</span>
          <span class="meta-value count">{{ site.inFlightCount }}</span>
        </div>
      </article>
    </section>

    <footer class="footer">
      <span>Scrapes run automatically in the background.</span>
    </footer>
  </div>
</template>
