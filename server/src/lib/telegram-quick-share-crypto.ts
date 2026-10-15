import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'tqs1';
const MAX_BYTES = 22_000;

function key() {
  const secret = process.env.TELEGRAM_USER_SESSION_KEY;
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) throw new Error('Telegram quick-share encryption unavailable');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'hex'),
    Buffer.from('planirovych:telegram-quick-share:v1'), Buffer.from('encrypted-background-payload'), 32));
}
function aad(userId: string, jobId: string) {
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(userId) || !/^[0-9a-f-]{36}$/.test(jobId)) {
    throw new Error('Invalid Telegram quick-share owner or job');
  }
  return Buffer.from(`planirovych:${VERSION}:${userId}:${jobId}`);
}
export function encryptTelegramQuickShare(text: string, userId: string, jobId: string): string {
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('Telegram quick-share payload too large');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  cipher.setAAD(aad(userId, jobId));
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [VERSION, nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptTelegramQuickShare(value: string, userId: string, jobId: string): string {
  if (typeof value !== 'string' || value.length > MAX_BYTES * 2) throw new Error('Invalid Telegram quick-share payload');
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION || !parts.slice(1).every(x => /^[A-Za-z0-9_-]+$/.test(x))) {
    throw new Error('Invalid Telegram quick-share envelope');
  }
  const nonce = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (nonce.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > MAX_BYTES) {
    throw new Error('Invalid Telegram quick-share envelope');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), nonce);
    decipher.setAAD(aad(userId, jobId));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch { throw new Error('Telegram quick-share payload authentication failed'); }
}
