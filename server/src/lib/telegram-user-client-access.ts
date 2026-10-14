// Both switches are mandatory for future user-client actions.
// Admin-only pilot permission is not equivalent to Telegram user authorization.
export function isTelegramUserClientGloballyEnabled(value: string | undefined = process.env.TELEGRAM_USER_CLIENT_ENABLED): boolean {
  return value === 'true';
}

export function canUseTelegramUserClient(
  pilotEnabled: boolean,
  globalValue: string | undefined = process.env.TELEGRAM_USER_CLIENT_ENABLED
): boolean {
  return isTelegramUserClientGloballyEnabled(globalValue) && pilotEnabled === true;
}
