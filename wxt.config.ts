import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'Package Watch',
    description: 'Automated browser tasks including Amazon order notifications',
    permissions: ['alarms', 'notifications', 'storage', 'tabs'],
    host_permissions: ['*://www.amazon.ca/*', '*://www.aliexpress.com/*'],
    browser_specific_settings: {
      gecko: {
        id: 'package-watch@shyndman.dev',
      },
    },
  },
});
