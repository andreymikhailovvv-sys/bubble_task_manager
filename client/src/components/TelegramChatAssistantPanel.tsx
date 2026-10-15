import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, MessageCircle, RefreshCcw, Search, SendHorizontal, ShieldCheck, Sparkles, X } from 'lucide-react';
import {
  api, type TelegramAnalysisSnapshot, type TelegramChatCapability, type TelegramDialogAiResult,
  type TelegramDialogHistory, type TelegramDraftTone, type TelegramManualSendPreview, type TelegramPrivateDialog
} from '../lib/api';

type Props = { onClose: () => void };
type AsyncOperation = 'list' | 'history' | 'analyze' | 'preview' | 'send' | null;

const messageTime = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '';

export function TelegramChatAssistantPanel({ onClose }: Props) {
  // Deliberately ephemeral: no localStorage, App aiChatProjects, or persisted chat
  // messages. The normal AI chat cannot silently reuse this private transcript.
  const [capability, setCapability] = useState<TelegramChatCapability | null>(null);
  const [statusBusy, setStatusBusy] = useState(true);
  const [dialogs, setDialogs] = useState<TelegramPrivateDialog[]>([]);
  const [dialogsLoaded, setDialogsLoaded] = useState(false);
  const [dialogsLimited, setDialogsLimited] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TelegramPrivateDialog | null>(null);
  const [history, setHistory] = useState<TelegramDialogHistory | null>(null);
  const [consent, setConsent] = useState(false);
  const [goal, setGoal] = useState('');
  const [tone, setTone] = useState<TelegramDraftTone>('neutral');
  const [analysis, setAnalysis] = useState<TelegramDialogAiResult | null>(null);
  const [reply, setReply] = useState('');
  const [preview, setPreview] = useState<TelegramManualSendPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<AsyncOperation>(null);
  const currentDialog = useRef<string | null>(null);
  const operationRef = useRef<AsyncOperation>(null);

  useEffect(() => {
    let active = true;
    void api.telegramChatCapability().then((value) => {
      if (active) setCapability(value);
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'Не удалось проверить подключение Telegram');
    }).finally(() => { if (active) setStatusBusy(false); });
    return () => { active = false; };
  }, []);

  const run = async (type: NonNullable<AsyncOperation>, action: () => Promise<void>) => {
    if (operationRef.current) return;
    operationRef.current = type;
    setBusy(type);
    setError(null);
    setSuccess(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить действие'); }
    finally { operationRef.current = null; setBusy(null); }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ru-RU');
    if (!query) return dialogs;
    return dialogs.filter((d) => d.name.toLocaleLowerCase('ru-RU').includes(query) ||
      (d.username || '').toLocaleLowerCase('ru-RU').includes(query));
  }, [dialogs, search]);

  const forgetHistory = () => {
    setHistory(null);
    setConsent(false);
    setAnalysis(null);
    setReply('');
    setPreview(null);
  };

  const loadDialogs = () => void run('list', async () => {
    forgetHistory();
    setSelected(null);
    currentDialog.current = null;
    setDialogs([]);
    setDialogsLoaded(false);
    const result = await api.telegramChatDialogs();
    setDialogs(result.dialogs);
    setDialogsLimited(result.limited);
    setDialogsLoaded(true);
  });

  const selectDialog = (dialog: TelegramPrivateDialog) => {
    if (busy) return;
    currentDialog.current = dialog.id;
    setSelected(dialog);
    forgetHistory();
    setGoal('');
    setTone('neutral');
  };

  const loadHistory = () => {
    if (!selected || !capability?.readEnabled) return;
    const dialogId = selected.id;
    void run('history', async () => {
      forgetHistory();
      const result = await api.telegramChatHistory(dialogId);
      if (currentDialog.current === dialogId) setHistory(result);
    });
  };

  const analyze = () => {
    if (!selected || !history || !consent || !capability?.analyzeEnabled) return;
    const dialogId = selected.id;
    const snapshot = history.analysisSnapshot;
    const instruction = goal;
    const selectedTone = tone;
    setConsent(false);
    setAnalysis(null);
    setReply('');
    setPreview(null);
    void run('analyze', async () => {
      const result = await api.telegramChatAnalyze({
        dialogId, fingerprint: snapshot.fingerprint,
        consent: true, instruction, tone: selectedTone
      });
      if (currentDialog.current === dialogId) {
        setAnalysis(result);
        setReply(result.reply);
      }
    });
  };

  const prepareSend = () => {
    if (!selected?.username || !reply.trim() || !capability?.sendEnabled) return;
    const dialogId = selected.id;
    void run('preview', async () => {
      setPreview(null);
      const value = await api.telegramChatSendPreview({
        recipientKind: 'username', username: selected.username!, text: reply
      });
      // Verify preview bound to the exact selected peer, not merely the mutable
      // public username. No stale preview can be confirmed after dialog change.
      if (currentDialog.current !== dialogId || value.recipientId !== dialogId) {
        setPreview(null);
        throw new Error('Получатель Telegram не совпадает с выбранным диалогом. Отправка заблокирована');
      }
      setPreview(value);
    });
  };

  const confirmSend = () => {
    if (!preview || !selected || preview.recipientId !== selected.id ||
        preview.text !== reply || busy || !capability?.sendEnabled) return;
    const confirmationId = preview.confirmationId;
    setPreview(null); // never retry automatically, even for uncertain results
    void run('send', async () => {
      await api.telegramChatSendConfirm(confirmationId);
      setSuccess('Сообщение отправлено от вашего имени. Повторная отправка не выполнялась.');
      setReply('');
      setAnalysis(null);
      setHistory(null); // new history is required before another analysis
      setConsent(false);
    });
  };

  const snapshot: TelegramAnalysisSnapshot | null = history?.analysisSnapshot ?? null;
  const matchedDialog = Boolean(selected && history?.dialog.id === selected.id);
  const sendSupported = !!selected?.username && capability?.sendEnabled === true;

  return (
    <div className="fixed inset-0 z-[190] flex justify-end bg-slate-950/65" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Telegram в чате с ИИ"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-violet-300/30 bg-slate-950 text-slate-100 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/30"><MessageCircle size={19} /></span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">Telegram и ИИ</h3>
              <p className="text-xs text-slate-400">Личные переписки, только с вашего разрешения</p>
            </div>
          </div>
          <button type="button" aria-label="Закрыть Telegram" onClick={onClose}
            className="rounded-xl p-2 text-slate-300 hover:bg-white/10"><X size={19} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {statusBusy ? <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="animate-spin" size={16} /> Проверяем подключение...</p> : null}
          {!statusBusy && capability && !capability.connected ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 text-sm text-amber-100">
              Ваш личный Telegram пока не подключён к этому аккаунту или доступ к пилоту отключён. Сначала подключите его в настройках Планировыча.
            </div>
          ) : null}
          {capability?.connected && !capability.readEnabled ? (
            <p className="rounded-xl border border-amber-500/40 p-3 text-sm text-amber-200">Для этого аккаунта не включён просмотр Telegram.</p>
          ) : null}
          {capability?.readEnabled ? (
            <>
              <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-violet-200"><ShieldCheck size={17} /> Контроль за вами</p>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                  Можно найти собеседника, открыть до 30 сообщений и выбрать контекст для ИИ.
                  Текст не добавляется в историю обычного ИИ-чата и не сохраняется в Планировыче.
                  Анализ и отправка требуют отдельных действий.
                </p>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">1. Найти переписку</h4>
                  <button type="button" onClick={loadDialogs} disabled={!!busy}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-400/50 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-700/20 disabled:opacity-50">
                    {busy === 'list' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}
                    {dialogsLoaded ? 'Обновить список' : 'Показать чаты'}
                  </button>
                </div>
                {dialogsLoaded ? (
                  <>
                    <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3">
                      <Search size={16} className="text-slate-400" />
                      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Имя или @username" aria-label="Поиск личного чата"
                        className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-slate-500" />
                    </label>
                    <p className="mt-2 text-xs text-slate-400">{filtered.length} чатов {dialogsLimited ? '(доступна часть последних диалогов)' : ''}</p>
                    <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-700/70 p-2">
                      {filtered.length ? filtered.map((dialog) => (
                        <button type="button" key={dialog.id} disabled={!!busy} onClick={() => selectDialog(dialog)}
                          className={`block w-full rounded-xl px-3 py-2 text-left text-sm disabled:opacity-50 ${selected?.id === dialog.id ? 'bg-violet-700/40 text-white' : 'bg-slate-900 hover:bg-slate-800'}`}>
                          <span className="block truncate font-medium">{dialog.name}</span>
                          {dialog.username && <span className="block truncate text-xs text-slate-400">{dialog.username}</span>}
                        </button>
                      )) : <p className="px-2 py-3 text-xs text-slate-400">Совпадений нет. Проверьте имя или обновите список.</p>}
                    </div>
                  </>
                ) : null}
              </div>
              {selected ? (
                <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="min-w-0 truncate text-sm font-semibold">2. {selected.name}</h4>
                    <button type="button" onClick={() => { setSelected(null); currentDialog.current = null; forgetHistory(); }}
                      disabled={!!busy} aria-label="Вернуться к выбору собеседника"
                      className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-50"><ArrowLeft size={16} /></button>
                  </div>
                  <button type="button" onClick={loadHistory} disabled={!!busy}
                    className="mt-3 rounded-xl bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50">
                    {busy === 'history' ? 'Читаем историю…' : history ? 'Обновить последние 30 сообщений' : 'Прочитать последние 30 сообщений'}
                  </button>
                  {matchedDialog && history ? (
                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-700 p-2">
                      {history.messages.length ? history.messages.map((message) => (
                        <div key={message.id} className={`rounded-lg p-2 text-xs ${message.out ? 'bg-cyan-900/25' : 'bg-slate-800'}`}>
                          <div className="flex flex-wrap justify-between gap-1 text-[11px] text-slate-400">
                            <span>{message.out ? 'Вы' : selected.name}</span><span>{messageTime(message.date)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-slate-100">
                            {message.text || (message.hasMedia ? '[Вложение без текста]' : '[Нет текста]')}
                          </p>
                          {message.hasMedia && <p className="mt-1 text-slate-400">Вложение не загружено</p>}
                        </div>
                      )) : <p className="p-2 text-xs text-slate-400">В переписке нет сообщений.</p>}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {matchedDialog && snapshot ? (
                <div className="rounded-2xl border border-violet-500/40 bg-violet-950/10 p-3">
                  <h4 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} /> 3. Анализ с ИИ</h4>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    OpenAI получит только выбранные последние {snapshot.messageCount} сообщений, не более 1200 символов на сообщение,
                    без имён контактов и вложений. Просмотрите точный текст перед согласием.
                  </p>
                  <details className="mt-3 rounded-xl border border-slate-700 p-2">
                    <summary className="cursor-pointer text-xs font-semibold">Что именно получит ИИ ({snapshot.messageCount})</summary>
                    <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                      {snapshot.messages.map((m) => (
                        <div key={m.id} className="rounded-lg bg-slate-900 p-2 text-xs">
                          <p className="text-slate-400">{m.speaker} · {messageTime(m.date)}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words">{m.text || (m.hasMedia ? '[Вложение не передаётся]' : '[Нет текста]')}</p>
                          {m.truncated && <p className="text-amber-300">Текст сокращён для анализа</p>}
                        </div>
                      ))}
                    </div>
                  </details>
                  <label className="mt-3 block text-xs font-semibold">
                    Что нужно выяснить или написать
                    <textarea value={goal} maxLength={600} rows={2}
                      onChange={(e) => { setGoal(e.target.value); setConsent(false); setAnalysis(null); setReply(''); setPreview(null); }}
                      placeholder="Например: подведи итоги и предложи ответ на последний вопрос"
                      className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-normal text-white outline-none focus:border-violet-400" />
                  </label>
                  <label className="mt-2 block text-xs font-semibold">
                    Тон ответа
                    <select value={tone}
                      onChange={(e) => { setTone(e.target.value as TelegramDraftTone); setConsent(false); setAnalysis(null); setReply(''); setPreview(null); }}
                      className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-sm font-normal">
                      <option value="neutral">Нейтральный</option>
                      <option value="friendly">Дружелюбный</option>
                      <option value="formal">Деловой</option>
                    </select>
                  </label>
                  {!capability?.analyzeEnabled ? <p className="mt-3 text-xs text-amber-300">Подготовка ответов ИИ не включена для вашего аккаунта.</p> : null}
                  <label className="mt-3 flex items-start gap-2 text-xs leading-5">
                    <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>Я разрешаю передать показанные сообщения именно этого диалога в OpenAI для одного анализа.</span>
                  </label>
                  <button type="button" disabled={!!busy || !consent || !capability?.analyzeEnabled || !snapshot.messages.some((m) => m.text.trim())}
                    onClick={analyze}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">
                    {busy === 'analyze' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    Проанализировать и предложить ответ
                  </button>
                  {analysis ? (
                    <div className="mt-4 space-y-3 border-t border-slate-700 pt-3">
                      <div>
                        <p className="text-xs font-semibold text-violet-200">Итоги переписки</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{analysis.summary}</p>
                      </div>
                      <label className="block text-xs font-semibold">Предложенный ответ, можно отредактировать
                        <textarea value={reply} maxLength={1000} rows={4}
                          onChange={(e) => { setReply(e.target.value); setPreview(null); }}
                          className="mt-1 w-full resize-y rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm font-normal text-white outline-none focus:border-violet-400" />
                      </label>
                      {!selected?.username ? (
                        <p className="text-xs text-amber-200">
                          У собеседника нет публичного @username. Анализ доступен, а отправка через этот интерфейс пока невозможна.
                        </p>
                      ) : null}
                      <button type="button" disabled={!!busy || !reply.trim() || !sendSupported}
                        onClick={prepareSend}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/70 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-700/20 disabled:opacity-50">
                        <SendHorizontal size={15} /> Проверить адресата и текст перед отправкой
                      </button>
                    </div>
                  ) : null}
                  {preview && selected?.id === preview.recipientId && (
                    <div className="mt-3 rounded-xl border border-amber-400/60 bg-amber-950/20 p-3">
                      <p className="text-sm font-semibold text-amber-200">Последнее подтверждение</p>
                      <p className="mt-2 text-xs">Получатель: <strong>{preview.recipientName}</strong></p>
                      <p className="mt-1 break-all text-xs text-slate-300">Telegram ID: {preview.recipientId}</p>
                      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-sm">{preview.text}</p>
                      <p className="mt-2 text-xs text-amber-200">Сообщение отправится от вашего личного Telegram. Предпросмотр действителен 90 секунд.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={!!busy || Date.now() >= preview.expiresAt || preview.text !== reply}
                          onClick={confirmSend}
                          className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50">
                          {busy === 'send' ? 'Отправляем…' : 'Подтверждаю отправку'}
                        </button>
                        <button type="button" disabled={!!busy} onClick={() => setPreview(null)}
                          className="rounded-xl border border-slate-500 px-3 py-2 text-xs">Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
          {error && <p role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</p>}
          {success && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-950/20 p-3 text-sm text-emerald-100"><Check size={17} />{success}</p>}
        </div>
        <footer className="shrink-0 border-t border-white/10 bg-slate-900/80 px-4 py-3 text-xs leading-5 text-slate-400">
          Сообщения доступны только в этой панели до её закрытия. Отдельная история чата с ИИ их не сохраняет.
        </footer>
      </section>
    </div>
  );
}
