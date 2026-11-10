import { jest } from '@jest/globals';

const { sendTelegramMessage, isTelegramConfigured, TELEGRAM_REQUEST_TIMEOUT_MS } = await import('../server/config/telegramBotConfig.js');

describe('sendTelegramMessage', () => {
  const originalKey = process.env.TELEGRAM_BOT_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchSpy;

  //* The jest sandbox has no global fetch to spy on - the module reads the
  //* global at call time, so a mock assigned here is what it ends up calling
  beforeEach(() => {
    fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.TELEGRAM_BOT_API_KEY = originalKey;
    if (originalKey === undefined) delete process.env.TELEGRAM_BOT_API_KEY;
  });

  it('is a no-op without a bot key', async () => {
    delete process.env.TELEGRAM_BOT_API_KEY;

    expect(isTelegramConfigured()).toBe(false);
    await expect(sendTelegramMessage('chat-1', 'hello')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op without a chat id', async () => {
    process.env.TELEGRAM_BOT_API_KEY = 'bot-key';

    await expect(sendTelegramMessage(undefined, 'hello')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts an HTML message with fetch when configured', async () => {
    process.env.TELEGRAM_BOT_API_KEY = 'bot-key';

    await expect(sendTelegramMessage('chat-1', '<b>hi</b>')).resolves.toBe(true);

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botbot-key/sendMessage');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ chat_id: 'chat-1', text: '<b>hi</b>', parse_mode: 'HTML' });
  });

  it('bounds every request with an abort timeout', async () => {
    process.env.TELEGRAM_BOT_API_KEY = 'bot-key';

    await sendTelegramMessage('chat-1', 'hello');

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(TELEGRAM_REQUEST_TIMEOUT_MS).toBe(5000);
  });

  it('never throws on network failures', async () => {
    process.env.TELEGRAM_BOT_API_KEY = 'bot-key';
    fetchSpy.mockRejectedValue(new Error('network down'));

    await expect(sendTelegramMessage('chat-1', 'hello')).resolves.toBe(false);
  });
});
