/** Pure eligibility check for a one-time private Telegram account notice. */
export type TelegramEmailOutreachUser = {
  telegramChatId: string | null;
  email: string | null;
  pendingEmail: string | null;
  emailVerifiedAt: Date | null;
};

export const isPrivateTelegramChatId = (chatId: string): boolean =>
  /^[1-9][0-9]{0,19}$/.test(chatId);

export function telegramEmailOutreachEligibility(
  user: TelegramEmailOutreachUser | null,
  snapshottedChatId: string
): { shouldSend: boolean; hasEmail: boolean } {
  if (!user || !isPrivateTelegramChatId(snapshottedChatId) ||
      user.telegramChatId !== snapshottedChatId) return { shouldSend: false, hasEmail: false };
  const pendingEmail = user.pendingEmail?.trim() ?? '';
  const hasEmail = Boolean(pendingEmail || user.email?.trim());
  const shouldSend = !user.emailVerifiedAt || Boolean(pendingEmail);
  return { shouldSend, hasEmail };
}
