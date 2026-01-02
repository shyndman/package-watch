import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest(), vue()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
