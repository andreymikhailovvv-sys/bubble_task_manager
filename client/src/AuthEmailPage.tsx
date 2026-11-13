import { useEffect, useState, type FormEvent } from 'react';
import './auth-email.css';

type Mode = 'verify' | 'reset' | 'forgot';
const params = new URLSearchParams(window.location.search);
const initialMode: Mode = params.get('mode') === 'verify' ? 'verify' : params.get('mode') === 'reset' ? 'reset' : 'forgot';
const initialToken = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? params.get('token') ?? '';

/** Intentionally independent of the workspace's large shared API module and styles. */
async function accountRequest<T>(route: string, payload: object): Promise<T> {
  const response = await fetch('/api/auth/email/' + route, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const parsed = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(parsed?.error || 'Не удалось выполнить запрос. Повторите попытку.');
  }
  return response.json() as Promise<T>;
}

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
    // Link credentials must not remain in URL/history after opening the page.
    if (initialToken) window.history.replaceState(window.history.state, '', '/auth/email?mode=' + initialMode);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'forgot') {
        await accountRequest('forgot', { email: email.trim() });
      } else if (mode === 'verify') {
        if (!token) throw new Error('Ссылка неполная. Запросите новое письмо в настройках аккаунта.');
        await accountRequest('verify', { token });
      } else {
        if (!token) throw new Error('Ссылка неполная. Запросите новое письмо.');
        if (password.length < 8 || password.length > 128) throw new Error('Пароль должен содержать от 8 до 128 символов.');
        if (password !== repeatPassword) throw new Error('Пароли не совпадают.');
        await accountRequest('reset', { token, password });
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
    <main className="email-root">
      <section className="email-panel">
        <a href="/" className="email-brand"><span className="email-logo">✦</span> Планировыч AI</a>
        <h1>{mode === 'forgot' ? 'Восстановление пароля' : mode === 'verify' ? 'Подтверждение почты' : 'Новый пароль'}</h1>
        {done ? (
          <div role="status" className="email-success">
            <p>{mode === 'forgot'
              ? 'Если подтверждённый адрес найден, письмо с инструкцией отправлено. Проверьте также папку «Спам».'
              : mode === 'verify'
                ? 'Адрес подтверждён. Теперь его можно использовать для входа и восстановления доступа.'
                : 'Пароль изменён. Все прежние сессии завершены. Войдите с новым паролем.'}</p>
            <a className="email-primary email-link" href="/?auth=login">Вернуться ко входу</a>
          </div>
        ) : (
          <form onSubmit={submit} className="email-form">
            {mode === 'forgot' ? (
              <>
                <p>Укажите подтверждённый адрес почты вашего аккаунта. На него придёт одноразовая ссылка.</p>
                <label>Электронная почта
                  <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
                </label>
              </>
            ) : mode === 'verify' ? (
              <p>Нажмите кнопку, чтобы подтвердить адрес электронной почты. Ссылка используется только один раз.</p>
            ) : (
              <>
                <p>Придумайте новый пароль из 8–128 символов. Он должен отличаться от предыдущего.</p>
                <label>Новый пароль
                  <input type="password" minLength={8} maxLength={128} required autoComplete="new-password"
                    value={password} onChange={e => setPassword(e.target.value)} />
                </label>
                <label>Повторите пароль
                  <input type="password" minLength={8} maxLength={128} required autoComplete="new-password"
                    value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} />
                </label>
              </>
            )}
            {error && <p role="alert" className="email-error">{error}</p>}
            <button type="submit" disabled={busy} className="email-primary">
              {busy ? 'Выполняем…' : mode === 'forgot' ? 'Отправить ссылку' : mode === 'verify' ? 'Подтвердить email' : 'Сменить пароль'}
            </button>
            {mode === 'reset' && <button type="button" className="email-secondary" onClick={() => { setMode('forgot'); setError(''); }}>Запросить новую ссылку</button>}
            <a href="/?auth=login" className="email-secondary">Вернуться ко входу</a>
          </form>
        )}
      </section>
    </main>
  );
}
