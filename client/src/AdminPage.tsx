import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, type AdminBroadcastImage, type AdminBroadcastTarget, type AdminSubscriptionPlan, type AdminUser, type CreditUsageStatistics, type SubscriptionLinks, type TelegramUserClientAuthStatus, type TelegramManualSendPreview, type TelegramManualSendStatus, type TelegramDraftTone, type TelegramPrivateDialog, type TelegramDialogHistory } from './lib/api';
import { CreditUsageStats } from './components/CreditUsageStats';

const BROADCAST_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BROADCAST_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const readBroadcastImage = (file: File): Promise<{ payload: AdminBroadcastImage; previewUrl: string }> => new Promise((resolve, reject) => {
  if (!BROADCAST_IMAGE_TYPES.has(file.type)) {
    reject(new Error('Для рассылки поддерживаются JPG, PNG и WEBP'));
    return;
  }
  if (file.size > BROADCAST_MAX_IMAGE_BYTES) {
    reject(new Error('Изображение должно быть не больше 8 МБ'));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    const contentBase64 = result.split(',')[1] ?? '';
    if (!contentBase64) {
      reject(new Error('Не удалось прочитать изображение'));
      return;
    }
    resolve({
      payload: { fileName: file.name, mimeType: file.type, contentBase64 },
      previewUrl: result
    });
  };
  reader.readAsDataURL(file);
});

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [creditsToAdd, setCreditsToAdd] = useState('10');
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [subscriptionLinks, setSubscriptionLinks] = useState<SubscriptionLinks>({ start: '', pro: '', max: '' });
  const [subscriptionLinksSaving, setSubscriptionLinksSaving] = useState(false);
  const [creditUsageStatistics, setCreditUsageStatistics] = useState<CreditUsageStatistics | null>(null);
  const [creditUsageLoading, setCreditUsageLoading] = useState(false);
  const [creditUsageError, setCreditUsageError] = useState<string | null>(null);
  const [creditUsageMonth, setCreditUsageMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [creditUsageExporting, setCreditUsageExporting] = useState(false);
  const [subscriptionUpdating, setSubscriptionUpdating] = useState(false);
  const [telegramPilotUpdating, setTelegramPilotUpdating] = useState(false);
  const [telegramAuth, setTelegramAuth] = useState<TelegramUserClientAuthStatus | null>(null);
  const [telegramPassword, setTelegramPassword] = useState('');
  const [telegramAuthBusy, setTelegramAuthBusy] = useState(false);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);
  const [telegramSendKind, setTelegramSendKind] = useState<'saved' | 'username'>('saved');
  const [telegramSendUsername, setTelegramSendUsername] = useState('');
  const [telegramSendText, setTelegramSendText] = useState('');
  const [telegramSendPreview, setTelegramSendPreview] = useState<TelegramManualSendPreview | null>(null);
  const [telegramSendStatus, setTelegramSendStatus] = useState<TelegramManualSendStatus | null>(null);
  const [telegramSendBusy, setTelegramSendBusy] = useState(false);
  const [telegramSendNotice, setTelegramSendNotice] = useState<string | null>(null);
  const [telegramSendError, setTelegramSendError] = useState<string | null>(null);
  const [telegramDraftInstructions, setTelegramDraftInstructions] = useState('');
  const [telegramDraftTone, setTelegramDraftTone] = useState<TelegramDraftTone>('neutral');
  const [telegramDraftText, setTelegramDraftText] = useState('');
  const [telegramDraftBusy, setTelegramDraftBusy] = useState(false);
  const [telegramDraftError, setTelegramDraftError] = useState<string | null>(null);
  const [telegramPrivateDialogs, setTelegramPrivateDialogs] = useState<TelegramPrivateDialog[] | null>(null);
  const [telegramPrivateDialogsLimited, setTelegramPrivateDialogsLimited] = useState(false);
  const [telegramSelectedDialogId, setTelegramSelectedDialogId] = useState<string | null>(null);
  const [telegramPrivateHistory, setTelegramPrivateHistory] = useState<TelegramDialogHistory | null>(null);
  const [telegramPrivateReadBusy, setTelegramPrivateReadBusy] = useState(false);
  const [telegramPrivateReadError, setTelegramPrivateReadError] = useState<string | null>(null);
  const selectedUserIdRef = useRef(selectedUserId);
  selectedUserIdRef.current = selectedUserId;
  const [broadcastTarget, setBroadcastTarget] = useState<AdminBroadcastTarget>('all');
  const [broadcastUserId, setBroadcastUserId] = useState('');
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastImage, setBroadcastImage] = useState<AdminBroadcastImage | null>(null);
  const [broadcastImagePreview, setBroadcastImagePreview] = useState<string | null>(null);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null);

  async function loadUsers(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const [response, linksResponse] = await Promise.all([api.adminGetUsers({ password }), api.getSubscriptionLinks()]);
      setUsers(response.users);
      setSubscriptionLinks(linksResponse.links);
      if (response.users.length > 0 && !selectedUserId) {
        setSelectedUserId(response.users[0].id);
      }
      if (!broadcastUserId) {
        setBroadcastUserId(response.users.find((user) => user.telegramLinked)?.id ?? response.users[0]?.id ?? '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  const telegramUsers = useMemo(() => users.filter((user) => user.telegramLinked), [users]);
  const broadcastAudienceCount = useMemo(() => {
    if (broadcastTarget === 'user') return telegramUsers.some((user) => user.id === broadcastUserId) ? 1 : 0;
    if (broadcastTarget === 'paid') return telegramUsers.filter((user) => user.subscriptionPlan !== 'free').length;
    if (broadcastTarget === 'free') return telegramUsers.filter((user) => user.subscriptionPlan === 'free').length;
    return telegramUsers.length;
  }, [broadcastTarget, broadcastUserId, telegramUsers]);

  useEffect(() => {
    if (!selectedUserId || !password) {
      setCreditUsageStatistics(null);
      return;
    }
    let cancelled = false;
    setCreditUsageLoading(true);
    setCreditUsageError(null);
    void api.adminGetCreditUsageStatistics({ password, userId: selectedUserId })
      .then((result) => {
        if (!cancelled) setCreditUsageStatistics(result.statistics);
      })
      .catch((error) => {
        if (!cancelled) setCreditUsageError(error instanceof Error ? error.message : 'Не удалось загрузить статистику');
      })
      .finally(() => {
        if (!cancelled) setCreditUsageLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedUserId, password]);

  async function exportCreditUsage() {
    if (!selectedUser) return;
    setCreditUsageExporting(true);
    setCreditUsageError(null);
    try {
      const result = await api.adminDownloadCreditUsageExcel({
        password,
        userId: selectedUser.id,
        month: creditUsageMonth
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setCreditUsageError(error instanceof Error ? error.message : 'Не удалось выгрузить статистику');
    } finally {
      setCreditUsageExporting(false);
    }
  }

  async function updateSubscriptionPlan(subscriptionPlan: AdminSubscriptionPlan) {
    if (!selectedUser) return;
    setSubscriptionUpdating(true);
    setError('');
    try {
      const result = await api.adminSetSubscriptionPlan({ password, userId: selectedUser.id, subscriptionPlan });
      setUsers((prev) => prev.map((user) => user.id === result.user.id ? { ...user, subscriptionPlan: result.user.subscriptionPlan } : user));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить тариф');
    } finally {
      setSubscriptionUpdating(false);
    }
  }

  useEffect(() => {
    setTelegramAuth(null);
    setTelegramPassword('');
    setTelegramAuthError(null);
    if (!selectedUserId || !password || !users.length) return;
    let cancelled = false;
    void api.adminTelegramUserClientStatus({ password, userId: selectedUserId })
      .then((value) => { if (!cancelled) setTelegramAuth(value); })
      .catch(() => { if (!cancelled) setTelegramAuth(null); });
    return () => { cancelled = true; };
  }, [selectedUserId, password, users.length]);

  useEffect(() => {
    if (!selectedUserId || !password || !telegramAuth || !['starting', 'qr', 'password_required', 'verifying_password'].includes(telegramAuth.status)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void api.adminTelegramUserClientStatus({ password, userId: selectedUserId })
        .then((value) => {
          if (cancelled) return;
          setTelegramAuth(value);
          if (value.connected) {
            setUsers((users) => users.map((user) => user.id === selectedUserId ? { ...user, telegramUserClientConnected: true } : user));
            setTelegramPassword('');
          }
        })
        .catch((error) => { if (!cancelled) setTelegramAuthError(error instanceof Error ? error.message : 'Ошибка проверки Telegram'); });
    }, 2500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedUserId, password, telegramAuth?.status, telegramAuth?.attemptId]);

  useEffect(() => {
    setTelegramSendPreview(null);
    setTelegramSendText('');
    setTelegramSendUsername('');
    setTelegramSendKind('saved');
    setTelegramSendNotice(null);
    setTelegramSendError(null);
    setTelegramSendStatus(null);
    setTelegramDraftInstructions('');
    setTelegramDraftTone('neutral');
    setTelegramDraftText('');
    setTelegramDraftError(null);
    setTelegramPrivateDialogs(null);
    setTelegramPrivateDialogsLimited(false);
    setTelegramSelectedDialogId(null);
    setTelegramPrivateHistory(null);
    setTelegramPrivateReadBusy(false);
    setTelegramPrivateReadError(null);
    if (!selectedUserId || !password) return;
    let cancelled = false;
    void api.adminTelegramManualSendStatus({ password, userId: selectedUserId })
      .then((result) => { if (!cancelled) setTelegramSendStatus(result); })
      .catch(() => { if (!cancelled) setTelegramSendStatus(null); });
    return () => { cancelled = true; };
  }, [selectedUserId, password]);

  async function generateTelegramAiDraft() {
    if (!selectedUserId || telegramDraftBusy || !telegramSendStatus?.aiDraftEnabled) return;
    const userId = selectedUserId;
    setTelegramDraftBusy(true);
    setTelegramDraftError(null);
    setTelegramDraftText('');
    try {
      const result = await api.adminTelegramAiDraft({
        password, userId, instructions: telegramDraftInstructions, tone: telegramDraftTone
      });
      if (selectedUserIdRef.current === userId) setTelegramDraftText(result.text);
    } catch (error) {
      if (selectedUserIdRef.current === userId) {
        setTelegramDraftError(error instanceof Error ? error.message : 'Не удалось подготовить сообщение');
      }
    } finally {
      setTelegramDraftBusy(false);
    }
  }

  async function loadTelegramPrivateDialogs() {
    if (!selectedUserId || telegramPrivateReadBusy || !telegramAuth?.readEnabled) return;
    const userId = selectedUserId;
    setTelegramPrivateReadBusy(true);
    setTelegramPrivateReadError(null);
    setTelegramPrivateHistory(null);
    setTelegramSelectedDialogId(null);
    setTelegramPrivateDialogs(null);
    try {
      const result = await api.adminTelegramPrivateDialogs({ password, userId });
      if (selectedUserIdRef.current === userId) {
        setTelegramPrivateDialogs(result.dialogs);
        setTelegramPrivateDialogsLimited(result.limited);
      }
    } catch (error) {
      if (selectedUserIdRef.current === userId) {
        setTelegramPrivateReadError(error instanceof Error ? error.message : 'Не удалось загрузить диалоги Telegram');
      }
    } finally {
      if (selectedUserIdRef.current === userId) setTelegramPrivateReadBusy(false);
    }
  }

  async function loadTelegramPrivateHistory() {
    if (!selectedUserId || !telegramSelectedDialogId || telegramPrivateReadBusy || !telegramAuth?.readEnabled) return;
    const userId = selectedUserId;
    const dialogId = telegramSelectedDialogId;
    setTelegramPrivateReadBusy(true);
    setTelegramPrivateReadError(null);
    setTelegramPrivateHistory(null);
    try {
      const result = await api.adminTelegramPrivateHistory({ password, userId, dialogId });
      if (selectedUserIdRef.current === userId) setTelegramPrivateHistory(result);
    } catch (error) {
      if (selectedUserIdRef.current === userId) {
        setTelegramPrivateReadError(error instanceof Error ? error.message : 'Не удалось прочитать переписку');
      }
    } finally {
      if (selectedUserIdRef.current === userId) setTelegramPrivateReadBusy(false);
    }
  }

  async function manualTelegramPreview() {
    if (!selectedUserId || telegramSendBusy) return;
    const userId = selectedUserId;
    setTelegramSendBusy(true);
    setTelegramSendNotice(null);
    setTelegramSendError(null);
    setTelegramSendPreview(null);
    try {
      const preview = await api.adminTelegramManualSendPreview({
        password, userId, recipientKind: telegramSendKind,
        username: telegramSendKind === 'username' ? telegramSendUsername : undefined,
        text: telegramSendText
      });
      if (userId === selectedUserId) setTelegramSendPreview(preview);
    } catch (error) {
      setTelegramSendError(error instanceof Error ? error.message : 'Не удалось проверить получателя');
    } finally {
      setTelegramSendBusy(false);
    }
  }

  async function manualTelegramConfirm() {
    if (!selectedUserId || !telegramSendPreview || telegramSendBusy) return;
    const userId = selectedUserId;
    const confirmationId = telegramSendPreview.confirmationId;
    setTelegramSendBusy(true);
    setTelegramSendPreview(null);
    setTelegramSendError(null);
    setTelegramSendNotice(null);
    try {
      await api.adminTelegramManualSendConfirm({ password, userId, confirmationId });
      if (userId === selectedUserId) {
        setTelegramSendNotice('Сообщение отправлено. Повторное подтверждение невозможно.');
        setTelegramSendText('');
      }
    } catch (error) {
      setTelegramSendError(error instanceof Error ? error.message : 'Не удалось подтвердить отправку');
    } finally {
      try {
        const status = await api.adminTelegramManualSendStatus({ password, userId });
        if (userId === selectedUserId) setTelegramSendStatus(status);
      } catch { /* keep last audit */ }
      setTelegramSendBusy(false);
    }
  }

  async function telegramAuthAction(action: 'start' | 'cancel' | 'disconnect' | 'password') {
    if (!selectedUserId || telegramAuthBusy) return;
    setTelegramAuthBusy(true);
    setTelegramAuthError(null);
    try {
      if (action === 'start') {
        await api.adminTelegramUserClientStart({ password, userId: selectedUserId });
      } else if (action === 'cancel' && telegramAuth?.attemptId) {
        await api.adminTelegramUserClientCancel({ password, userId: selectedUserId, attemptId: telegramAuth.attemptId });
      } else if (action === 'password' && telegramAuth?.attemptId) {
        await api.adminTelegramUserClientPassword({
          password, userId: selectedUserId, attemptId: telegramAuth.attemptId, telegramPassword
        });
        setTelegramPassword('');
      } else if (action === 'disconnect') {
        const result = await api.adminTelegramUserClientDisconnect({ password, userId: selectedUserId });
        setTelegramPrivateDialogs(null);
        setTelegramSelectedDialogId(null);
        setTelegramPrivateHistory(null);
        setUsers((users) => users.map((user) => user.id === selectedUserId ? { ...user, telegramUserClientConnected: false } : user));
        if (result.remoteLogout === 'failed') setTelegramAuthError('Локальная сессия удалена, но Telegram не подтвердил отзыв. Удалите сеанс Планировыча в Telegram → Настройки → Устройства.');
      }
      setTelegramAuth(await api.adminTelegramUserClientStatus({ password, userId: selectedUserId }));
    } catch (error) {
      setTelegramAuthError(error instanceof Error ? error.message : 'Не удалось выполнить операцию');
    } finally {
      setTelegramAuthBusy(false);
    }
  }

  async function updateTelegramPilot(pilotEnabled: boolean) {
    if (!selectedUser || telegramPilotUpdating) return;
    setTelegramPilotUpdating(true);
    setError('');
    try {
      const response = await api.adminSetTelegramUserClientPilot({ password, userId: selectedUser.id, pilotEnabled });
      if (!pilotEnabled) {
        setTelegramPrivateDialogs(null);
        setTelegramSelectedDialogId(null);
        setTelegramPrivateHistory(null);
      }
      setUsers((current) => current.map((user) => user.id === response.userId
        ? { ...user, telegramUserClientPilotEnabled: response.telegramUserClientPilotEnabled, telegramUserClientConnected: response.telegramUserClientConnected }
        : user));
      setTelegramAuth(await api.adminTelegramUserClientStatus({ password, userId: selectedUser.id }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось изменить доступ к Telegram');
    } finally {
      setTelegramPilotUpdating(false);
    }
  }

  async function handleBroadcastImage(file?: File) {
    setBroadcastStatus(null);
    if (!file) {
      setBroadcastImage(null);
      setBroadcastImagePreview(null);
      return;
    }
    try {
      const result = await readBroadcastImage(file);
      setBroadcastImage(result.payload);
      setBroadcastImagePreview(result.previewUrl);
    } catch (e) {
      setBroadcastImage(null);
      setBroadcastImagePreview(null);
      setBroadcastStatus(e instanceof Error ? e.message : 'Не удалось прикрепить изображение');
    }
  }

  async function sendBroadcast(event: FormEvent) {
    event.preventDefault();
    if (!broadcastText.trim() && !broadcastImage) {
      setBroadcastStatus('Введите текст или прикрепите изображение.');
      return;
    }
    if (broadcastTarget === 'user' && !broadcastUserId) {
      setBroadcastStatus('Выберите пользователя.');
      return;
    }
    setBroadcastSending(true);
    setBroadcastStatus(null);
    try {
      const result = await api.adminSendBroadcast({
        password,
        target: broadcastTarget,
        ...(broadcastTarget === 'user' ? { userId: broadcastUserId } : {}),
        text: broadcastText,
        image: broadcastImage
      });
      setBroadcastStatus(`Рассылка завершена: отправлено ${result.sent} из ${result.requested}${result.failed ? `, ошибок: ${result.failed}` : ''}.`);
    } catch (e) {
      setBroadcastStatus(e instanceof Error ? e.message : 'Не удалось выполнить рассылку');
    } finally {
      setBroadcastSending(false);
    }
  }

  async function addCredits(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser) return;
    const amount = Number(creditsToAdd);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError('Введите целое положительное число кредитов');
      return;
    }
    setError('');
    setUpdating(true);
    try {
      const result = await api.adminAddCredits({
        password,
        userId: selectedUser.id,
        creditsToAdd: amount
      });
      setUsers((prev) => prev.map((user) => (user.id === result.user.id ? { ...user, aiCredits: result.user.aiCredits } : user)));
      setCreditsToAdd('10');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить кредиты');
    } finally {
      setUpdating(false);
    }
  }


  async function saveSubscriptionLinks(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubscriptionLinksSaving(true);
    try {
      const result = await api.adminSaveSubscriptionLinks({ password, links: subscriptionLinks });
      setSubscriptionLinks(result.links);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить ссылки подписок');
    } finally {
      setSubscriptionLinksSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-4">
        <h1 className="text-2xl font-semibold">Админ-панель</h1>
        <p className="text-sm text-slate-300">Страница для ручного управления AI-кредитами пользователей.</p>

        <form onSubmit={loadUsers} className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            Пароль администратора
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 outline-none ring-cyan-400 focus:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Загрузка...' : 'Показать пользователей'}
          </button>
        </form>

        {error ? <div className="rounded-md border border-rose-500/60 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</div> : null}


        <form onSubmit={saveSubscriptionLinks} className="rounded-xl border border-fuchsia-400/25 bg-gradient-to-br from-slate-900/90 to-fuchsia-950/30 p-4 shadow-xl">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-fuchsia-100">Ссылки на оплату подписок</h2>
            <p className="text-xs text-slate-400">Настройте отдельную ссылку для кнопки «Купить подписку» в каждом тарифе.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {([
              ['start', 'Старт'],
              ['pro', 'Про'],
              ['max', 'Максимум']
            ] as const).map(([key, label]) => (
              <label key={key} className="text-sm text-slate-200">
                {label}
                <input
                  type="url"
                  placeholder="https://..."
                  value={subscriptionLinks[key]}
                  onChange={(event) => setSubscriptionLinks((prev) => ({ ...prev, [key]: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-fuchsia-400 focus:ring-2"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={subscriptionLinksSaving}
            className="mt-4 rounded-md bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {subscriptionLinksSaving ? 'Сохранение...' : 'Сохранить ссылки'}
          </button>
        </form>

        <form onSubmit={sendBroadcast} className="rounded-xl border border-cyan-400/25 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-cyan-950/25 p-4 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-cyan-100">Рассылка в Telegram-боте «Планировыч»</h2>
              <p className="mt-1 text-xs text-slate-400">Получат только пользователи, у которых подключён бот. Для платных/бесплатных сегментов используется тариф в карточке пользователя.</p>
            </div>
            <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              Получателей: {broadcastAudienceCount}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-200">
              Аудитория
              <select value={broadcastTarget} onChange={(event) => setBroadcastTarget(event.target.value as AdminBroadcastTarget)} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2">
                <option value="all">Все пользователи бота</option>
                <option value="paid">Владельцы платных подписок</option>
                <option value="free">Пользователи без подписки</option>
                <option value="user">Конкретный пользователь</option>
              </select>
            </label>
            {broadcastTarget === 'user' ? (
              <label className="text-sm text-slate-200">
                Пользователь
                <select value={broadcastUserId} onChange={(event) => setBroadcastUserId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2">
                  <option value="">Выберите пользователя</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id} disabled={!user.telegramLinked}>
                      {user.name || user.username || user.email || user.id}{user.telegramLinked ? '' : ' · бот не подключён'}
                    </option>
                  ))}
                </select>
              </label>
            ) : <div className="rounded-lg border border-slate-700 bg-slate-950/45 p-3 text-xs leading-relaxed text-slate-400">Массовая рассылка выполняется последовательно, чтобы не упираться в лимиты Telegram.</div>}
          </div>

          <label className="mt-3 block text-sm text-slate-200">
            Сообщение
            <textarea value={broadcastText} onChange={(event) => setBroadcastText(event.target.value)} rows={6} placeholder="Текст сообщения. Можно использовать **жирное выделение**." className="mt-1 w-full resize-y rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm leading-relaxed outline-none ring-cyan-400 focus:ring-2" />
          </label>

          <div className="mt-3 flex flex-wrap items-start gap-3">
            <label className="cursor-pointer rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:border-cyan-400">
              Прикрепить изображение
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleBroadcastImage(event.target.files?.[0])} />
            </label>
            {broadcastImage ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/55 p-2">
                {broadcastImagePreview ? <img src={broadcastImagePreview} alt="" className="h-14 w-14 rounded-md object-cover" /> : null}
                <div className="max-w-[240px]">
                  <div className="truncate text-xs font-medium text-slate-200">{broadcastImage.fileName}</div>
                  <button type="button" className="mt-1 text-xs text-rose-300 underline" onClick={() => void handleBroadcastImage()}>Убрать</button>
                </div>
              </div>
            ) : <span className="self-center text-xs text-slate-500">JPG, PNG или WEBP, до 8 МБ</span>}
          </div>

          {broadcastStatus ? <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/55 p-3 text-sm text-slate-200">{broadcastStatus}</div> : null}

          <button type="submit" disabled={broadcastSending || broadcastAudienceCount === 0} className="mt-4 rounded-md bg-gradient-to-r from-cyan-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:from-cyan-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
            {broadcastSending ? 'Отправка…' : `Отправить рассылку · ${broadcastAudienceCount}`}
          </button>
        </form>

        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
            <h2 className="mb-2 text-sm font-medium text-slate-300">Пользователи ({users.length})</h2>
            <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    selectedUserId === user.id
                      ? 'border-cyan-400 bg-cyan-500/15'
                      : 'border-slate-700 bg-slate-800/60 hover:border-slate-500'
                  }`}
                >
                  <div className="font-medium">{user.name || user.username || user.email || 'Без имени'}</div>
                  <div className="text-xs text-slate-400">Кредиты: {user.aiCredits} · тариф: {user.subscriptionPlan === 'free' ? 'без подписки' : user.subscriptionPlan.toUpperCase()}</div>
                  <div className={`mt-0.5 text-[11px] ${user.telegramLinked ? 'text-emerald-400' : 'text-slate-500'}`}>{user.telegramLinked ? 'Telegram подключён' : 'Telegram не подключён'}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            {selectedUser ? (
              <>
                <h2 className="text-lg font-semibold">Пользователь</h2>
                <div className="mt-2 space-y-1 text-sm text-slate-200">
                  <div>ID: {selectedUser.id}</div>
                  <div>Имя: {selectedUser.name || '—'}</div>
                  <div>Логин: {selectedUser.username || '—'}</div>
                  <div>Email: {selectedUser.email || '—'}</div>
                  <div>Текущие кредиты: {selectedUser.aiCredits}</div>
                  <div>Telegram: {selectedUser.telegramLinked ? 'подключён' : 'не подключён'}</div>
                </div>
                <label className="mt-3 block max-w-xs text-sm text-slate-200">
                  Тариф для сегментации рассылок
                  <select value={selectedUser.subscriptionPlan} disabled={subscriptionUpdating} onChange={(event) => void updateSubscriptionPlan(event.target.value as AdminSubscriptionPlan)} className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring-2 disabled:opacity-60">
                    <option value="free">Без подписки</option>
                    <option value="start">Старт</option>
                    <option value="pro">Про</option>
                    <option value="max">Максимум</option>
                  </select>
                </label>
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                  <h3 className="text-sm font-semibold">Telegram-ассистент: закрытый пилот</h3>
                  <p className="mt-1 text-xs text-slate-400">Ручная отправка только после предпросмотра и отдельного подтверждения администратора. Переписка не читается, ИИ не имеет доступа к отправке.</p>
                  <p className="mt-2 text-xs text-slate-300">
                    Доступ: {selectedUser.telegramUserClientPilotEnabled ? 'разрешён' : 'закрыт'} ·
                    Сессия: {selectedUser.telegramUserClientConnected ? 'подключена' : 'не подключена'}
                  </p>
                  <button type="button" disabled={telegramPilotUpdating}
                    onClick={() => void updateTelegramPilot(!selectedUser.telegramUserClientPilotEnabled)}
                    className="mt-3 rounded-md border border-cyan-500/60 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                    {telegramPilotUpdating ? 'Сохранение…' : selectedUser.telegramUserClientPilotEnabled ? 'Закрыть доступ' : 'Разрешить пилот'}
                  </button>
                  {selectedUser.telegramUserClientPilotEnabled && (
                    <div className="mt-4 border-t border-slate-700 pt-3">
                      <p className="text-xs text-slate-400">
                        Для безопасности разрешено подключить только тот Telegram-аккаунт, который уже связан с ботом Планировыча у выбранного пользователя.
                      </p>
                      {!telegramAuth?.enabled && <p className="mt-2 text-xs text-amber-300">MTProto отключён на сервере. Для QR-подключения настройте переменные окружения Timeweb.</p>}
                      {telegramAuth?.connected ? (
                        <div className="mt-3">
                          <p className="text-sm text-emerald-300">Личный Telegram подключён.</p>
                          <div className="mt-4 rounded-lg border border-slate-600 bg-slate-950/50 p-3">
                            <h4 className="text-sm font-semibold text-slate-100">Личные переписки Telegram</h4>
                            <p className="mt-1 text-xs text-slate-400">
                              Только для владельца этого аккаунта Планировыча. Диалоги загружаются вручную, без текста последних сообщений.
                              История появится только после выбора собеседника и отдельного запроса. Данные не сохраняются в базе и не передаются ИИ.
                            </p>
                            {!telegramAuth?.readEnabled && (
                              <p className="mt-2 text-xs text-amber-300">
                                Чтение отключено. Для закрытого пилота добавьте TELEGRAM_USER_READ_ENABLED=true на Timeweb.
                              </p>
                            )}
                            <button type="button"
                              disabled={!telegramAuth?.readEnabled || telegramPrivateReadBusy}
                              onClick={() => void loadTelegramPrivateDialogs()}
                              className="mt-3 rounded border border-cyan-500/70 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-900/30 disabled:opacity-40">
                              {telegramPrivateReadBusy && telegramPrivateDialogs === null ? 'Загрузка…' : 'Показать личные чаты'}
                            </button>
                            {telegramPrivateDialogs && (
                              <div className="mt-3">
                                <p className="text-xs text-slate-400">
                                  Найдено личных чатов: {telegramPrivateDialogs.length}
                                  {telegramPrivateDialogsLimited ? ' (показана часть, максимум 60)' : ''}
                                </p>
                                {telegramPrivateDialogs.length === 0 && <p className="mt-2 text-xs text-slate-400">Доступных личных переписок нет.</p>}
                                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded border border-slate-700 p-2">
                                  {telegramPrivateDialogs.map((dialog) => (
                                    <button key={dialog.id} type="button" disabled={telegramPrivateReadBusy}
                                      aria-pressed={telegramSelectedDialogId === dialog.id}
                                      onClick={() => {
                                        setTelegramSelectedDialogId(dialog.id);
                                        setTelegramPrivateHistory(null);
                                        setTelegramPrivateReadError(null);
                                      }}
                                      className={`block w-full rounded px-3 py-2 text-left text-sm disabled:opacity-60 ${telegramSelectedDialogId === dialog.id ? 'bg-cyan-900/50 text-cyan-100' : 'bg-slate-800/50 text-slate-200 hover:bg-slate-700/60'}`}>
                                      <span className="block break-words font-medium">{dialog.name}</span>
                                      {dialog.username && <span className="block text-xs text-slate-400">{dialog.username}</span>}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {telegramSelectedDialogId && (
                              <div className="mt-3">
                                <p className="text-xs text-slate-300">
                                  Выбран чат: {telegramPrivateDialogs?.find((item) => item.id === telegramSelectedDialogId)?.name ?? 'Личный диалог'}
                                </p>
                                <button type="button" disabled={telegramPrivateReadBusy || !telegramAuth?.readEnabled}
                                  onClick={() => void loadTelegramPrivateHistory()}
                                  className="mt-2 rounded bg-cyan-700 px-3 py-2 text-sm text-white hover:bg-cyan-600 disabled:opacity-40">
                                  {telegramPrivateReadBusy ? 'Загрузка сообщений…' : 'Прочитать последние 30 сообщений'}
                                </button>
                              </div>
                            )}
                            {telegramPrivateHistory && telegramSelectedDialogId === telegramPrivateHistory.dialog.id && (
                              <div className="mt-3 rounded border border-slate-700 bg-slate-900/70 p-3">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <h5 className="text-xs font-semibold text-slate-200">
                                    История с {telegramPrivateHistory.dialog.name} ({telegramPrivateHistory.messages.length} сообщений)
                                  </h5>
                                  <button type="button" onClick={() => setTelegramPrivateHistory(null)}
                                    className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300">Скрыть историю</button>
                                </div>
                                {telegramPrivateHistory.messages.length === 0 && (
                                  <p className="text-xs text-slate-400">В этом диалоге нет сообщений для отображения.</p>
                                )}
                                <div className="max-h-96 space-y-3 overflow-y-auto">
                                  {telegramPrivateHistory.messages.map((message) => (
                                    <div key={message.id}
                                      className={`rounded-lg border p-3 text-sm ${message.out ? 'border-cyan-700/40 bg-cyan-950/30' : 'border-slate-700 bg-slate-800/60'}`}>
                                      <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
                                        <span>{message.senderName}</span>
                                        <time>{message.date ? new Date(message.date * 1000).toLocaleString('ru-RU') : ''}</time>
                                      </div>
                                      <p className="whitespace-pre-wrap break-words text-slate-100">{message.text || (message.hasMedia ? '[Медиа без текстовой подписи]' : '[Служебное сообщение]')}</p>
                                      {message.hasMedia && <p className="mt-1 text-xs text-slate-400">Медиафайл не загружался</p>}
                                      {message.truncated && <p className="mt-1 text-xs text-amber-300">Длинный текст показан частично</p>}
                                    </div>
                                  ))}
                                </div>
                                <p className="mt-3 text-xs text-slate-400">История хранится только на этой странице. В ИИ-черновики она не подставляется.</p>
                              </div>
                            )}
                            {telegramPrivateReadError && <p role="alert" className="mt-2 text-xs text-rose-300">{telegramPrivateReadError}</p>}
                          </div>

                          <div className="mt-4 rounded-lg border border-slate-600 bg-slate-950/50 p-3">
                            <h4 className="text-sm font-semibold text-slate-100">Тестовая ручная отправка</h4>
                            <p className="mt-1 text-xs text-slate-400">Отправка возможна только из этой админ-панели. Не более 3 попыток за 10 минут и 12 за сутки, пауза минимум 20 секунд. Никаких рассылок и самостоятельных действий ИИ.</p>
                            {telegramSendStatus?.enabled === false && (
                              <p className="mt-2 text-xs text-amber-300">Отправка выключена. Для проверки установите TELEGRAM_USER_SEND_ENABLED=true в Timeweb и выполните деплой.</p>
                            )}
                            <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-950/15 p-3">
                              <h5 className="text-sm font-semibold text-violet-200">ИИ-помощник: подготовить сообщение</h5>
                              <p className="mt-1 text-xs text-slate-400">ИИ создаёт только текст, не видит переписки и не может отправлять сообщения. Описание задачи передаётся OpenAI. Отправка по-прежнему требует отдельной проверки получателя и подтверждения.</p>
                              {!telegramSendStatus?.aiDraftEnabled && (
                                <p className="mt-2 text-xs text-amber-300">ИИ-черновики отключены. В Timeweb установите TELEGRAM_USER_AI_DRAFT_ENABLED=true и выполните деплой.</p>
                              )}
                              <label className="mt-3 block text-xs text-slate-300">Что нужно написать
                                <textarea value={telegramDraftInstructions} maxLength={2500} rows={3}
                                  onChange={(e) => { setTelegramDraftInstructions(e.target.value); setTelegramDraftText(''); setTelegramDraftError(null); }}
                                  placeholder="Напиши коротко и вежливо, что я смогу прислать документы завтра после обеда…"
                                  className="mt-1 block w-full resize-y rounded border border-slate-600 bg-slate-900 p-2 text-sm text-white" />
                              </label>
                              <label className="mt-3 block text-xs text-slate-300">Стиль
                                <select value={telegramDraftTone}
                                  onChange={(e) => { setTelegramDraftTone(e.target.value as TelegramDraftTone); setTelegramDraftText(''); }}
                                  className="mt-1 block rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white">
                                  <option value="neutral">Нейтральный</option>
                                  <option value="friendly">Дружелюбный</option>
                                  <option value="formal">Деловой</option>
                                </select>
                              </label>
                              <button type="button" disabled={telegramDraftBusy || !telegramSendStatus?.aiDraftEnabled || !telegramDraftInstructions.trim()}
                                onClick={() => void generateTelegramAiDraft()}
                                className="mt-3 rounded bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-40">
                                {telegramDraftBusy ? 'Готовим текст…' : 'Составить черновик с ИИ'}
                              </button>
                              {telegramDraftText && (
                                <div className="mt-3 border-t border-slate-700 pt-3">
                                  <label className="block text-xs text-slate-300">Черновик ИИ, можно отредактировать
                                    <textarea value={telegramDraftText} rows={4} maxLength={1000}
                                      onChange={(e) => setTelegramDraftText(e.target.value)}
                                      className="mt-1 block w-full resize-y rounded border border-violet-600/50 bg-slate-950 p-2 text-sm text-white" />
                                  </label>
                                  <button type="button" disabled={telegramSendBusy || !telegramDraftText.trim()}
                                    onClick={() => { setTelegramSendText(telegramDraftText); setTelegramSendPreview(null); setTelegramSendNotice(null); }}
                                    className="mt-2 rounded border border-violet-400/70 px-3 py-2 text-sm text-violet-100 hover:bg-violet-700/20 disabled:opacity-40">
                                    Использовать текст для отправки
                                  </button>
                                  <p className="mt-2 text-xs text-slate-400">Перенос текста не отправляет сообщение. После переноса отдельно проверьте получателя и подтвердите отправку.</p>
                                </div>
                              )}
                              {telegramDraftError && <p role="alert" className="mt-2 text-xs text-rose-300">{telegramDraftError}</p>}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-200">
                              <label className="flex items-center gap-2">
                                <input type="radio" checked={telegramSendKind === 'saved'} onChange={() => { setTelegramSendKind('saved'); setTelegramSendPreview(null); }} />
                                В «Избранное»
                              </label>
                              <label className="flex items-center gap-2">
                                <input type="radio" checked={telegramSendKind === 'username'} onChange={() => { setTelegramSendKind('username'); setTelegramSendPreview(null); }} />
                                По @username
                              </label>
                            </div>
                            {telegramSendKind === 'username' && (
                              <label className="mt-3 block text-xs text-slate-300">Получатель (только личный пользователь, не группа и не бот)
                                <input type="text" autoComplete="off" value={telegramSendUsername}
                                  onChange={(event) => { setTelegramSendUsername(event.target.value); setTelegramSendPreview(null); }}
                                  placeholder="@username" maxLength={33}
                                  className="mt-1 block w-full max-w-md rounded border border-slate-600 bg-slate-900 p-2 text-sm text-white" />
                              </label>
                            )}
                            <label className="mt-3 block text-xs text-slate-300">Текст сообщения
                              <textarea value={telegramSendText} maxLength={1000} rows={3}
                                onChange={(event) => { setTelegramSendText(event.target.value); setTelegramSendPreview(null); }}
                                className="mt-1 block w-full resize-y rounded border border-slate-600 bg-slate-900 p-2 text-sm text-white" />
                            </label>
                            <button type="button" disabled={telegramSendBusy || !telegramSendStatus?.enabled || !telegramSendText.trim()}
                              onClick={() => void manualTelegramPreview()}
                              className="mt-3 rounded bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
                              {telegramSendBusy ? 'Проверка…' : 'Проверить получателя и текст'}
                            </button>
                            {telegramSendPreview && (
                              <div className="mt-3 rounded-lg border border-amber-500/60 bg-amber-950/30 p-3">
                                <p className="text-sm font-semibold text-amber-200">Подтверждение отправки</p>
                                <p className="mt-2 text-xs text-slate-200">Получатель: <strong>{telegramSendPreview.recipientName}</strong> (Telegram ID {telegramSendPreview.recipientId})</p>
                                <p className="mt-2 whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-sm text-white">{telegramSendPreview.text}</p>
                                <p className="mt-2 text-xs text-amber-200">Внимание: отправится от имени подключённого личного Telegram. Подтверждение одноразовое, действует 90 секунд.</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button type="button" disabled={telegramSendBusy || Date.now() >= telegramSendPreview.expiresAt}
                                    onClick={() => void manualTelegramConfirm()}
                                    className="rounded bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
                                    {telegramSendBusy ? 'Отправка…' : 'Подтверждаю, отправить'}
                                  </button>
                                  <button type="button" disabled={telegramSendBusy} onClick={() => setTelegramSendPreview(null)}
                                    className="rounded border border-slate-500 px-3 py-2 text-sm">Отмена</button>
                                </div>
                              </div>
                            )}
                            {telegramSendNotice && <p role="status" className="mt-2 text-xs text-emerald-300">{telegramSendNotice}</p>}
                            {telegramSendError && <p role="alert" className="mt-2 text-xs text-rose-300">{telegramSendError}</p>}
                            {telegramSendStatus && (
                              <div className="mt-4 border-t border-slate-700 pt-3">
                                <h5 className="text-xs font-semibold text-slate-200">Последние операции (без текстов сообщений)</h5>
                                {telegramSendStatus.audit.length === 0 && <p className="mt-1 text-xs text-slate-400">Отправок ещё не было.</p>}
                                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                                  {telegramSendStatus.audit.map((entry) => (
                                    <li key={entry.id}>
                                      {new Date(entry.createdAt).toLocaleString('ru-RU')}: {entry.recipientKind === 'saved' ? 'Избранное' : 'Личный контакт'}
                                      {' · '}{entry.result === 'SENT' ? 'Отправлено' : entry.result === 'FAILED' ? 'Не отправлено' : entry.result === 'UNKNOWN' ? 'Результат неизвестен' : 'Выполняется'}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          <button type="button" disabled={telegramAuthBusy} onClick={() => void telegramAuthAction('disconnect')}
                            className="mt-2 rounded-md border border-rose-500/60 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
                            Отключить личный Telegram
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3">
                          {(!telegramAuth || ['idle', 'failed', 'cancelled', 'connected'].includes(telegramAuth.status)) && (
                            <button type="button" disabled={telegramAuthBusy || !telegramAuth?.enabled}
                              onClick={() => void telegramAuthAction('start')}
                              className="rounded-md bg-cyan-600 px-3 py-2 text-sm text-white hover:bg-cyan-500 disabled:opacity-50">
                              Подключить Telegram через QR
                            </button>
                          )}
                          {telegramAuth?.status === 'qr' && telegramAuth.qrDataUrl && (
                            <div className="mt-3">
                              <img src={telegramAuth.qrDataUrl} alt="Одноразовый QR-код подключения Telegram" width={260} height={260} className="rounded-lg bg-white p-2" />
                              <p className="mt-2 text-xs text-slate-300">Telegram на телефоне → Настройки → Устройства → Подключить устройство. Отсканируйте QR и подтвердите вход.</p>
                            </div>
                          )}
                          {telegramAuth?.status === 'starting' && <p className="mt-2 text-xs text-slate-300">Запрос QR-кода у Telegram…</p>}
                          {telegramAuth?.status === 'verifying_password' && <p className="mt-2 text-xs text-slate-300">Проверка пароля 2FA…</p>}
                          {telegramAuth?.status === 'password_required' && (
                            <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void telegramAuthAction('password'); }}>
                              <label className="block text-xs text-slate-300">Пароль двухэтапной аутентификации Telegram
                                {telegramAuth.passwordHint ? ` (подсказка: ${telegramAuth.passwordHint})` : ''}
                                <input autoComplete="off" type="password" value={telegramPassword}
                                  onChange={(e) => setTelegramPassword(e.target.value)}
                                  className="mt-1 block w-full max-w-xs rounded-md border border-slate-600 bg-slate-950 p-2 text-sm" />
                              </label>
                              <button type="submit" disabled={telegramAuthBusy || !telegramPassword}
                                className="mt-2 rounded-md bg-cyan-600 px-3 py-2 text-sm disabled:opacity-50">Подтвердить пароль</button>
                            </form>
                          )}
                          {telegramAuth?.error && <p className="mt-2 text-xs text-amber-300">{telegramAuth.error}</p>}
                          {telegramAuth?.attemptId && ['starting', 'qr', 'password_required', 'verifying_password'].includes(telegramAuth.status) && (
                            <button type="button" disabled={telegramAuthBusy} onClick={() => void telegramAuthAction('cancel')}
                              className="mt-3 rounded-md border border-slate-500 px-3 py-2 text-xs disabled:opacity-50">Отменить подключение</button>
                          )}
                        </div>
                      )}
                      {telegramAuthError && <p role="alert" className="mt-2 text-xs text-rose-300">{telegramAuthError}</p>}
                    </div>
                  )}
                </div>
                <div className="mt-5 border-t border-slate-700 pt-4">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Траты AI-кредитов</h3>
                      <p className="mt-1 text-xs text-slate-400">Подтверждённые списания по моделям и ИИ-инструментам.</p>
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="text-xs text-slate-300">
                        Месяц выгрузки
                        <input type="month" value={creditUsageMonth} onChange={(event) => setCreditUsageMonth(event.target.value)} className="mt-1 block rounded-md border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm" />
                      </label>
                      <button type="button" disabled={creditUsageExporting || !creditUsageMonth} onClick={() => void exportCreditUsage()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
                        {creditUsageExporting ? 'Выгрузка…' : 'Выгрузить Excel'}
                      </button>
                    </div>
                  </div>
                  <CreditUsageStats statistics={creditUsageStatistics} loading={creditUsageLoading} error={creditUsageError} />
                </div>
                <form onSubmit={addCredits} className="mt-5 flex items-end gap-3 border-t border-slate-700 pt-4">
                  <label className="text-sm">
                    Добавить кредитов
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={creditsToAdd}
                      onChange={(event) => setCreditsToAdd(event.target.value)}
                      className="mt-1 w-40 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 outline-none ring-cyan-400 focus:ring-2"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={updating}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updating ? 'Сохранение...' : 'Начислить'}
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-slate-300">Выберите пользователя слева.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
