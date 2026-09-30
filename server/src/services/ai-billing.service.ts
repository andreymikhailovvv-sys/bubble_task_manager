import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { getOpenAiPricing, NANO_USD_PER_MILLICREDIT, PRICING_VERSION } from '../config/openai-pricing.js';
import { AI_OUTPUT_TOKEN_LIMITS, type AiFeature } from '../config/ai-output-limits.js';
import { openAiFetch } from '../lib/openai-fetch.js';

export const FREE_MONTHLY_CREDITS_MILLI = 100_000;

export type OpenAiUsage = {
  input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number };
};

export type NormalizedUsage = { inputTokens: number; cachedInputTokens: number; cacheWriteTokens: number; outputTokens: number; reasoningTokens: number };
export type BillingAmount = NormalizedUsage & { providerCostNanoUsd: bigint; creditsSpentMilli: number };

const nonNegativeInteger = (value: unknown) => Math.max(0, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0);
const divCeil = (value: bigint, divisor: bigint) => (value + divisor - 1n) / divisor;

export function normalizeOpenAiUsage(usage?: OpenAiUsage): NormalizedUsage {
  const inputTokens = nonNegativeInteger(usage?.input_tokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeInteger(usage?.input_tokens_details?.cached_tokens));
  const cacheWriteTokens = Math.min(inputTokens - cachedInputTokens, nonNegativeInteger(usage?.input_tokens_details?.cache_write_tokens));
  return { inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens: nonNegativeInteger(usage?.output_tokens), reasoningTokens: nonNegativeInteger(usage?.output_tokens_details?.reasoning_tokens) };
}

export function calculateOpenAiBilling(model: string, usage?: OpenAiUsage): BillingAmount {
  const normalized = normalizeOpenAiUsage(usage);
  const rates = getOpenAiPricing(model, normalized.inputTokens);
  const ordinaryInput = normalized.inputTokens - normalized.cachedInputTokens - normalized.cacheWriteTokens;
  const cacheWriteRate = rates.cacheWriteNanoUsdPerMillion ?? rates.inputNanoUsdPerMillion;
  const numerator = BigInt(ordinaryInput) * rates.inputNanoUsdPerMillion
    + BigInt(normalized.cachedInputTokens) * rates.cachedInputNanoUsdPerMillion
    + BigInt(normalized.cacheWriteTokens) * cacheWriteRate
    + BigInt(normalized.outputTokens) * rates.outputNanoUsdPerMillion;
  const providerCostNanoUsd = divCeil(numerator, 1_000_000n);
  return { ...normalized, providerCostNanoUsd, creditsSpentMilli: Number(divCeil(providerCostNanoUsd, NANO_USD_PER_MILLICREDIT)) };
}

const period = () => new Date().toISOString().slice(0, 7);

async function reserve(userId: string, actionId: string, amount: number) {
  return prisma.$transaction(async (tx) => {
    const existingLedger = await tx.aiUsageTransaction.findUnique({ where: { actionId } });
    if (existingLedger) return { alreadySettled: existingLedger.creditsChargedMilli };
    const existing = await tx.aiCreditReservation.findUnique({ where: { actionId } });
    if (existing) return { reservation: existing };
    await tx.user.updateMany({ where: { id: userId, aiCreditsPeriod: { not: period() } }, data: { aiIncludedCreditsMilli: FREE_MONTHLY_CREDITS_MILLI, aiCreditsPeriod: period() } });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { aiIncludedCreditsMilli: true, aiBonusCreditsMilli: true, aiPurchasedCreditsMilli: true } });
    if (!user) throw new Error('User not found');
    if (user.aiIncludedCreditsMilli + user.aiBonusCreditsMilli + user.aiPurchasedCreditsMilli < amount) throw new Error('Недостаточно AI кредитов');
    const includedMilli = Math.min(amount, user.aiIncludedCreditsMilli);
    const bonusMilli = Math.min(amount - includedMilli, user.aiBonusCreditsMilli);
    const purchasedMilli = amount - includedMilli - bonusMilli;
    await tx.user.update({ where: { id: userId }, data: { aiIncludedCreditsMilli: { decrement: includedMilli }, aiBonusCreditsMilli: { decrement: bonusMilli }, aiPurchasedCreditsMilli: { decrement: purchasedMilli } } });
    return { reservation: await tx.aiCreditReservation.create({ data: { actionId, userId, includedMilli, bonusMilli, purchasedMilli, reservedMilli: amount } }) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function reserveAiCredits(input: { userId: string; actionId?: string; model: string; inputTokens: number; maxOutputTokens: number }) {
  const actionId = input.actionId || randomUUID();
  const maximum = calculateOpenAiBilling(input.model, { input_tokens: input.inputTokens, output_tokens: input.maxOutputTokens });
  const result = await reserve(input.userId, actionId, Math.max(1, maximum.creditsSpentMilli));
  return { actionId, reservedMilli: Math.max(1, maximum.creditsSpentMilli), ...result };
}

export async function releaseAiReservation(actionId: string) {
  await prisma.$transaction(async (tx) => {
    const held = await tx.aiCreditReservation.findUnique({ where: { actionId } });
    if (!held) return;
    await tx.user.update({ where: { id: held.userId }, data: { aiIncludedCreditsMilli: { increment: held.includedMilli }, aiBonusCreditsMilli: { increment: held.bonusMilli }, aiPurchasedCreditsMilli: { increment: held.purchasedMilli } } });
    await tx.aiCreditReservation.delete({ where: { id: held.id } });
  });
}

export async function settleAiReservation(input: { actionId: string; feature: string; model: string; usage: OpenAiUsage; usageDetails?: unknown; providerCallCount?: number }) {
  const amount = calculateOpenAiBilling(input.model, input.usage);
  return prisma.$transaction(async (tx) => {
    const prior = await tx.aiUsageTransaction.findUnique({ where: { actionId: input.actionId } });
    if (prior) return { creditsSpentMilli: prior.creditsChargedMilli };
    const held = await tx.aiCreditReservation.findUnique({ where: { actionId: input.actionId } });
    if (!held) throw new Error('AI credit reservation not found');
    if (amount.creditsSpentMilli > held.reservedMilli) throw new Error('AI usage exceeded reserved credits');
    let charged = amount.creditsSpentMilli;
    const included = Math.min(charged, held.includedMilli); charged -= included;
    const bonus = Math.min(charged, held.bonusMilli); charged -= bonus;
    const purchased = charged;
    await tx.user.update({ where: { id: held.userId }, data: { aiIncludedCreditsMilli: { increment: held.includedMilli - included }, aiBonusCreditsMilli: { increment: held.bonusMilli - bonus }, aiPurchasedCreditsMilli: { increment: held.purchasedMilli - purchased }, aiEfficiencyCreditsSpent: { increment: amount.creditsSpentMilli } } });
    await tx.aiCreditReservation.delete({ where: { id: held.id } });
    await tx.aiUsageTransaction.create({ data: { userId: held.userId, actionId: input.actionId, feature: input.feature, primaryModel: input.model, ...amount, providerCostNanoUsd: amount.providerCostNanoUsd, creditsChargedMilli: amount.creditsSpentMilli, includedCreditsSpentMilli: included, bonusCreditsSpentMilli: bonus, purchasedCreditsSpentMilli: purchased, providerCallCount: input.providerCallCount ?? 1, pricingVersion: PRICING_VERSION, usageDetails: input.usageDetails as Prisma.InputJsonValue | undefined } });
    return { creditsSpentMilli: amount.creditsSpentMilli };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

type OpenAiResponsePayload = { usage?: OpenAiUsage; [key: string]: unknown };

/**
 * Единственная точка для новых вызовов Responses API: точный preflight, атомарный
 * reserve и settlement по provider usage. Внешнему коду возвращается только
 * стоимость в кредитах, provider cost остаётся в ledger.
 */
export async function executeBilledOpenAiResponse(input: {
  userId: string;
  actionId: string;
  taskId?: string;
  feature: AiFeature;
  apiKey: string;
  payload: Record<string, unknown> & { model: string };
}): Promise<{ response: OpenAiResponsePayload; billing: { creditsSpentMilli: number } }> {
  // Проверяем конфигурацию до любого сетевого запроса (fail closed).
  getOpenAiPricing(input.payload.model, 0);
  const maxOutputTokens = nonNegativeInteger(input.payload.max_output_tokens) || AI_OUTPUT_TOKEN_LIMITS[input.feature];
  const payload = { ...input.payload, max_output_tokens: maxOutputTokens };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` };
  const countResponse = await openAiFetch('https://api.openai.com/v1/responses/input_tokens', {
    method: 'POST', headers, body: JSON.stringify(payload)
  }, { requestId: `${input.actionId}:tokens`, model: payload.model });
  if (!countResponse.ok) throw new Error(`OpenAI input token count failed: ${countResponse.status}`);
  const counted = await countResponse.json() as { input_tokens?: number };
  const reservation = await reserveAiCredits({ userId: input.userId, actionId: input.actionId, model: payload.model, inputTokens: nonNegativeInteger(counted.input_tokens), maxOutputTokens });
  if (reservation.alreadySettled !== undefined) throw new Error(`AI action ${input.actionId} has already been billed`);
  try {
    const response = await openAiFetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers, body: JSON.stringify(payload)
    }, { requestId: input.actionId, model: payload.model });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const responsePayload = await response.json() as OpenAiResponsePayload;
    if (!responsePayload.usage) throw new Error('OpenAI response did not include billable usage');
    const billing = await settleAiReservation({ actionId: input.actionId, feature: input.feature, model: payload.model, usage: responsePayload.usage, usageDetails: [{ model: payload.model, usage: responsePayload.usage }] });
    const usage = calculateOpenAiBilling(payload.model, responsePayload.usage);
    const balance = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { aiIncludedCreditsMilli: true, aiBonusCreditsMilli: true, aiPurchasedCreditsMilli: true }
    });
    console.info('[AI billing] settled', {
      userId: input.userId,
      taskId: input.taskId,
      actionId: input.actionId,
      feature: input.feature,
      model: payload.model,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
      providerCostNanoUsd: usage.providerCostNanoUsd.toString(),
      creditsSpentMilli: billing.creditsSpentMilli,
      balanceAfterMilli: balance ? balance.aiIncludedCreditsMilli + balance.aiBonusCreditsMilli + balance.aiPurchasedCreditsMilli : null,
      pricingVersion: PRICING_VERSION
    });
    return { response: responsePayload, billing };
  } catch (error) {
    await releaseAiReservation(input.actionId);
    throw error;
  }
}
