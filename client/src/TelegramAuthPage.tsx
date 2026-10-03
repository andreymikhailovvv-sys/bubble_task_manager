import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { api } from './lib/api';

type TelegramAuthWindow = Window & {
  Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void; close?: () => void } };
};

export default function TelegramAuthPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telegram = (window as TelegramAuthWindow).Telegram?.WebApp;
  const initData = telegram?.initData?.trim() ?? '';

  useEffect(() => {
    telegram?.ready?.();
    telegram?.expand?.();
  }, [telegram]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!initData) {
      setError('Откройте эту форму кнопкой «Войти» в Telegram-боте.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.loginTelegramWeb({ initData, login: login.trim(), password });
      setSuccess(true);
      setPassword('');
      window.setTimeout(() => telegram?.close?.(), 1400);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось войти. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="telegram-auth-page min-h-screen overflow-hidden px-4 py-6 text-slate-100 sm:flex sm:items-center sm:justify-center">
      <div className="telegram-auth-orb telegram-auth-orb-one" />
      <div className="telegram-auth-orb telegram-auth-orb-two" />
      <section className="telegram-auth-card relative mx-auto w-full max-w-md rounded-[2rem] border border-white/10 p-6 shadow-2xl sm:p-8" aria-labelledby="telegram-auth-title">
        <div className="mb-7 flex items-center gap-4">
          <div className="telegram-auth-logo grid h-14 w-14 shrink-0 place-items-center rounded-2xl">
            <LockKeyhole size={27} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Планировыч AI</p>
            <h1 id="telegram-auth-title" className="mt-1 text-2xl font-bold tracking-tight">Вход в аккаунт</h1>
          </div>
        </div>

        {success ? (
          <div className="py-10 text-center" role="status">
            <CheckCircle2 className="mx-auto text-emerald-400" size={58} />
            <h2 className="mt-5 text-xl font-semibold">Готово!</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">Аккаунт подключён к Telegram. Это окно сейчас закроется.</p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <p className="mb-5 text-sm leading-6 text-slate-300">Введите данные от веб-версии. Бот не увидит пароль в переписке.</p>
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              <span>Логин</span>
              <span className="telegram-auth-input flex items-center gap-3 rounded-2xl border px-4">
                <UserRound size={19} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input autoFocus autoComplete="username" required minLength={3} value={login} onChange={(event) => setLogin(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-base text-white outline-none placeholder:text-slate-500" placeholder="Ваш логин" />
              </span>
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-200">
              <span>Пароль</span>
              <span className="telegram-auth-input flex items-center gap-3 rounded-2xl border px-4">
                <KeyRound size={19} className="shrink-0 text-slate-400" aria-hidden="true" />
                <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="min-w-0 flex-1 bg-transparent py-3.5 text-base text-white outline-none placeholder:text-slate-500" placeholder="Введите пароль" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-lg p-1 text-slate-400 hover:text-white" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}>
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>
            {error ? <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">{error}</p> : null}
            <button type="submit" disabled={submitting} className="telegram-auth-submit flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold text-white shadow-lg disabled:cursor-wait disabled:opacity-70">
              {submitting ? <Loader2 size={19} className="animate-spin" /> : <LockKeyhole size={18} />}
              {submitting ? 'Проверяем…' : 'Безопасно войти'}
            </button>
            <div className="flex items-start gap-2.5 rounded-2xl bg-white/[0.04] px-4 py-3 text-xs leading-5 text-slate-400">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-400" />
              <span>Данные передаются по защищённому соединению, а пароль хранится на сервере только в виде криптографического хеша.</span>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
