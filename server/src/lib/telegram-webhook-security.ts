import crypto from 'node:crypto';

// Telegram Bot API secret_token is 1..256 characters from A-Z, a-z, 0-9,
// underscore and hyphen. Reject empty, invalid or missing configuration.
export const isTelegramWebhookSecretConfigured = (secret: unknown): secret is string =>
  typeof secret === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(secret);

/** Never let an absent secret authorize arbitrary internet requests. */
export const isTelegramWebhookSecretValid = (configured: unknown, received: unknown): boolean => {
  if (!isTelegramWebhookSecretConfigured(configured) || typeof received !== 'string') return false;
  if (received.length !== configured.length || received.length > 256) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'ascii'), Buffer.from(configured, 'ascii'));
};
