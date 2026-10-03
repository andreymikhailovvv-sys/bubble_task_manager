import crypto from 'node:crypto';

export type TelegramWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export const validateTelegramWebAppInitData = (
  initDataRaw: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): TelegramWebAppUser => {
  const parsed = new URLSearchParams(initDataRaw);
  const hash = parsed.get('hash');
  if (!hash || !/^[a-f\d]{64}$/i.test(hash)) throw new Error('Invalid init data hash');

  const pairs: string[] = [];
  parsed.forEach((value, key) => {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(hash, 'hex'))) {
    throw new Error('Invalid init data signature');
  }

  const authDate = Number(parsed.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 60 || nowSeconds - authDate > 24 * 60 * 60) {
    throw new Error('Invalid or expired auth_date');
  }

  const userRaw = parsed.get('user');
  if (!userRaw) throw new Error('Missing user in init data');

  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new Error('Invalid user payload in init data');
  }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new Error('Missing telegram user id in init data');
  return user;
};
