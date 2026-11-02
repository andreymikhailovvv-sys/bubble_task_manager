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
  if (message === 'Почтовый сервер отключился') {
    return {code: 'IMAP_CONNECTION_CLOSED', stage: 'READ', message: 'Почтовый сервер закрыл IMAP-соединение во время проверки.'};
  }
  if (message === 'Слишком большое письмо' || message === 'Слишком большой ответ IMAP') {
    return {code: 'IMAP_RESPONSE_LIMIT', stage: 'READ', message: 'Ответ почтового сервера превысил допустимый размер.'};
  }
  if (message === 'Неполные IMAP данные') {
    return {code: 'IMAP_STATUS_INVALID', stage: 'STATUS', message: 'Почтовый сервер вернул неполные данные о папке.'};
  }
  if (message === 'IMAP недоступен') {
    return {code: 'IMAP_UNAVAILABLE', stage: 'CONNECT', message: 'Почтовый сервер не подтвердил готовность IMAP.'};
  }
  if (/^P[12]\d{3}$/.test(code)) {
    return {code: 'MAIL_DATABASE_' + code, stage: 'DATABASE', message: 'Сбой операции с базой данных почтового ассистента.'};
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
