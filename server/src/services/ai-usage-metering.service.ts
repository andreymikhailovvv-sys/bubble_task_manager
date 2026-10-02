import { prisma } from '../db/prisma.js';
import { OPENAI_PRICING_VERSION, resolveOpenAiTokenRates } from '../config/openai-pricing.js';

const TOKENS_PER_MILLION = 1_000_000n;
export const NANO_USD_PER_MILLICREDIT = 600n;
export const providerNanoUsdToMilliCredits = (cost: bigint) => Number((cost + NANO_USD_PER_MILLICREDIT - 1n) / NANO_USD_PER_MILLICREDIT);

export type OpenAiUsage = {
  input_tokens?: unknown;
  input_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown } | null;
  output_tokens?: unknown;
  output_tokens_details?: { reasoning_tokens?: unknown } | null;
  total_tokens?: unknown;
};

export type NormalizedOpenAiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  ordinaryInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type OpenAiUsageCost = NormalizedOpenAiUsage & {
  providerCostNanoUsd: bigint | null;
  estimatedCreditsMilli: number | null;
  pricingFallback: boolean;
};

export type RecordOpenAiUsageInput = {
  userId: string;
  taskId?: string;
  requestId: string;
  actionId?: string | null;
  providerCallIndex?: number | null;
  feature: string;
  model: string;
  openAiResponseId?: string | null;
  usage?: OpenAiUsage | null;
  billingMode?: 'SHADOW' | 'DYNAMIC';
  extraProviderCostNanoUsd?: bigint;
};

type UsageEventRepository = {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
};

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function normalizeOpenAiUsage(usage: OpenAiUsage): NormalizedOpenAiUsage {
  const inputTokens = tokenCount(usage.input_tokens);
  const cachedInputTokens = tokenCount(usage.input_tokens_details?.cached_tokens);
  const cacheWriteTokens = tokenCount(usage.input_tokens_details?.cache_write_tokens);
  const outputTokens = tokenCount(usage.output_tokens);
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    ordinaryInputTokens: Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens),
    outputTokens,
    reasoningTokens: tokenCount(usage.output_tokens_details?.reasoning_tokens),
    totalTokens: tokenCount(usage.total_tokens)
  };
}

export function calculateOpenAiUsageCost(model: string, usage: OpenAiUsage): OpenAiUsageCost {
  const normalized = normalizeOpenAiUsage(usage);
  const rates = resolveOpenAiTokenRates(model, normalized.inputTokens);
  if (!rates) return { ...normalized, providerCostNanoUsd: null, estimatedCreditsMilli: null, pricingFallback: false };

  const pricingFallback = normalized.cacheWriteTokens > 0 && rates.cacheWriteNanoUsdPerMillion === null;
  const costNumerator =
    BigInt(normalized.ordinaryInputTokens) * rates.inputNanoUsdPerMillion
    + BigInt(normalized.cachedInputTokens) * rates.cachedInputNanoUsdPerMillion
    + BigInt(normalized.cacheWriteTokens) * (rates.cacheWriteNanoUsdPerMillion ?? rates.inputNanoUsdPerMillion)
    + BigInt(normalized.outputTokens) * rates.outputNanoUsdPerMillion;
  const providerCostNanoUsd = (costNumerator + TOKENS_PER_MILLION - 1n) / TOKENS_PER_MILLION;
  const estimatedCreditsMilliBigInt = (providerCostNanoUsd + NANO_USD_PER_MILLICREDIT - 1n) / NANO_USD_PER_MILLICREDIT;
  if (estimatedCreditsMilliBigInt > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Estimated millicredits exceed safe integer range');

  return {
    ...normalized,
    providerCostNanoUsd,
    estimatedCreditsMilli: Number(estimatedCreditsMilliBigInt),
    pricingFallback
  };
}

export function calculateMaximumRequestCreditsMilli(input: { model: string; inputTokens: number; maxOutputTokens: number }) {
  const rates = resolveOpenAiTokenRates(input.model, input.inputTokens);
  if (!rates) throw new Error(`Unknown OpenAI pricing for model "${input.model}"`);
  const inputRate = [rates.inputNanoUsdPerMillion, rates.cachedInputNanoUsdPerMillion, rates.cacheWriteNanoUsdPerMillion ?? rates.inputNanoUsdPerMillion]
    .reduce((maximum, rate) => rate > maximum ? rate : maximum);
  const toMilli = (tokens: number, rate: bigint) => Number(((BigInt(tokens) * rate + TOKENS_PER_MILLION - 1n) / TOKENS_PER_MILLION + NANO_USD_PER_MILLICREDIT - 1n) / NANO_USD_PER_MILLICREDIT);
  const inputCreditsMilli = toMilli(input.inputTokens, inputRate);
  const outputCreditsMilli = toMilli(input.maxOutputTokens, rates.outputNanoUsdPerMillion);
  return { inputCreditsMilli, outputCreditsMilli, totalCreditsMilli: inputCreditsMilli + outputCreditsMilli, outputNanoUsdPerMillion: rates.outputNanoUsdPerMillion };
}

export function calculateAffordableOutputTokens(model: string, inputTokens: number, outputBudgetMilli: number) {
  const rates = resolveOpenAiTokenRates(model, inputTokens);
  if (!rates || outputBudgetMilli <= 0) return 0;
  return Number((BigInt(outputBudgetMilli) * NANO_USD_PER_MILLICREDIT * TOKENS_PER_MILLION) / rates.outputNanoUsdPerMillion);
}

const formatNanoUsd = (value: bigint) => `${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, '0')}`;

export async function recordOpenAiUsageShadow(
  input: RecordOpenAiUsageInput,
  repository: UsageEventRepository = prisma.aiUsageEvent
): Promise<void> {
  if (input.billingMode !== 'DYNAMIC' && process.env.AI_USAGE_SHADOW_ENABLED?.trim().toLowerCase() === 'false') return;

  if (!input.usage) {
    console.warn('[AI shadow usage] missing usage', {
      userId: input.userId,
      actionId: input.actionId ?? null,
      requestId: input.requestId,
      providerCallIndex: input.providerCallIndex ?? null,
      feature: input.feature,
      model: input.model,
      openAiResponseId: input.openAiResponseId ?? null
    });
    return;
  }

  try {
    const metering = calculateOpenAiUsageCost(input.model, input.usage);
    const providerCostNanoUsd = metering.providerCostNanoUsd === null ? null : metering.providerCostNanoUsd + (input.extraProviderCostNanoUsd ?? 0n);
    const estimatedCreditsMilli = providerCostNanoUsd === null ? null : providerNanoUsdToMilliCredits(providerCostNanoUsd);
    if (metering.providerCostNanoUsd === null) {
      console.warn('[AI shadow usage] unknown model pricing', {
        requestId: input.requestId,
        feature: input.feature,
        model: input.model,
        pricingVersion: OPENAI_PRICING_VERSION
      });
    }
    if (metering.pricingFallback) {
      console.warn('[AI shadow usage] cache write pricing fallback', {
        requestId: input.requestId,
        feature: input.feature,
        model: input.model,
        cacheWriteTokens: metering.cacheWriteTokens,
        pricingVersion: OPENAI_PRICING_VERSION
      });
    }

    await repository.create({
      data: {
        userId: input.userId,
        actionId: input.actionId ?? null,
        requestId: input.requestId,
        providerCallIndex: input.providerCallIndex ?? null,
        feature: input.feature,
        model: input.model,
        openAiResponseId: input.openAiResponseId ?? null,
        inputTokens: metering.inputTokens,
        cachedInputTokens: metering.cachedInputTokens,
        cacheWriteTokens: metering.cacheWriteTokens,
        outputTokens: metering.outputTokens,
        reasoningTokens: metering.reasoningTokens,
        totalTokens: metering.totalTokens,
        providerCostNanoUsd,
        estimatedCreditsMilli,
        billingMode: input.billingMode ?? 'SHADOW',
        pricingVersion: OPENAI_PRICING_VERSION
      }
    });

    console.info('[AI shadow usage] recorded', {
      userId: input.userId,
      taskId: input.taskId,
      actionId: input.actionId ?? null,
      requestId: input.requestId,
      providerCallIndex: input.providerCallIndex ?? null,
      feature: input.feature,
      model: input.model,
      openAiResponseId: input.openAiResponseId ?? null,
      inputTokens: metering.inputTokens,
      cachedInputTokens: metering.cachedInputTokens,
      cacheWriteTokens: metering.cacheWriteTokens,
      outputTokens: metering.outputTokens,
      reasoningTokens: metering.reasoningTokens,
      totalTokens: metering.totalTokens,
      providerCostNanoUsd: providerCostNanoUsd?.toString() ?? null,
      providerCostUsd: providerCostNanoUsd === null ? null : formatNanoUsd(providerCostNanoUsd),
      estimatedCreditsMilli,
      estimatedCredits: estimatedCreditsMilli === null ? null : estimatedCreditsMilli / 1000,
      pricingVersion: OPENAI_PRICING_VERSION
    });
  } catch (error) {
    console.warn('[AI shadow usage] recording failed', {
      userId: input.userId,
      taskId: input.taskId,
      actionId: input.actionId ?? null,
      requestId: input.requestId,
      providerCallIndex: input.providerCallIndex ?? null,
      feature: input.feature,
      model: input.model,
      openAiResponseId: input.openAiResponseId ?? null,
      error: error instanceof Error ? error.message : 'Unknown shadow metering error'
    });
  }
}
