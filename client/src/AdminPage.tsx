import { FormEvent, useState } from 'react';
import { api, type SubscriptionLinks } from './lib/api';

type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  aiCredits: number;
  aiCreditsPeriod: string;
  createdAt: string;
};

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

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
                  <div className="text-xs text-slate-400">Кредиты: {user.aiCredits}</div>
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
                </div>
                <form onSubmit={addCredits} className="mt-4 flex items-end gap-3">
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
