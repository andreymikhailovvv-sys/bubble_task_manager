/**
 * Authorizing an account is not enough to link it to an arbitrary Planirovych user.
 * For the closed pilot the user must already have linked the same private Telegram
 * identity through the existing bot.
 */
export function matchesBotLinkedTelegramAccount(
  expectedChatId: string | null | undefined,
  actualTelegramId: string,
  isBot: boolean
): boolean {
  if (isBot || !expectedChatId || !/^\d+$/.test(expectedChatId)) return false;
  return /^\d+$/.test(actualTelegramId) && expectedChatId === actualTelegramId;
}
