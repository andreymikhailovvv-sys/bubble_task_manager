// Token prices, transcription and hosted web_search pricing verified 2026-10-06.
export const OPENAI_PRICING_VERSION = 'openai-standard-transcription-and-web-search-2026-10-06';
export const OPENAI_WEB_SEARCH_COST_NANO_USD = 10_000_000n;

export type OpenAiTokenRates = {
  inputNanoUsdPerMillion: bigint;
  cachedInputNanoUsdPerMillion: bigint;
  cacheWriteNanoUsdPerMillion: bigint | null;
  outputNanoUsdPerMillion: bigint;
};

type OpenAiModelPricing = {
  short: OpenAiTokenRates;
  long?: OpenAiTokenRates;
};

export const OPENAI_LONG_CONTEXT_THRESHOLD = 272_000;

export const OPENAI_STANDARD_PRICING: Readonly<Record<string, OpenAiModelPricing>> = {
  'gpt-6-luna': {
    short: rates(0.10, 0.01, 0.125, 0.50),
    long: rates(0.20, 0.02, 0.25, 0.75)
  },
  'gpt-6-sol': {
    short: rates(2.00, 0.20, 2.50, 10.00),
    long: rates(4.00, 0.40, 5.00, 15.00)
  },
  'gpt-5.4-mini': { short: rates(0.75, 0.075, null, 4.50) },
  'gpt-5-mini': { short: rates(0.25, 0.025, null, 2.00) },
  'gpt-5-nano': { short: rates(0.05, 0.005, null, 0.40) },
  'gpt-4o-mini-transcribe': { short: rates(1.25, 1.25, null, 5.00) },
  'gpt-4o-transcribe': { short: rates(2.50, 2.50, null, 10.00) },
  'gpt-4o-transcribe-diarize': { short: rates(2.50, 2.50, null, 10.00) }
};

export const OPENAI_TRANSCRIPTION_DURATION_NANO_USD_PER_MINUTE: Readonly<Record<string, bigint>> = {
  'gpt-transcribe': 4_500_000n,
  'whisper-1': 6_000_000n
};

export function resolveOpenAiTranscriptionDurationRate(model: string): bigint | null {
  const normalizedModel = model.trim().toLowerCase();
  const modelName = Object.keys(OPENAI_TRANSCRIPTION_DURATION_NANO_USD_PER_MINUTE)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalizedModel === candidate || normalizedModel.startsWith(`${candidate}-`));
  return modelName ? OPENAI_TRANSCRIPTION_DURATION_NANO_USD_PER_MINUTE[modelName] : null;
}

function rates(input: number, cachedInput: number, cacheWrite: number | null, output: number): OpenAiTokenRates {
  const toNanoUsd = (dollars: number) => BigInt(Math.round(dollars * 1_000_000_000));
  return {
    inputNanoUsdPerMillion: toNanoUsd(input),
    cachedInputNanoUsdPerMillion: toNanoUsd(cachedInput),
    cacheWriteNanoUsdPerMillion: cacheWrite === null ? null : toNanoUsd(cacheWrite),
    outputNanoUsdPerMillion: toNanoUsd(output)
  };
}

export function resolveOpenAiTokenRates(model: string, inputTokens: number): OpenAiTokenRates | null {
  const normalizedModel = model.trim().toLowerCase();
  const modelName = Object.keys(OPENAI_STANDARD_PRICING)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalizedModel === candidate || normalizedModel.startsWith(`${candidate}-`));
  if (!modelName) return null;

  const pricing = OPENAI_STANDARD_PRICING[modelName];
  return inputTokens > OPENAI_LONG_CONTEXT_THRESHOLD && pricing.long ? pricing.long : pricing.short;
}
