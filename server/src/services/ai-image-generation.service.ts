import { prisma } from '../db/prisma.js';
import { openAiFetch } from '../lib/openai-fetch.js';
import { providerNanoUsdToMilliCredits, recordAiCreditCharge } from './ai-usage-metering.service.js';
import { refundAiCreditReservation, reserveAiCreditsMilliUpTo, settleAiCreditReservation } from './ai-credit-wallet.service.js';
import type { GeneratedDocumentMeta } from './word-document.service.js';

// The first iteration uses GPT Image 2 at low quality and a fixed pixel count.
// Reserve up to $0.03 in user credits, then settle against the provider's actual
// image output + text prompt token usage. Do not generate if the user cannot
// afford the minimum reservation. Prices checked against the OpenAI API rate card.
export const AI_IMAGE_MODEL = 'gpt-image-2';
export const AI_IMAGE_QUALITY = 'low';
export const AI_IMAGE_MIN_RESERVATION_MILLI = 15_000;
export const AI_IMAGE_MAX_RESERVATION_MILLI = 50_000;
export const AI_IMAGE_FALLBACK_COST_NANO_USD = 6_000_000n;

export const AI_IMAGE_TOOL = {
  type: 'function', name: 'generate_image', strict: true,
  description: 'Создать изображение при явном запросе пользователя: нарисовать, сгенерировать, создать картинку. Передай законченный подробный визуальный промпт. За запрос можно создать только одно изображение. Сервер автоматически прикрепит результат.',
  parameters: {
    type: 'object', additionalProperties: false, required: ['prompt', 'size'],
    properties: {
      prompt: { type: 'string', description: 'Подробный промпт для генератора изображения.' },
      size: { type: 'string', enum: ['1024x1024', '1024x1536', '1536x1024'] }
    }
  }
} as const;

export type AiImageGenerationResult = { document: GeneratedDocumentMeta; creditsSpentMilli: number };
export type AiImageUsage = {
  input_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
  output_tokens?: number;
  output_tokens_details?: { image_tokens?: number };
};
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

// GPT Image 2 standard rate: $2.50/M input text, $4/M input image,
// $15/M output image. Integer arithmetic keeps credit rounding predictable.
export function calculateImageCostNanoUsd(usage: AiImageUsage | null | undefined): bigint | null {
  if (!usage || !Number.isSafeInteger(usage.output_tokens) || (usage.output_tokens ?? 0) <= 0) return null;
  const text = count(usage.input_tokens_details?.text_tokens ?? usage.input_tokens);
  const imageInput = count(usage.input_tokens_details?.image_tokens);
  const imageOutput = count(usage.output_tokens_details?.image_tokens ?? usage.output_tokens);
  return (BigInt(text) * 2_500_000_000n
    + BigInt(imageInput) * 4_000_000_000n
    + BigInt(imageOutput) * 15_000_000_000n + 999_999n) / 1_000_000n;
}

export function validateImageToolArguments(raw: unknown): { prompt: string; size: '1024x1024' | '1024x1536' | '1536x1024' } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Некорректные параметры генерации изображения.');
  const source = raw as Record<string, unknown>;
  const prompt = typeof source.prompt === 'string' ? source.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 3200) throw new TypeError('Промпт изображения должен содержать от 3 до 3200 символов.');
  if (source.size !== '1024x1024' && source.size !== '1024x1536' && source.size !== '1536x1024') throw new TypeError('Недопустимый размер изображения.');
  return { prompt, size: source.size };
}

export function decodeGeneratedImage(data: unknown): Buffer {
  if (typeof data !== 'string' || data.length < 128 || data.length > 12_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('Генератор вернул некорректный файл изображения.');
  }
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length < 100 || buffer.length > 8 * 1024 * 1024 ||
    !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('Генератор вернул некорректный PNG.');
  }
  return buffer;
}

export async function generateAiImage(input: {
  userId: string; taskId?: string; actionId: string; apiKey: string; args: unknown; sourceImageId?: string;
}): Promise<AiImageGenerationResult> {
  const { prompt, size } = validateImageToolArguments(input.args);
  if (input.taskId) {
    const allowed = await prisma.task.findFirst({
      where: { id: input.taskId, OR: [
        { userId: input.userId },
        { collaboration: { members: { some: { userId: input.userId, isHidden: false } } } }
      ] }, select: { id: true }
    });
    if (!allowed) throw new Error('Задача недоступна для создания изображения.');
  }

  // The source must be a generated PNG owned by the requesting user. Never
  // trust image bytes, URLs or owner identity supplied by the chat client.
  const sourceImage = input.sourceImageId
    ? await prisma.aiGeneratedDocument.findFirst({
        where: { id: input.sourceImageId, userId: input.userId, mimeType: 'image/png' },
        select: { id: true, size: true, contentBase64: true }
      })
    : null;
  if (input.sourceImageId && !sourceImage) {
    throw new Error('Исходное изображение не найдено или недоступно.');
  }
  if (sourceImage && (sourceImage.size < 100 || sourceImage.size > 8 * 1024 * 1024)) {
    throw new Error('Размер исходного изображения не поддерживается.');
  }

  const reservation = await reserveAiCreditsMilliUpTo(
    input.userId, AI_IMAGE_MIN_RESERVATION_MILLI, AI_IMAGE_MAX_RESERVATION_MILLI
  );
  let settled = false;
  try {
    // The Images API accepts base64 data URLs in JSON images/edits input.
    // Keep the same metering, proxy, PNG validation and document pipeline as
    // generations; only the provider endpoint and payload change for edits.
    const editing = Boolean(sourceImage);
    const imagePayload = editing
      ? { model: AI_IMAGE_MODEL, prompt, n: 1, quality: AI_IMAGE_QUALITY, size, output_format: 'png',
          images: [{ image_url: `data:image/png;base64,${sourceImage!.contentBase64}` }] }
      : { model: AI_IMAGE_MODEL, prompt, n: 1, quality: AI_IMAGE_QUALITY, size, output_format: 'png' };
    const response = await openAiFetch(
      editing ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations',
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify(imagePayload) },
      { requestId: `${input.actionId}:image`, model: AI_IMAGE_MODEL }
    );
    if (!response.ok) throw new Error(`OpenAI не смог ${editing ? 'изменить' : 'создать'} изображение (HTTP ${response.status}).`);
    const result = await response.json() as { data?: Array<{ b64_json?: unknown }>; usage?: AiImageUsage };
    const buffer = decodeGeneratedImage(result.data?.[0]?.b64_json);

    // Reuse the existing auth-protected Word/Excel download pipeline.
    const document = await prisma.aiGeneratedDocument.create({
      data: {
        userId: input.userId, taskId: input.taskId ?? null,
        fileName: `image-${input.actionId.slice(0, 8)}.png`,
        mimeType: 'image/png', size: buffer.length, contentBase64: buffer.toString('base64')
      },
      select: { id: true, fileName: true, mimeType: true, size: true }
    });

    const providerNanoUsd = calculateImageCostNanoUsd(result.usage);
    if (providerNanoUsd === null) {
      console.warn('[AI image] provider usage missing; using published low-quality image price estimate', {
        actionId: input.actionId, model: AI_IMAGE_MODEL
      });
    }
    const providerCreditsMilli = providerNanoUsdToMilliCredits(providerNanoUsd ?? AI_IMAGE_FALLBACK_COST_NANO_USD);
    const settlement = await settleAiCreditReservation(reservation, providerCreditsMilli);
    settled = true;
    if (providerCreditsMilli > reservation.totalMilli) {
      console.error('[AI image] provider cost exceeded reserved credits; user charge capped', {
        actionId: input.actionId, model: AI_IMAGE_MODEL, providerCreditsMilli, chargedMilli: settlement.chargedMilli
      });
    }
    await recordAiCreditCharge({
      userId: input.userId, actionId: input.actionId,
      requestId: `${input.actionId}:image-charge:${document.id}`,
      feature: 'image_generation', model: AI_IMAGE_MODEL, creditsSpentMilli: settlement.chargedMilli
    });
    return { document, creditsSpentMilli: settlement.chargedMilli };
  } catch (error) {
    if (!settled) await refundAiCreditReservation(reservation).catch(() => undefined);
    throw error;
  }
}
