const YOOKASSA_API_BASE = 'https://api.yookassa.ru/v3';
const REQUEST_TIMEOUT_MS = 15_000;

export type YooKassaPayment = {
  id: string;
  status: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  confirmation?: { confirmation_url?: string };
  metadata?: { purchase_id?: string; credit_pack_key?: string };
  recipient?: { account_id?: string };
};

export class YooKassaError extends Error {
  constructor(message: string, public readonly httpStatus?: number, public readonly providerCode?: string) {
    super(message);
    this.name = 'YooKassaError';
  }
}

export const isYooKassaConfigured = () => Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());

const credentials = () => {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) throw new YooKassaError('YooKassa is not configured');
  return { shopId, authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}` };
};

async function providerRequest(path: string, init: RequestInit): Promise<YooKassaPayment> {
  const { authorization } = credentials();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${YOOKASSA_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: authorization, 'Content-Type': 'application/json', ...init.headers }
    });
    if (!response.ok) {
      let code: string | undefined;
      try {
        const error = await response.json() as { code?: unknown; type?: unknown };
        code = typeof error.code === 'string' ? error.code : typeof error.type === 'string' ? error.type : undefined;
      } catch { /* Provider body is deliberately not retained. */ }
      throw new YooKassaError('YooKassa request failed', response.status, code);
    }
    return await response.json() as YooKassaPayment;
  } catch (error) {
    if (error instanceof YooKassaError) throw error;
    throw new YooKassaError(error instanceof Error && error.name === 'AbortError' ? 'YooKassa request timed out' : 'YooKassa request failed');
  } finally {
    clearTimeout(timeout);
  }
}

export const formatKopecks = (kopecks: number) => `${Math.floor(kopecks / 100)}.${String(kopecks % 100).padStart(2, '0')}`;

export const parseProviderAmountKopecks = (value: string | undefined): number | null => {
  if (!value || !/^\d+\.\d{2}$/.test(value)) return null;
  const [rubles, kopecks] = value.split('.');
  const result = Number(rubles) * 100 + Number(kopecks);
  return Number.isSafeInteger(result) ? result : null;
};

export const yookassaService = {
  createPayment(input: { amountKopecks: number; returnUrl: string; description: string; purchaseId: string; creditPackKey: string; idempotenceKey: string }) {
    return providerRequest('/payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': input.idempotenceKey },
      body: JSON.stringify({
        amount: { value: formatKopecks(input.amountKopecks), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: input.description,
        metadata: { purchase_id: input.purchaseId, credit_pack_key: input.creditPackKey }
      })
    });
  },
  getPayment(paymentId: string) {
    return providerRequest(`/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' });
  }
};
