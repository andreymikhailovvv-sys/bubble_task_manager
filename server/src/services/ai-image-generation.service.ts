import { prisma } from '../db/prisma.js';
import { openAiFetch } from '../lib/openai-fetch.js';
import { providerNanoUsdToMilliCredits, recordAiCreditCharge } from './ai-usage-metering.service.js';
import { refundAiCreditReservation, reserveAiCreditsMilliUpTo, settleAiCreditReservation } from './ai-credit-wallet.service.js';
import type { GeneratedDocumentMeta } from './word-document.service.js';
import type { ValidatedImage } from './ai-user-image-input.js';

// Image quality was previously hard-coded to "low". Image model and quality
// are server-controlled; clients cannot override them or manipulate billing.
export const AI_IMAGE_MODEL = 'gpt-image-2.5-flare';
export const AI_IMAGE_QUALITY = 'high';
export const AI_IMAGE_MIN_RESERVATION_MILLI = 30_000;
export const AI_IMAGE_MAX_RESERVATION_MILLI = 350_000;
export const AI_IMAGE_FALLBACK_COST_NANO_USD = 75_000_000n;
export const AI_IMAGE_MAX_REFERENCE_FILES = 5;

export const AI_IMAGE_TOOL = {
  type: 'function', name: 'generate_image', strict: true,
  description: 'Создать изображение с нуля или собрать композицию по изображениям-референсам. Если пользователь просит использовать загруженные или ранее сохранённые изображения, передай точные fileId из КАТАЛОГА в sourceFileIds (до 5). Первое изображение является основой композиции, остальные визуальные референсы. Не угадывай ID; не выбирай старый файл без ясного указания пользователя. За запрос только одно изображение.',
  parameters: {
    type: 'object', additionalProperties: false, required: ['prompt', 'size', 'sourceFileIds'],
    properties: {
      prompt: { type: 'string', description: 'Подробная инструкция: что сохранить из основы, что взять из каждого референса, что изменить.' },
      size: { type: 'string', enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'] },
      sourceFileIds: { type: 'array', description: 'Точные fileId изображений из каталога в нужном порядке (пустой массив для генерации с нуля). Первый — основа; остальные — референсы.', items: { type: 'string' } }
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

export function validateImageToolArguments(raw: unknown): { prompt: string; size: '1024x1024' | '1024x1536' | '1536x1024' | 'auto'; sourceFileIds: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Некорректные параметры генерации изображения.');
  const source = raw as Record<string, unknown>;
  const prompt = typeof source.prompt === 'string' ? source.prompt.trim() : '';
  if (prompt.length < 3 || prompt.length > 3200) throw new TypeError('Промпт изображения должен содержать от 3 до 3200 символов.');
  if (source.size !== '1024x1024' && source.size !== '1024x1536' && source.size !== '1536x1024' && source.size !== 'auto') throw new TypeError('Недопустимый размер изображения.');
  const sourceFileIds = source.sourceFileIds === undefined ? [] : source.sourceFileIds;
  if (!Array.isArray(sourceFileIds) || sourceFileIds.length > AI_IMAGE_MAX_REFERENCE_FILES
    || sourceFileIds.some((id) => typeof id !== 'string' || id.length < 3 || id.length > 160)
    || new Set(sourceFileIds).size !== sourceFileIds.length) {
    throw new TypeError('Некорректный список изображений-референсов (максимум 5 уникальных файлов).');
  }
  return { prompt, size: source.size, sourceFileIds: sourceFileIds as string[] };
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

/** Construct the provider payload only from image bytes resolved on the server.
 * Source #1 is the edit target; other images provide additional visual references.
 * The provider may still redraw pixels outside the requested region: a prompt
 * is not an exact pixel-preservation mask.
 */
export function buildImageApiRequest(
  prompt: string, size: '1024x1024' | '1024x1536' | '1536x1024' | 'auto',
  sources: ValidatedImage[]
) {
  if (sources.length > AI_IMAGE_MAX_REFERENCE_FILES) throw new TypeError('Слишком много изображений-референсов.');
  const editing = sources.length > 0;
  const editPrompt = editing
    ? [
        'Редактирование существующего изображения с визуальными референсами.',
        'Изображение №1 — основа результата. По возможности точно сохраняй его композицию, расположение и внешний вид неизменяемых элементов.',
        'Изображения №2 и далее — дополнительные референсы: используй нужные объекты и детали только согласно запросу, не заменяй ими основную композицию.',
        'Изменяй только то, что просит пользователь. Не добавляй незапрошенные объекты и надписи.',
        prompt
      ].join('\n')
    : prompt;
  const common = { model: AI_IMAGE_MODEL, prompt: editPrompt, n: 1, quality: AI_IMAGE_QUALITY, size, output_format: 'png' };
  return editing
    ? { endpoint: 'https://api.openai.com/v1/images/edits', payload: {
        ...common, images: sources.map((image) => ({ image_url: `data:${image.mimeType};base64,${image.contentBase64}` }))
      } }
    : { endpoint: 'https://api.openai.com/v1/images/generations', payload: common };
}

export async function generateAiImage(input: {
  userId: string; taskId?: string; actionId: string; apiKey: string; args: unknown; sourceImageId?: string; uploadedSourceImage?: ValidatedImage; sourceImages?: ValidatedImage[];
}): Promise<AiImageGenerationResult> {
  const { prompt, size, sourceFileIds } = validateImageToolArguments(input.args);
  if (sourceFileIds.length && input.sourceImages?.length !== sourceFileIds.length) {
    throw new TypeError('Не удалось получить все выбранные изображения. Генерация отменена без списания.');
  }
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
  const sourceImage = !input.uploadedSourceImage && input.sourceImageId
    ? await prisma.aiGeneratedDocument.findFirst({
        where: { id: input.sourceImageId, userId: input.userId, mimeType: 'image/png' },
        select: { id: true, size: true, contentBase64: true }
      })
    : null;
  if (input.sourceImageId && !input.uploadedSourceImage && !sourceImage) {
    throw new Error('Исходное изображение не найдено или недоступно.');
  }
  if (sourceImage && (sourceImage.size < 100 || sourceImage.size > 8 * 1024 * 1024)) {
    throw new Error('Размер исходного изображения не поддерживается.');
  }

  const sources: ValidatedImage[] = input.sourceImages ?? (input.uploadedSourceImage
    ? [input.uploadedSourceImage]
    : sourceImage ? [{ mimeType: 'image/png', contentBase64: sourceImage.contentBase64 }] : []);
  if (sources.length > AI_IMAGE_MAX_REFERENCE_FILES) throw new TypeError('Слишком много изображений-референсов.');
  const reservation = await reserveAiCreditsMilliUpTo(
    input.userId, AI_IMAGE_MIN_RESERVATION_MILLI, AI_IMAGE_MAX_RESERVATION_MILLI
  );
  let settled = false;
  try {
    const { endpoint, payload } = buildImageApiRequest(prompt, size, sources);
    const editing = sources.length > 0;
    console.info('[AI image] provider request', {
      actionId: input.actionId, model: AI_IMAGE_MODEL, quality: AI_IMAGE_QUALITY,
      editing, referenceCount: sources.length, size
    });
    const response = await openAiFetch(endpoint,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify(payload) },
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
      console.warn('[AI image] provider usage missing; using fallback image cost estimate', {
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
