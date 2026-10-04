import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError, type CreditPackKey, type CreditPurchase } from './api';

export function useCreditPurchase(options: { surface: 'web' | 'miniapp'; onSucceeded: () => void | Promise<void>; openConfirmation: (url: string) => void }) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [creatingPackKey, setCreatingPackKey] = useState<CreditPackKey | null>(null);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [isReceiptEmailRequired, setIsReceiptEmailRequired] = useState(false);
  const pollingStartedAt = useRef(0);
  const creatingRef = useRef(false);
  const purchaseAttemptRef = useRef<{ packKey: CreditPackKey; clientRequestId: string } | null>(null);

  const applyStatus = useCallback(async (purchase: CreditPurchase) => {
    if (purchase.status === 'succeeded' && purchase.credited) {
      setPendingPurchaseId(null);
      setMessage('Оплата прошла. Кредиты начислены.');
      await optionsRef.current.onSucceeded();
    } else if (purchase.status === 'canceled') {
      setPendingPurchaseId(null);
      setMessage('Платёж отменён или не завершён.');
    } else setMessage('Платёж обрабатывается');
  }, []);

  const check = useCallback(async (purchaseId: string) => {
    const result = await api.getCreditPurchaseStatus(purchaseId);
    await applyStatus(result.purchase);
  }, [applyStatus]);

  useEffect(() => {
    if (!pendingPurchaseId) return;
    if (!pollingStartedAt.current) pollingStartedAt.current = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - pollingStartedAt.current > 90_000) {
        window.clearInterval(timer);
        return;
      }
      void check(pendingPurchaseId).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [check, pendingPurchaseId]);

  const createAttempt = useCallback(async (attempt: { packKey: CreditPackKey; clientRequestId: string }, email?: string) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreatingPackKey(attempt.packKey);
    setMessage(null);
    try {
      const result = await api.createCreditPurchase({ ...attempt, clientSurface: optionsRef.current.surface, ...(email ? { receiptEmail: email } : {}) });
      setIsReceiptEmailRequired(false);
      setPendingPurchaseId(result.purchaseId);
      pollingStartedAt.current = Date.now();
      if (result.status === 'succeeded') await check(result.purchaseId);
      else if (result.confirmationUrl) optionsRef.current.openConfirmation(result.confirmationUrl);
      else setMessage('Платёж создан, но ссылка оплаты пока недоступна.');
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === 'RECEIPT_EMAIL_REQUIRED' || apiError.code === 'INVALID_RECEIPT_EMAIL') {
        setIsReceiptEmailRequired(true);
        setMessage('Укажите email для получения чека.');
      } else setMessage(apiError.code === 'PAYMENT_ACCOUNT_REQUIRED' ? 'Для покупки кредитов войдите или зарегистрируйтесь.' : apiError.message);
    } finally { creatingRef.current = false; setCreatingPackKey(null); }
  }, [check]);

  const start = useCallback(async (packKey: CreditPackKey) => {
    const attempt = { packKey, clientRequestId: crypto.randomUUID() };
    purchaseAttemptRef.current = attempt;
    setIsReceiptEmailRequired(false);
    await createAttempt(attempt);
  }, [createAttempt]);

  const retryWithReceiptEmail = useCallback(async () => {
    if (!purchaseAttemptRef.current) return;
    await createAttempt(purchaseAttemptRef.current, receiptEmail.trim());
  }, [createAttempt, receiptEmail]);

  return { creatingPackKey, pendingPurchaseId, message, setMessage, start, check, setPendingPurchaseId, receiptEmail, setReceiptEmail, isReceiptEmailRequired, retryWithReceiptEmail };
}
