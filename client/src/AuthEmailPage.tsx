import { useEffect, useState, type FormEvent } from 'react';
import { api } from './lib/api';

type Mode = 'verify' | 'reset' | 'forgot';
const params = new URLSearchParams(window.location.search);
const initialMode: Mode = params.get('mode') === 'verify' ? 'verify' : params.get('mode') === 'reset' ? 'reset' : 'forgot';
const initialToken = params.get('token') ?? '';

/** Separate public page. Visiting an email link never logs anyone in automatically. */
export default function AuthEmailPage() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [token] = useState(initialToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // Do not retain a bearer token in browser URL/history beyond initial navigation.
    if (initialToken) window.history.replaceState(window.history.state, '', '/auth/email?mode=' + initialMode);
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email.trim());
      } else if (mode === 'verify') {
        if (!token) throw new Error('Ссылка неполная. Запросите новое письмо в настройках профиля.');
        await api.verifyEmail(token);
      } else {
        if (!token) throw new Error('Ссылка неполная. Запросите новое письмо.');
        if (password.length < 8) throw new Error('Пароль должен содержать не менее 8 символов.');
        if (password !== repeatPassword) throw new Error('Пароли не совпадают.');
        await api.resetPassword(token, password);
        setPassword('');
        setRepeatPassword('');
      }
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось выполнить запрос.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <a href="/" className="mb-7 flex items-center gap-3 text-lg font-semibold text-white">
          <img src="/icon.png" alt="" className="h-10 w-10 rounded-lg" />
          Планировыч AI
        </a>
        <h1 className="mb-3 text-2xl font-semibold">
          {mode === 'forgot' ? 'Восстановление пароля' : mode === 'verify' ? 'Подтверждение почты' : 'Новый пароль'}
        </h1>
        {done ? (
          <div role="status" className="space-y-4 text-sm leading-6 text-emerald-200">
            <p>{mode === 'forgot'
              ? 'Если этот адрес привязан к подтверждённому аккаунту с паролем, мы отправим ссылку для восстановления. Проверьте также папку «Спам».'
              : mode === 'verify'
                ? 'Адрес успешно подтверждён. Теперь его можно использовать для входа и восстановления доступа.'
                : 'Пароль изменён. Для безопасности старые сессии завершены. Войдите с новым паролем.'}</p>
            <a href="/?auth=login" className="inline-block rounded-xl bg-sky-600 px-4 py-2 font-medium text-white">На страницу входа</a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'forgot' ? (
              <>
                <p className="text-sm leading-6 text-slate-300">Укажи подтверждённый email своего аккаунта. Если адрес существует, на него придёт одноразовая ссылка.</p>
                <label className="block text-sm">Электронная почта
                  <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-white" placeholder="name@example.com" />
                </label>
              </>
            ) : mode === 'verify' ? (
              <p className="text-sm leading-6 text-slate-300">Подтверди адрес электронной почты, чтобы использовать его для входа и восстановления доступа.</p>
            ) : (
              <>
                <p className="text-sm leading-6 text-slate-300">Придумай новый пароль длиной не менее восьми символов.</p>
                <label className="block text-sm">Новый пароль
                  <input type="password" minLength={8} maxLength={128} required autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-white" />
                </label>
                <label className="block text-sm">Повтори пароль
                  <input type="password" minLength={8} maxLength={128} required autoComplete="new-password"
                    value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-white" />
                </label>
              </>
            )}
            {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-sm text-rose-200">{error}</p>}
            <button disabled={busy} type="submit" className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {busy ? 'Выполняем…' : mode === 'forgot' ? 'Отправить ссылку' : mode === 'verify' ? 'Подтвердить email' : 'Сменить пароль'}
            </button>
            {mode === 'reset' && <button type="button" onClick={() => { setMode('forgot'); setError(''); }}
              className="w-full text-center text-sm text-sky-300 underline">Запросить новую ссылку</button>}
            <a href="/?auth=login" className="block text-center text-sm text-slate-400 underline">Вернуться ко входу</a>
          </form>
        )}
      </section>
    </main>
  );
}
