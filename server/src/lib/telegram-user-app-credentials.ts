import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export type TelegramAppCredentials = { apiId: number; apiHash: string };

export function validateTelegramAppCredentials(apiId: unknown, apiHash: unknown): TelegramAppCredentials {
  const rawId = typeof apiId === 'number' ? String(apiId) : apiId;
  if (typeof rawId !== 'string' || !/^[1-9][0-9]{0,9}$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) ||
      typeof apiHash !== 'string' || !/^[a-f0-9]{32}$/i.test(apiHash)) {
    throw new Error('Введите корректные API ID и API Hash из my.telegram.org');
  }
  return { apiId: Number(rawId), apiHash: apiHash.toLowerCase() };
}

function key(userId: string) {
  const master = process.env.TELEGRAM_USER_SESSION_KEY;
  if (!master || !/^[0-9a-f]{64}$/i.test(master) || !userId || userId.length > 128) throw new Error('Telegram encryption is unavailable');
  return Buffer.from(hkdfSync('sha256', Buffer.from(master, 'hex'), Buffer.from('planirovych:telegram-app-v1'), Buffer.from(userId, 'utf8'), 32));
}

export function encryptTelegramAppCredentials(userId: string, value: TelegramAppCredentials): string {
  const normalized = validateTelegramAppCredentials(value.apiId, value.apiHash);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(userId), iv);
  cipher.setAAD(Buffer.from('telegram-app-credentials:v1:' + userId));
  const payload = Buffer.concat([cipher.update(JSON.stringify(normalized), 'utf8'), cipher.final()]);
  return ['tac1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), payload.toString('base64url')].join('.');
}

export function decryptTelegramAppCredentials(userId: string, envelope: string): TelegramAppCredentials {
  const parts = typeof envelope === 'string' ? envelope.split('.') : [];
  if (parts.length !== 4 || parts[0] !== 'tac1' || !parts.slice(1).every(x => /^[A-Za-z0-9_-]{1,512}$/.test(x))) throw new Error('Invalid Telegram app credentials');
  const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url'), data = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !data.length || data.length > 256) throw new Error('Invalid Telegram app credentials');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(userId), iv);
    decipher.setAAD(Buffer.from('telegram-app-credentials:v1:' + userId));
    decipher.setAuthTag(tag);
    return validateTelegramAppCredentials(...((v: TelegramAppCredentials) => [v.apiId, v.apiHash] as const)(JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')) as TelegramAppCredentials));
  } catch { throw new Error('Telegram application credentials authentication failed'); }
}
