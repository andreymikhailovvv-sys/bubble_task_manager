// Sanitized mail diagnostics. Never include passwords, IMAP server replies, or message contents.
export type MailDiagnostic = {
  code: string;
  stage: string;
  message: string;
};
export function diagnoseMailError(cause: unknown): MailDiagnostic {
  const value = cause && typeof cause === 'object' ? cause as { code?: unknown; stage?: unknown; message?: unknown } : {};
  const code = typeof value.code === 'string' ? value.code : '';
  const stage = typeof value.stage === 'string' && /^[A-Z_]{2,20}$/.test(value.stage) ? value.stage : 'UNKNOWN';
  const message = typeof value.message === 'string' ? value.message : '';
  if (code === 'IMAP_REJECTED') {
    return stage === 'LOGIN'
      ? {code: 'IMAP_AUTH_REJECTED', stage, message: 'Почтовый сервер отклонил вход. Проверьте пароль приложения и разрешение IMAP.'}
      : {code: 'IMAP_COMMAND_REJECTED', stage, message: 'Почтовый сервер отклонил команду ' + stage + '. Проверьте доступность папки и настройки почты.'};
  }
  if (code === 'ETIMEDOUT' || message === 'timeout') {
    return {code: 'IMAP_TIMEOUT', stage: 'CONNECT', message: 'Превышено время ожидания IMAP. Проверьте исходящие подключения сервера к порту 993.'};
  }
  if (['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ECONNRESET'].includes(code)) {
    return {code: 'IMAP_NETWORK_' + code, stage: 'CONNECT', message: 'Не удаётся связаться с почтовым сервером по IMAP (порт 993).'};
  }
  if (/^ERR_TLS_|^CERT_|^UNABLE_TO_VERIFY_|^DEPTH_ZERO_SELF_SIGNED_CERT$/.test(code)) {
    return {code: 'IMAP_TLS', stage: 'CONNECT', message: 'Ошибка защищённого TLS-соединения с почтовым сервером.'};
  }
  if (/Дневной лимит кредитов/.test(message)) {
    return {code: 'MAIL_DAILY_LIMIT', stage: 'ANALYSIS', message: 'Достигнут дневной лимит кредитов почтового ассистента.'};
  }
  if (/Недостаточно кредитов/.test(message)) {
    return {code: 'MAIL_CREDITS_EXHAUSTED', stage: 'ANALYSIS', message: 'Недостаточно кредитов для анализа писем.'};
  }
  if (/OpenAI|Unknown AI usage|Unknown model pricing|Некорректный ответ ИИ/.test(message)) {
    return {code: 'MAIL_AI_FAILURE', stage: 'ANALYSIS', message: 'Не удалось проанализировать письмо: ответ ИИ недоступен или некорректен.'};
  }
  if (/Invalid mail session|Unsupported state|unable to authenticate data|MAIL_ASSISTANT_ENCRYPTION_KEY missing/.test(message)) {
    return {code: 'MAIL_CREDENTIAL_DECRYPTION', stage: 'AUTH', message: 'Не удалось расшифровать пароль приложения. Проверьте неизменность ключа шифрования на сервере.'};
  }
  return {code: 'MAIL_OPERATION_FAILED', stage, message: 'Не удалось выполнить операцию с почтой. Подробности доступны в диагностическом коде.'};
}
