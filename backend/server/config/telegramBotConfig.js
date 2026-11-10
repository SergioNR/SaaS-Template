//* Telegram is an optional alert channel - without a bot key every send is a
//* no-op so local development and test environments never hit the network
export const isTelegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_API_KEY);

//* Alerts are fire-and-forget: a hung Telegram API must never pile up
//* pending requests (and sockets) behind every logError
export const TELEGRAM_REQUEST_TIMEOUT_MS = 5000;

export const sendTelegramMessage = async (chatId, message) => {
  if (!isTelegramConfigured() || !chatId) {
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_API_KEY}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS),
    });

    return response.ok;
  } catch {
    return false;
  }
};

//* DOCS --> https://core.telegram.org/bots/api#sendmessage
