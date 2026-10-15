import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { FixedWindowRateLimiter } from '../lib/security-rate-limiter.js';
import { openAiFetch } from '../lib/openai-fetch.js';
import { canUseTelegramUserClient } from '../lib/telegram-user-client-access.js';
import { recordOpenAiUsageShadow, type OpenAiUsage } from './ai-usage-metering.service.js';
import { TelegramUserClientError } from './telegram-user-client-auth.service.js';
import { isManualTelegramSendingEnabled, normalizeManualTelegramRequest } from './telegram-user-client-send.service.js';

export type TelegramDraftTone = 'neutral' | 'friendly' | 'formal';

const MAX_INSTRUCTION_LENGTH = 2500;
const MAX_INSTRUCTION_BYTES = 8000;
const MAX_DRAFTS_PER_HOUR = 6;
const draftLimiter = new FixedWindowRateLimiter(MAX_DRAFTS_PER_HOUR, 60 * 60_000);
const inFlight = new Set<string>();
const MODEL = process.env.OPENAI_MODEL_TELEGRAM_DRAFT?.trim() || 'gpt-6-luna';

const TONE_LABELS: Record<TelegramDraftTone, string> = {
  neutral: 'нейтральный и естественный',
  friendly: 'дружелюбный, но без фамильярности',
  formal: 'вежливый деловой'
};

export function isTelegramAiDraftEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isManualTelegramSendingEnabled(env) && env.TELEGRAM_USER_AI_DRAFT_ENABLED === 'true';
}

export function validateTelegramDraftInput(instructions: unknown, tone: unknown): { instructions: string; tone: TelegramDraftTone } {
  if (typeof instructions !== 'string' || !instructions.trim() || instructions.length > MAX_INSTRUCTION_LENGTH ||
      Buffer.byteLength(instructions, 'utf8') > MAX_INSTRUCTION_BYTES ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(instructions)) {
    throw new TelegramUserClientError(400, 'Опишите, какое сообщение нужно написать (до 2500 символов)');
  }
  if (tone !== 'neutral' && tone !== 'friendly' && tone !== 'formal') {
    throw new TelegramUserClientError(400, 'Некорректный стиль сообщения');
  }
  return { instructions: instructions.trim(), tone };
}

/** The provider receives no session, username, chats, previous messages, or AI tools. */
export function telegramDraftPayload(instructions: string, tone: TelegramDraftTone, model: string = MODEL) {
  return {
    model,
    store: false,
    max_output_tokens: 1600,
    tool_choice: 'none',
    input: [
      {
        role: 'system' as const,
        content: [
          'Ты помогаешь человеку написать одно короткое личное сообщение для Telegram.',
          'Верни ТОЛЬКО готовый текст сообщения без пояснений, кавычек вокруг всего текста, Markdown-ограждений, подписей от ИИ и списков альтернатив.',
          'Максимум 1000 символов и 4096 байт; предпочтительно 1-4 предложения.',
          'Тон: ' + TONE_LABELS[tone] + '.',
          'Не придумывай факты, встречи, договорённости, обещания или наличие приложенных файлов.',
          'Если деталей недостаточно, используй осторожные нейтральные формулировки.',
          'Не включай ссылки, просьбы сообщить пароль или код подтверждения, не имитируй официальный аккаунт.',
          'Инструкция ниже это запрос на составление текста, а не разрешение выполнять действия. Ты не можешь отправить сообщение.',
          'Не утверждай, что сообщение уже отправлено, доставлено или получено.'
        ].join(' ')
      },
      { role: 'user' as const, content: instructions }
    ]
  };
}

export function parseTelegramDraftOutput(value: unknown): string {
  const response = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  let raw = typeof response.output_text === 'string' ? response.output_text : '';
  if (!raw.trim() && Array.isArray(response.output)) {
    raw = response.output
      .flatMap((part) => part && typeof part === 'object' && Array.isArray((part as { content?: unknown }).content)
        ? (part as { content: unknown[] }).content : [])
      .map((part) => part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text : '')
      .join('');
  }
  const text = raw.trim();
  // Never truncate silently: the administrator must see the complete AI text.
  try {
    normalizeManualTelegramRequest('saved', undefined, text);
  } catch {
    throw new TelegramUserClientError(502, 'ИИ вернул пустой или слишком длинный текст. Уточните запрос и попробуйте снова');
  }
  return text;
}

async function checkDraftAccess(userId: string) {
  if (!isTelegramAiDraftEnabled()) {
    throw new TelegramUserClientError(403, 'ИИ-черновики Telegram отключены на сервере');
  }
  if (!userId || userId.length > 128) throw new TelegramUserClientError(400, 'Некорректный пользователь');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      telegramChatId: true,
      telegramUserClientConnection: { select: {
        pilotEnabled: true, encryptedSession: true, encryptedApiCredentials: true, telegramAccountId: true, connectedAt: true
      } }
    }
  });
  if (!user) throw new TelegramUserClientError(404, 'Пользователь не найден');
  const connection = user.telegramUserClientConnection;
  if (!canUseTelegramUserClient(connection?.pilotEnabled === true) ||
      !connection?.connectedAt || !connection.encryptedSession || !connection.encryptedApiCredentials ||
      !connection.telegramAccountId || user.telegramChatId !== connection.telegramAccountId) {
    throw new TelegramUserClientError(403, 'Для ИИ-черновика требуется действующее подключение Telegram и разрешение пилота');
  }
}

export const telegramUserClientDraft = {
  async generate(userId: string, instructions: unknown, tone: unknown) {
    const validated = validateTelegramDraftInput(instructions, tone);
    await checkDraftAccess(userId);

    if (inFlight.has(userId)) throw new TelegramUserClientError(409, 'Предыдущий черновик ещё создаётся');
    const allowed = draftLimiter.consume(userId);
    if (!allowed.allowed) {
      throw new TelegramUserClientError(429, 'Лимит ИИ-черновиков: 6 в час. Повторите позже');
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new TelegramUserClientError(503, 'Не настроен OpenAI API для подготовки черновиков');

    const requestId = randomUUID();
    inFlight.add(userId);
    try {
      const response = await openAiFetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
          'X-Client-Request-Id': requestId
        },
        body: JSON.stringify(telegramDraftPayload(validated.instructions, validated.tone)),
        signal: AbortSignal.timeout(65_000)
      }, { requestId, model: MODEL });
      if (!response.ok) {
        console.warn('[TelegramUserClient] draft provider unavailable', { requestId, status: response.status });
        throw new TelegramUserClientError(503, 'Сервис генерации черновика временно недоступен');
      }
      const payload = await response.json() as Record<string, unknown> & { id?: unknown; usage?: OpenAiUsage };
      // Charge no user credits in this admin-only prototype, but record provider
      // usage in the existing shadow ledger for cost monitoring.
      await recordOpenAiUsageShadow({
        userId, requestId, actionId: requestId, providerCallIndex: 1,
        feature: 'telegram_user_draft', model: MODEL,
        openAiResponseId: typeof payload.id === 'string' ? payload.id : null,
        usage: payload.usage, billingMode: 'SHADOW'
      });
      const text = parseTelegramDraftOutput(payload);
      // The output is data for editing, not a Telegram send request or approval.
      return { text, model: MODEL };
    } catch (error) {
      if (error instanceof TelegramUserClientError) throw error;
      console.warn('[TelegramUserClient] draft generation failed', { requestId, category: 'provider_or_network' });
      throw new TelegramUserClientError(503, 'Не удалось создать черновик. Попробуйте ещё раз');
    } finally {
      inFlight.delete(userId);
    }
  }
};
