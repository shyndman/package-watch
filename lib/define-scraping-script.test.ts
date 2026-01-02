import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineScrapingScript } from './define-scraping-script';
import * as messaging from './messaging';

describe('defineScrapingScript', () => {
  let mockSendMessage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSendMessage = vi.spyOn(messaging, 'sendMessage');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call scrape() when activation check returns false', async () => {
    const scrapeFn = vi.fn();
    mockSendMessage.mockResolvedValue(false);

    const result = defineScrapingScript({
      matches: ['*://example.com/*'],
      scrape: scrapeFn,
    });

    // Call the generated main function (cast to any to satisfy WXT's auto-injected context)
    await (result.main as () => Promise<void>)();

    expect(mockSendMessage).toHaveBeenCalledWith('scrape:checkActivation', undefined);
    expect(scrapeFn).not.toHaveBeenCalled();
  });

  it('calls scrape() when activation check returns true', async () => {
    const scrapeFn = vi.fn();
    mockSendMessage.mockResolvedValue(true);

    const result = defineScrapingScript({
      matches: ['*://example.com/*'],
      scrape: scrapeFn,
    });

    await (result.main as () => Promise<void>)();

    expect(mockSendMessage).toHaveBeenCalledWith('scrape:checkActivation', undefined);
    expect(scrapeFn).toHaveBeenCalledTimes(1);
  });

  it('logs debug message when staying inert', async () => {
    const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    mockSendMessage.mockResolvedValue(false);

    const result = defineScrapingScript({
      matches: ['*://example.com/*'],
      scrape: vi.fn(),
    });

    await (result.main as () => Promise<void>)();

    expect(consoleSpy).toHaveBeenCalledWith('[Scraping] User session, staying inert');
  });

  it('passes through other config options', () => {
    mockSendMessage.mockResolvedValue(false);

    const result = defineScrapingScript({
      matches: ['*://example.com/*', '*://test.com/*'],
      runAt: 'document_idle',
      scrape: vi.fn(),
    });

    expect(result.matches).toEqual(['*://example.com/*', '*://test.com/*']);
    expect(result.runAt).toBe('document_idle');
    expect(result.main).toBeTypeOf('function');
  });

  it('awaits async scrape functions', async () => {
    const order: string[] = [];
    const scrapeFn = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('scrape');
    });
    mockSendMessage.mockResolvedValue(true);

    const result = defineScrapingScript({
      matches: ['*://example.com/*'],
      scrape: scrapeFn,
    });

    await (result.main as () => Promise<void>)();
    order.push('after');

    expect(order).toEqual(['scrape', 'after']);
  });
});
