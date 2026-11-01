import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const VERSION = 'mail1';
export const mailKeyReady = (key: string | undefined = process.env.MAIL_ASSISTANT_ENCRYPTION_KEY) =>
  typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key);
function secret(key: string | undefined) {
  if (!mailKeyReady(key)) throw new Error('MAIL_ASSISTANT_ENCRYPTION_KEY missing');
  return Buffer.from(key!, 'hex');
}
function aad(userId: string) { return Buffer.from('planirovych:mail1:' + userId, 'utf8'); }
export function encryptMailPassword(password: string, userId: string, key = process.env.MAIL_ASSISTANT_ENCRYPTION_KEY) {
  if (!password || Buffer.byteLength(password) > 1024) throw new Error('Invalid mail app password');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret(key), iv);
  cipher.setAAD(aad(userId));
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function decryptMailPassword(value: string, userId: string, key = process.env.MAIL_ASSISTANT_ENCRYPTION_KEY) {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION || value.length > 4096) throw new Error('Invalid mail session');
  const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url'), data = Buffer.from(parts[3], 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || !data.length) throw new Error('Invalid mail session');
  const decipher = createDecipheriv('aes-256-gcm', secret(key), iv);
  decipher.setAAD(aad(userId)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
