import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Browser Automations',
    description: 'Automated browser tasks including Amazon order notifications',
    permissions: ['alarms', 'notifications', 'storage', 'tabs'],
    host_permissions: ['*://www.amazon.ca/*'],
    browser_specific_settings: {
      gecko: {
        id: 'browser-automations@shyndman.dev',
      },
    },
  },
});
