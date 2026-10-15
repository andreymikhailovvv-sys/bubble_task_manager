import { randomUUID } from 'node:crypto';
import { telegramUserClientRead } from './telegram-user-client-read.service.js';
import { telegramUserChatCapability } from './telegram-user-client-chat-access.service.js';
import { validateQuickText } from './telegram-quick-share-ai.service.js';

export const TELEGRAM_PREPARE_SEND_TOOL = {
  type: 'function',
  name: 'prepare_telegram_send',
  strict: true,
  description: 'Подготовить Telegram-сообщение, но НЕ отправлять. Вызывай только по явному запросу пользователя отправить или переслать сообщение в Telegram человеку, группе, супергруппе либо в «Избранное». Передай готовый текст на основе текущего разговора/задачи, recipient как назвал человек и text. Сервер создаст встроенную карточку с адресатом и текстом, пользователь сможет изменить получателя и нажать «Отправить». Не сообщай об отправке до подтверждения. Если не указан получатель, уточни у пользователя. Нельзя выбирать произвольный Telegram ID.',
  parameters: {
    type: 'object', additionalProperties: false,
    required: ['recipient', 'text'],
    properties: {
      recipient: { type: 'string', description: 'Имя собеседника, название группы или @username либо Избранное' },
      text: { type: 'string', description: 'Готовый текст отправки, максимум 4000 символов' }
    }
  }
} as const;

export type TelegramInlineSendDraft = {
  requestId: string;
  text: string;
  requestedRecipient: string;
  recipientId: string | null;
  recipientName: string | null;
  match: 'exact' | 'unique' | 'ambiguous' | 'not_found';
};

export function matchTelegramRecipient<T extends { id: string; name: string; username: string | null }>(requested: string, dialogs: T[]) {
  const query = requested.trim().replace(/^@/, '').toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
  if (!query) return { match: 'not_found' as const, recipient: null };
  const exact = dialogs.filter(d => [d.name, d.username ?? ''].some(v => v.replace(/^@/, '').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ') === query));
  if (exact.length === 1) return { match: 'exact' as const, recipient: exact[0] };
  if (exact.length > 1) return { match: 'ambiguous' as const, recipient: null };
  // Russian dative recipient phrasing, e.g. "Ване Иванову" -> "Иван Иванов".
  // Use this only for a *unique surname*, never guess if multiple users match.
  const tokens = query.split(' ');
  if (tokens.length >= 2) {
    const targetSurname = tokens[tokens.length - 1].replace(/(ов|ев|ёв)у$/u, '$1');
    if (targetSurname.length >= 5) {
      const surnameMatches = dialogs.filter(d => (!('kind' in d) || d.kind === 'user') && d.name.trim().toLocaleLowerCase('ru-RU').split(/\s+/).slice(-1)[0] === targetSurname);
      if (surnameMatches.length === 1) return { match: 'unique' as const, recipient: surnameMatches[0] };
      if (surnameMatches.length > 1) return { match: 'ambiguous' as const, recipient: null };
    }
  }
  const partial = dialogs.filter(d => [d.name, d.username ?? ''].some(v =>
    v.toLocaleLowerCase('ru-RU').includes(query)));
  return partial.length === 1 ? { match: 'unique' as const, recipient: partial[0] } :
    { match: partial.length ? 'ambiguous' as const : 'not_found' as const, recipient: null };
}

export function validateTelegramDraftArguments(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные параметры Telegram');
  const v = value as { recipient?: unknown; text?: unknown };
  if (typeof v.recipient !== 'string' || !v.recipient.trim() || v.recipient.length > 120) {
    throw new Error('Укажите имя или @username получателя');
  }
  return { recipient: v.recipient.trim(), text: validateQuickText(v.text) };
}

/** Read only dialog metadata; the model gets no Telegram IDs, contacts or message history. */
export async function prepareTelegramInlineSendDraft(userId: string, value: unknown): Promise<
  { ok: true; draft: TelegramInlineSendDraft } | { ok: false; code: string; message: string }
> {
  let input: ReturnType<typeof validateTelegramDraftArguments>;
  try { input = validateTelegramDraftArguments(value); }
  catch (error) { return { ok: false, code: 'INVALID_ARGUMENTS', message: error instanceof Error ? error.message : 'Некорректный текст' }; }

  const capability = await telegramUserChatCapability(userId);
  if (!capability.connected || !capability.readEnabled || !capability.sendEnabled) {
    return { ok: false, code: 'TELEGRAM_NOT_CONNECTED', message: 'Личный Telegram не подключён или отправка недоступна. Пользователь должен подключить Telegram к своему аккаунту.' };
  }
  try {
    const list = await telegramUserClientRead.listSendTargets(userId);
    const isSaved = /^(избранное|сохран[её]нные сообщения|saved messages|saved)$/i.test(input.recipient);
    const matched = isSaved
      ? { match: 'exact' as const, recipient: { id: 'saved', name: 'Избранное', username: null, kind: 'user' as const } }
      : matchTelegramRecipient(input.recipient, list.dialogs);
    return {
      ok: true,
      draft: {
        requestId: randomUUID(),
        text: input.text,
        requestedRecipient: input.recipient,
        recipientId: matched.recipient?.id ?? null,
        recipientName: matched.recipient?.name ?? null,
        match: matched.match
      }
    };
  } catch {
    return { ok: false, code: 'TELEGRAM_UNAVAILABLE', message: 'Сейчас не удалось проверить контакты Telegram. Попробуйте повторить запрос.' };
  }
}
