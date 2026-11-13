import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { announceAccountEmailVerified } from '../lib/account-email-status-events';

type Props = {
  open: boolean;
  email: string;
  initialNotice?: string;
  onClose: () => void;
  onVerified: () => void | Promise<void>;
};

/** Shared desktop / compact web activation, used after signup and from profile. */
export default function EmailVerificationDialog({ open, email, initialNotice, onClose, onVerified }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setCode('');
    setMessage(initialNotice ?? '');
    setError('');
  }, [open, email, initialNotice]);
  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError('');
    try {
      await api.verifyEmailCode(code);
      announceAccountEmailVerified();
      await onVerified();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось подтвердить код.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.requestEmailVerification();
      setMessage(result.status === 'SENT'
        ? 'Отправлено новое письмо с кодом и ссылкой. Старые код и ссылка больше не действуют.'
        : result.status === 'ALREADY_VERIFIED'
          ? 'Почта уже подтверждена.'
          : 'В аккаунте нет адреса, ожидающего подтверждения.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Письмо не отправлено.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.getMe();
      const confirmed = Boolean(result.user.emailVerified &&
        !result.user.pendingEmail && result.user.email?.toLowerCase() === email.toLowerCase());
      if (confirmed) await onVerified();
      else setMessage('Подтверждение пока не обнаружено. Если переходили по ссылке, завершите подтверждение в открывшейся вкладке.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось проверить статус.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[460] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="w-full max-w-md rounded-2xl border border-slate-600 bg-slate-900 p-5 text-slate-100 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="verify-email-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="verify-email-title" className="text-lg font-semibold">Подтверждение электронной почты</h2>
            <p className="mt-1 break-all text-sm text-slate-300">{email}</p>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-300 hover:bg-slate-700" onClick={onClose} disabled={busy} aria-label="Закрыть">✕</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Отправляем одно письмо с двумя вариантами: <strong>6-значный код</strong> или <strong>ссылка активации</strong>.
          Выберите удобный способ. Код действует 15 минут, ссылка 24 часа.
        </p>
        <form className="mt-4 space-y-3" onSubmit={event => { void submit(event); }}>
          <label className="block text-sm font-medium">Код из письма
            <input
              type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code"
              placeholder="000000" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-center text-xl tracking-[0.3em] text-white outline-none focus:border-sky-400"
            />
          </label>
          {message ? <p role="status" className="rounded-xl border border-sky-500/30 bg-sky-900/30 p-3 text-xs leading-5 text-sky-100">{message}</p> : null}
          {error ? <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-900/30 p-3 text-xs leading-5 text-rose-100">{error}</p> : null}
          <button type="submit" disabled={busy || code.length !== 6}
            className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Проверяем…' : 'Подтвердить по коду'}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs">
          <button type="button" onClick={() => void resend()} disabled={busy} className="text-sky-300 underline disabled:opacity-50">Отправить письмо ещё раз</button>
          <button type="button" onClick={() => void refresh()} disabled={busy} className="text-sky-300 underline disabled:opacity-50">Я перешёл по ссылке</button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">Ссылка находится в том же письме. После подтверждения код перестанет действовать, и наоборот.</p>
      </section>
    </div>
  );
}
