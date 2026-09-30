import { prisma } from '../db/prisma.js';
import { OPENAI_PRICING_VERSION, resolveOpenAiTokenRates } from '../config/openai-pricing.js';

const TOKENS_PER_MILLION = 1_000_000n;
const NANO_USD_PER_MILLICREDIT = 600n;

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

const formatNanoUsd = (value: bigint) => `${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, '0')}`;

export async function recordOpenAiUsageShadow(
  input: RecordOpenAiUsageInput,
  repository: UsageEventRepository = prisma.aiUsageEvent
): Promise<void> {
  if (process.env.AI_USAGE_SHADOW_ENABLED?.trim().toLowerCase() === 'false') return;

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
        providerCostNanoUsd: metering.providerCostNanoUsd,
        estimatedCreditsMilli: metering.estimatedCreditsMilli,
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
      providerCostNanoUsd: metering.providerCostNanoUsd?.toString() ?? null,
      providerCostUsd: metering.providerCostNanoUsd === null ? null : formatNanoUsd(metering.providerCostNanoUsd),
      estimatedCreditsMilli: metering.estimatedCreditsMilli,
      estimatedCredits: metering.estimatedCreditsMilli === null ? null : metering.estimatedCreditsMilli / 1000,
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
