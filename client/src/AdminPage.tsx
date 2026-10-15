import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type AdminBroadcastImage, type AdminBroadcastTarget, type AdminSubscriptionPlan, type AdminUser, type CreditUsageStatistics, type SubscriptionLinks } from './lib/api';
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
