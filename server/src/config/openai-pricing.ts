export const PRICING_VERSION = 'openai-2026-09-30';
export const NANO_USD_PER_MILLICREDIT = 600n;
export const LONG_CONTEXT_INPUT_THRESHOLD = 272_000;

export type OpenAiTokenRates = {
  inputNanoUsdPerMillion: bigint;
  cachedInputNanoUsdPerMillion: bigint;
  cacheWriteNanoUsdPerMillion?: bigint;
  outputNanoUsdPerMillion: bigint;
};

export type OpenAiModelPricing = {
  standard: OpenAiTokenRates;
  longContext?: OpenAiTokenRates;
};

const rate = (usdPerMillion: string) => {
  const [whole, fraction = ''] = usdPerMillion.split('.');
  return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0').slice(0, 9));
};

export const OPENAI_PRICING: Readonly<Record<string, OpenAiModelPricing>> = {
  'gpt-6-luna': {
    standard: { inputNanoUsdPerMillion: rate('0.10'), cachedInputNanoUsdPerMillion: rate('0.01'), cacheWriteNanoUsdPerMillion: rate('0.125'), outputNanoUsdPerMillion: rate('0.50') },
    longContext: { inputNanoUsdPerMillion: rate('0.20'), cachedInputNanoUsdPerMillion: rate('0.02'), cacheWriteNanoUsdPerMillion: rate('0.25'), outputNanoUsdPerMillion: rate('0.75') }
  },
  'gpt-6-sol': {
    standard: { inputNanoUsdPerMillion: rate('2.00'), cachedInputNanoUsdPerMillion: rate('0.20'), cacheWriteNanoUsdPerMillion: rate('2.50'), outputNanoUsdPerMillion: rate('10.00') },
    longContext: { inputNanoUsdPerMillion: rate('4.00'), cachedInputNanoUsdPerMillion: rate('0.40'), cacheWriteNanoUsdPerMillion: rate('5.00'), outputNanoUsdPerMillion: rate('15.00') }
  },
  'gpt-5.4-mini': { standard: { inputNanoUsdPerMillion: rate('0.75'), cachedInputNanoUsdPerMillion: rate('0.075'), outputNanoUsdPerMillion: rate('4.50') } },
  'gpt-5-mini': { standard: { inputNanoUsdPerMillion: rate('0.25'), cachedInputNanoUsdPerMillion: rate('0.025'), outputNanoUsdPerMillion: rate('2.00') } },
  'gpt-5-nano': { standard: { inputNanoUsdPerMillion: rate('0.05'), cachedInputNanoUsdPerMillion: rate('0.005'), outputNanoUsdPerMillion: rate('0.40') } }
};

export function getOpenAiPricing(model: string, inputTokens: number): OpenAiTokenRates {
  const pricing = OPENAI_PRICING[model.trim().toLowerCase()];
  if (!pricing) throw new Error(`AI billing pricing is not configured for model ${model}`);
  return inputTokens > LONG_CONTEXT_INPUT_THRESHOLD && pricing.longContext ? pricing.longContext : pricing.standard;
}
