import { sendMessage } from './messaging';

type ContentScriptConfig = Parameters<typeof defineContentScript>[0];

type ScrapingScriptConfig = Omit<ContentScriptConfig, 'main'> & {
  /**
   * Called only when the background script confirms this tab is a controlled
   * scrape session. User-opened tabs will never invoke this function.
   */
  scrape: () => void | Promise<void>;
};

/**
 * Defines a content script that only activates when the background script
 * confirms the tab is a controlled scrape session.
 *
 * Use this instead of `defineContentScript` for all scraping content scripts.
 * Content scripts on user-opened tabs remain inert.
 */
export function defineScrapingScript(config: ScrapingScriptConfig) {
  const { scrape, ...rest } = config;

  return defineContentScript({
    ...rest,
    async main() {
      const isActive = await sendMessage('scrape:checkActivation', undefined);
      if (!isActive) {
        console.debug('[Scraping] User session, staying inert');
        return;
      }

      await scrape();
    },
  });
}
