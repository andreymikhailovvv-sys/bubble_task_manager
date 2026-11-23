import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError, type SubscriptionPlanKey, type SubscriptionPurchase } from './api';

export function useSubscriptionPurchase(options: {
  surface: 'web' | 'miniapp';
  onSucceeded: () => void | Promise<void>;
  openConfirmation: (url: string) => void;
}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [creatingPlanKey, setCreatingPlanKey] = useState<SubscriptionPlanKey | null>(null);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [isReceiptEmailRequired, setIsReceiptEmailRequired] = useState(false);
  const creating = useRef(false);
  const pollingStartedAt = useRef(0);
  const attemptRef = useRef<{ planKey: SubscriptionPlanKey; clientRequestId: string } | null>(null);

  const applyStatus = useCallback(async (purchase: SubscriptionPurchase) => {
    if (purchase.status === 'succeeded' && purchase.activated) {
      setPendingPurchaseId(null);
      setMessage('Оплата подтверждена. Подписка активирована.');
      await optionsRef.current.onSucceeded();
    } else if (purchase.status === 'canceled') {
      setPendingPurchaseId(null);
      setMessage('Платёж отменён или не завершён. Подписка не активирована.');
    } else setMessage('Ожидаем подтверждения оплаты. Если деньги списались, не оплачивайте повторно: сервер продолжит проверку.');
  }, []);

  const check = useCallback(async (purchaseId: string) => {
    try {
      const response = await api.getSubscriptionPurchaseStatus(purchaseId);
      await applyStatus(response.purchase);
    } catch (error) {
      setMessage('Не удалось проверить платёж. Если деньги списались, не оплачивайте повторно. Проверка продолжится на сервере.');
      throw error;
    }
  }, [applyStatus]);

  useEffect(() => {
    if (!pendingPurchaseId) return;
    if (!pollingStartedAt.current) pollingStartedAt.current = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - pollingStartedAt.current > 90_000) {
        window.clearInterval(timer);
        setMessage('Подтверждение задерживается. Если деньги списались, не оплачивайте повторно: сервер продолжит проверку.');
        return;
      }
      void check(pendingPurchaseId).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [check, pendingPurchaseId]);

  const createAttempt = useCallback(async (
    attempt: { planKey: SubscriptionPlanKey; clientRequestId: string }, email?: string
  ) => {
    if (creating.current) return;
    creating.current = true;
    setCreatingPlanKey(attempt.planKey);
    setMessage(null);
    try {
      const result = await api.createSubscriptionPurchase({
        ...attempt, clientSurface: optionsRef.current.surface,
        ...(email ? { receiptEmail: email } : {})
      });
      setIsReceiptEmailRequired(false);
      setPendingPurchaseId(result.purchaseId);
      pollingStartedAt.current = Date.now();
      if (result.status === 'succeeded') await check(result.purchaseId);
      else if (result.confirmationUrl) optionsRef.current.openConfirmation(result.confirmationUrl);
      else setMessage('Платёж создан, но ссылка на оплату пока не получена.');
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.code === 'RECEIPT_EMAIL_REQUIRED' || apiError.code === 'INVALID_RECEIPT_EMAIL') {
        setIsReceiptEmailRequired(true);
        setMessage('Укажите email для получения чека.');
      } else setMessage(apiError.code === 'PAYMENT_ACCOUNT_REQUIRED'
        ? 'Для покупки подписки войдите или зарегистрируйтесь.'
        : apiError.message);
    } finally { creating.current = false; setCreatingPlanKey(null); }
  }, [check]);

  const start = useCallback(async (planKey: SubscriptionPlanKey) => {
    const attempt = { planKey, clientRequestId: crypto.randomUUID() };
    attemptRef.current = attempt;
    setIsReceiptEmailRequired(false);
    await createAttempt(attempt);
  }, [createAttempt]);

  const retryWithReceiptEmail = useCallback(async () => {
    if (attemptRef.current) await createAttempt(attemptRef.current, receiptEmail.trim());
  }, [createAttempt, receiptEmail]);

  return { creatingPlanKey, pendingPurchaseId, setPendingPurchaseId, message, setMessage, check,
    start, receiptEmail, setReceiptEmail, isReceiptEmailRequired, retryWithReceiptEmail };
}
