import { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, CheckCircle2, Loader2, Search } from 'lucide-react';
import { api, type TelegramSendTarget } from '../lib/api';
import type { TelegramReadDraft, TelegramReadApproval } from '../lib/types';
import './TelegramMessageQuickShare.css';
import './TelegramInlineSendCard.css';

type Props = {
  draft: TelegramReadDraft;
  onContinue: (permission: TelegramReadApproval) => Promise<void>;
};

export function TelegramReadConsentCard({ draft, onContinue }: Props) {
  const [chatId, setChatId] = useState(draft.chatId);
  const [chatName, setChatName] = useState(draft.chatName);
  const [count, setCount] = useState<10 | 20 | 30 | 50 | 100>(20);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [chats, setChats] = useState<TelegramSendTarget[]>([]);
  const [fetching, setFetching] = useState(false);
  const [working, setWorking] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const options = [10, 20, 30, 50, 100] as const;

  useEffect(() => {
    let active = true;
    if (!menu || chats.length) return;
    setFetching(true);
    void api.telegramChatSendTargets().then(result => {
      if (active) setChats(result.dialogs);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить чаты'); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [menu, chats.length]);

  const approve = async () => {
    if (!chatId || working || accepted) return;
    setWorking(true);
    setError('');
    try {
      await onContinue({ requestId: draft.requestId, chatId, count });
      setAccepted(true);
      setMenu(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать переписку');
    } finally { setWorking(false); }
  };
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  const visible = chats.filter(d => !needle || d.name.toLocaleLowerCase('ru-RU').includes(needle) ||
    (d.username || '').toLocaleLowerCase('ru-RU').includes(needle));

  return (
    <div className="telegram-quick-share telegram-ai-send-card mt-3 rounded-2xl border p-3 text-sm" data-telegram-read-card="true">
      <div className="flex items-center gap-2">
        <span className="telegram-ai-send-card__logo flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"><BookOpen size={17}/></span>
        <strong className="min-w-0 flex-1">Доступ к переписке Telegram</strong>
        {accepted && <CheckCircle2 size={17} className="text-emerald-500"/>}
      </div>
      <p className="telegram-ai-send-card__muted mt-2 text-xs">ИИ запрашивает доступ к переписке</p>
      <button type="button" disabled={working || accepted} aria-expanded={menu}
        onClick={() => setMenu(v => !v)}
        className="telegram-ai-send-card__recipient mt-1 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left font-semibold disabled:opacity-50">
        <span className="truncate">{chatName ?? `Выберите чат: ${draft.requestedChat}`}</span>
        <ChevronDown size={16}/>
      </button>
      {menu && !accepted && (
        <div className="telegram-ai-send-card__menu relative mt-2 rounded-xl border p-2">
          <label className="telegram-ai-send-card__search flex items-center gap-2 rounded-lg border px-3">
            <Search size={14}/><input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск человека или группы" aria-label="Выбрать Telegram-чат"
              className="telegram-ai-send-card__search-input min-w-0 w-full bg-transparent py-2.5 text-sm outline-none"/>
          </label>
          <div className="max-h-48 overflow-y-auto">
            {visible.map(chat => (
              <button type="button" key={chat.id}
                className="telegram-ai-send-card__option block w-full rounded-lg px-3 py-2 text-left"
                onClick={() => { setChatId(chat.id); setChatName(chat.name); setMenu(false); setError(''); }}>
                <span className="block truncate text-sm">{chat.name}</span>
                <span className="telegram-ai-send-card__muted block truncate text-xs">{chat.kind === 'user' ? 'Личная переписка' : 'Группа'}{chat.username ? ' · ' + chat.username : ''}</span>
              </button>
            ))}
            {fetching && <p className="telegram-ai-send-card__muted p-2 text-xs"><Loader2 size={13} className="mr-1 inline animate-spin"/>Загружаем чаты…</p>}
            {!fetching && chats.length > 0 && visible.length === 0 && <p className="telegram-ai-send-card__muted p-2 text-xs">Совпадений нет</p>}
          </div>
        </div>
      )}
      <label className="mt-3 block text-xs">
        <span className="telegram-ai-send-card__muted">Сколько последних сообщений разрешить ИИ?</span>
        <select value={count} onChange={e => setCount(Number(e.target.value) as typeof count)}
          disabled={working || accepted}
          className="telegram-ai-send-card__recipient mt-1 block w-full rounded-xl border px-3 py-2.5 text-sm font-semibold">
          {options.map(n => <option key={n} value={n}>{n} сообщений</option>)}
        </select>
      </label>
      <p className="telegram-ai-send-card__muted mt-3 text-xs leading-relaxed">
        Только после вашего разрешения выбранные сообщения этого чата будут переданы в OpenAI для продолжения текущего запроса.
        Без файлов и вложений. В группах могут быть сообщения других участников.
      </p>
      {error && <p role="alert" className="telegram-ai-send-card__error mt-2 text-xs">{error}</p>}
      {accepted ? <p role="status" className="telegram-ai-send-card__muted mt-3 text-xs">Доступ предоставлен однократно. ИИ продолжил выполнение запроса.</p>
        : <button type="button" disabled={!chatId || working} onClick={() => void approve()}
          className="telegram-ai-send-card__send mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50">
          {working && <Loader2 size={15} className="animate-spin"/>}
          {working ? 'Читаем и продолжаем запрос…' : 'Разрешить и продолжить'}
        </button>}
    </div>
  );
}
