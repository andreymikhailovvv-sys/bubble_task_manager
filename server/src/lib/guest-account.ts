/**
 * A device-only account is a guest even if it already has legacy credits.
 * A password, Google identity, saved login, email or linked Telegram account
 * is evidence that the account is registered.
 */
export type GuestIdentity = {
  deviceId?: string | null;
  username?: string | null;
  passwordHash?: string | null;
  googleSub?: string | null;
  email?: string | null;
  telegramChatId?: string | null;
};

export const isGuestAccount = (user: GuestIdentity): boolean =>
  Boolean(user.deviceId)
  && !user.username
  && !user.passwordHash
  && !user.googleSub
  && !user.email
  && !user.telegramChatId;
