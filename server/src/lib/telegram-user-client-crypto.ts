import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Versioned, authenticated encryption for a *user-client* MTProto session.
// Do not use this for Bot API updates or derive this key from JWT_SECRET.
const FORMAT = 'tuc1';
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_BYTES = 128 * 1024;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function readKey(keyHex: string | undefined): Buffer {
  if (!keyHex || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error('TELEGRAM_USER_SESSION_KEY must be a separate 32-byte hex secret');
  }
  return Buffer.from(keyHex, 'hex');
}

function associatedData(userId: string): Buffer {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 128) {
    throw new Error('Invalid Telegram session owner');
  }
  return Buffer.from(`planirovych:telegram-user-client:${FORMAT}:${userId}`, 'utf8');
}

export function encryptTelegramUserSession(
  session: string,
  userId: string,
  keyHex: string | undefined = process.env.TELEGRAM_USER_SESSION_KEY
): string {
  if (typeof session !== 'string' || !session || Buffer.byteLength(session, 'utf8') > MAX_PLAINTEXT_BYTES) {
    throw new Error('Invalid Telegram session payload');
  }
  const key = readKey(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(associatedData(userId));
  const ciphertext = Buffer.concat([cipher.update(session, 'utf8'), cipher.final()]);
  return [FORMAT, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptTelegramUserSession(
  envelope: string,
  userId: string,
  keyHex: string | undefined = process.env.TELEGRAM_USER_SESSION_KEY
): string {
  const key = readKey(keyHex); // Fail closed if key is missing or misconfigured.
  const aad = associatedData(userId);
  if (typeof envelope !== 'string' || envelope.length > MAX_ENVELOPE_BYTES) {
    throw new Error('Invalid Telegram session envelope');
  }
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== FORMAT || !parts.slice(1).every((s) => /^[A-Za-z0-9_-]+$/.test(s))) {
    throw new Error('Invalid Telegram session envelope');
  }
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !ciphertext.length || ciphertext.length > MAX_PLAINTEXT_BYTES) {
    throw new Error('Invalid Telegram session envelope');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Never include plaintext, keys or library error details in error messages.
    throw new Error('Telegram session authentication failed');
  }
}
