import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ChangeEvent, type CSSProperties } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BookOpen, Check, ChevronRight, CircleDollarSign, CreditCard, Landmark, LayoutDashboard, Loader2, MessageCircle, Paperclip, Mic, Pencil, Plus, Send, Settings2, Sparkles, Trash2, WalletCards, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import ModuleRail from './components/ModuleRail';
import { PlanikMascot } from './components/PlanikMascot';
import { EconomicAiProposalCard, type EconomicAiProposal } from './components/EconomicAiProposalCard';
import { askEconomicStream, ECONOMIC_ACCEPTED_FILE_TYPES, validateEconomicFiles, type EconomicAssistantStage } from './lib/economicAssistantStream';
// Load the existing Planik transcription dialog only when Economic chat opens.
const EconomicVoiceInput = lazy(() => import('./components/VoiceInputButton').then(m => ({ default: m.VoiceInputButton })));

import { loadThemePreference, resolveThemeMode } from './lib/autoTheme';
import { annuityEstimate, formatMinorRub as money, minorToRublesInput as inputMoney, rublesToMinor as parseMoney } from './lib/economicMoney';
import { formatCreditsSpent } from './lib/credits';
import './EconomicApp.css';

type Kind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'DEBT_BORROWED' | 'DEBT_LENT' | 'DEBT_REPAID' | 'DEBT_RETURNED';
type Section = 'overview' | 'accounts' | 'operations' | 'debts' | 'categories';
type Dialog = { kind: 'account' | 'operation' | 'debt' | 'loan' | 'category'; id?: string } | null;
type Account = { id: string; name: string; isPrimary: boolean; currency: string; openingBalanceMinor: string; balanceMinor: string };
type Operation = { id: string; kind: Kind; amountMinor: string; title: string; note: string | null; category: string | null; sourceAccountId: string; targetAccountId: string | null; occurredAt: string; debtId: string | null; debtPhase: string | null };
type Debt = { id: string; direction: 'OWE' | 'OWED_TO_ME'; counterparty: string; amountMinor: string; paidMinor: string; postedToAccount: boolean; accountId: string | null; dueAt: string | null; note: string | null; isClosed: boolean };
type Loan = { id: string; name: string; lender: string | null; principalMinor: string; paidMinor: string; monthlyPaymentOverrideMinor: string | null; paymentDate: string | null; remindersEnabled: boolean; annualRateBps: number; termMonths: number; startDate: string; isClosed: boolean };
type EconomicUser = { id: string; name: string | null; username: string | null; timeZone: string | null; telegramLinked: boolean };
type Category = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' };
type ChatMessage = { id: string; role: string; content: string; createdAt: string; creditsSpentMilli?: number; inputTokens?: number; outputTokens?: number; attachmentNames?: string[]; proposals?: EconomicAiProposal[] };
type Snapshot = {
  accounts: Account[]; recent: Operation[]; debts: Debt[]; loans: Loan[]; categories: Category[];
  assistantMessages: ChatMessage[];
  totals: { balanceMinor: string; monthIncomeMinor: string; monthExpenseMinor: string; operationCount: number };
};
const baseCategories: Record<'INCOME' | 'EXPENSE', string[]> = {
  INCOME: ['Зарплата', 'Подработка', 'Бизнес', 'Подарки', 'Проценты', 'Другое'],
  EXPENSE: ['Продукты', 'Кафе и рестораны', 'Транспорт', 'Жильё', 'Покупки', 'Здоровье', 'Развлечения', 'Путешествия', 'Образование', 'Другое']
};
const toDateInput = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Без даты';
const kindLabel: Record<Kind, string> = {
  INCOME: 'Доход', EXPENSE: 'Расход', TRANSFER: 'Перевод',
  DEBT_BORROWED: 'Получено в долг', DEBT_LENT: 'Выдано в долг',
  DEBT_REPAID: 'Погашение долга', DEBT_RETURNED: 'Вернули долг'
};
const creditKinds = new Set<Kind>(['INCOME', 'DEBT_BORROWED', 'DEBT_RETURNED']);
const debitKinds = new Set<Kind>(['EXPENSE', 'DEBT_LENT', 'DEBT_REPAID']);
const sectionTitles: Record<Section, string> = {
  overview: 'Обзор', accounts: 'Счета', operations: 'Операции', debts: 'Долги и кредиты', categories: 'Категории'
};
const nav: Array<{ section: Section; icon: typeof WalletCards }> = [
  { section: 'overview', icon: LayoutDashboard }, { section: 'accounts', icon: WalletCards },
  { section: 'operations', icon: ArrowRightLeft }, { section: 'debts', icon: BookOpen },
  { section: 'categories', icon: Settings2 }
];

async function economicRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/economic' + path, {
    method, credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос');
  return result;
}
const loanFigures = (loan: Loan) => annuityEstimate(loan);
const repaymentPercent = (paid: string, total: string) => {
  const amount = BigInt(paid), expected = BigInt(total);
  return expected <= 0n ? 0 : Math.min(100, Math.max(0, Number(amount * 1000n / expected) / 10));
};
function RepaymentProgress({ paid, total }: { paid: string; total: string }) {
  const percent = repaymentPercent(paid, total);
  return <div className="econ-payment-progress">
    <div className="econ-progress-caption"><span>Внесено {money(paid)} из {money(total)}</span><strong>{percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</strong></div>
    <div className="econ-progress-track" role="progressbar" aria-label="Прогресс погашения" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="econ-progress-fill" style={{ width: percent + '%' }} />
    </div>
  </div>;
}

function EconomicMascot({ onClick, active, busy, progress }: {
  onClick: () => void; active: boolean; busy: boolean; progress: string | null;
}) {
  return <button className={'econ-mascot ' + (active ? 'active' : '')}
    type="button" onClick={onClick}
    aria-label={active ? 'Закрыть помощника Экономыч AI' : 'Открыть помощника Экономыч AI'}
    aria-expanded={active} aria-controls="econ-assistant-dialog" title="Помощник Экономыч AI">
    <PlanikMascot variant="economic" size="launcher" busy={busy} progress={progress} />
    <span className="econ-mascot-pulse" aria-hidden="true" />
  </button>;
}

export default function EconomicApp({ mobile = false, embeddedInMiniApp = false, themeOverride, mobileSafeTop = 0, mobileSafeBottom = 0 }: {
  mobile?: boolean; embeddedInMiniApp?: boolean; themeOverride?: 'light' | 'dark'; mobileSafeTop?: number; mobileSafeBottom?: number;
}) {
  const [user, setUser] = useState<EconomicUser | null>(null);
  const [appearance, setAppearance] = useState<'light' | 'dark'>('dark');
  const effectiveAppearance = themeOverride ?? appearance;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantStage, setAssistantStage] = useState<EconomicAssistantStage | 'reading_files' | 'refreshing_finances' | null>(null);
  const [assistantError, setAssistantError] = useState('');
  const [assistantFiles, setAssistantFiles] = useState<File[]>([]);
  const [economicAutoApply, setEconomicAutoApply] = useState(false);
  // User's preference is stored on User.economicAiAutoApply, not browser
  // localStorage. Read it after opening and sync across all action chips.
  useEffect(() => {
    if(!assistantOpen)return;
    let alive=true;
    void fetch('/api/economic/assistant/preferences',{credentials:'include',cache:'no-store'})
      .then(async response=>{
        const data=await response.json() as {autoApply?:boolean};
        if(response.ok&&alive)setEconomicAutoApply(data.autoApply===true);
      }).catch(()=>undefined);
    return()=>{alive=false;};
  },[assistantOpen]);
  const changeEconomicAutoApply=async(next:boolean)=>{
    const response=await fetch('/api/economic/assistant/preferences',{
      method:'PUT',credentials:'include',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({autoApply:next})
    });
    const data=await response.json().catch(()=>({})) as {autoApply?:boolean;error?:string};
    if(!response.ok)throw new Error(data.error||'Не удалось сохранить настройку.');
    setEconomicAutoApply(data.autoApply===true);
  };
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const assistantFilePickerRef = useRef<HTMLInputElement>(null);
  const assistantPendingRef = useRef(false);
  // Optimistic messages appear before network work, so scroll before browser
  // paint. Also keep the live stage and final reply visible at the bottom.
  useLayoutEffect(() => {
    if (!assistantOpen) return;
    const node = assistantScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [assistantOpen, snapshot?.assistantMessages.length, assistantBusy, assistantStage, assistantError]);
  // Native Android pager keeps WebView warm while other tabs are open.
  // Re-read finance when its tab becomes active, including proposals prepared
  // by the general AI voice widget while the finance tab was out of view.
  useEffect(() => {
    if(!user?.id)return;
    const activated=()=>{void refresh().catch(()=>undefined)};
    window.addEventListener('economic-activate',activated);
    return ()=>window.removeEventListener('economic-activate',activated);
  },[user?.id,refresh]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySaving, setNewCategorySaving] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshot(await economicRequest<Snapshot>('/snapshot'));
  }, []);
  useEffect(() => {
    let alive = true;
    document.title = 'Экономыч AI';
    void (async () => {
      try {
        const [response, data] = await Promise.all([
          economicRequest<{ user: EconomicUser }>('/session'),
          economicRequest<Snapshot>('/snapshot')
        ]);
        if (alive) { setUser(response.user); setSnapshot(data); }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Сервис недоступен');
      } finally {
        if (alive) {
          setLoading(false);
          window.requestAnimationFrame(() => document.getElementById('economic-boot-splash')?.remove());
        }
      }
    })();
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    const synchronize = () => {
      const saved = loadThemePreference(localStorage, 'btm:' + user.id + ':theme-mode');
      const timeZone = user.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
      setAppearance(resolveThemeMode(saved, timeZone, new Date()));
    };
    synchronize();
    const timer = window.setInterval(synchronize, 60_000);
    window.addEventListener('storage', synchronize);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', synchronize); };
  }, [user?.id, user?.timeZone]);
  // The user may connect the Telegram bot in another tab; refresh the
  // integration status without reloading the entire financial snapshot.
  useEffect(() => {
    if (!user?.id) return;
    const checkConnection = () => {
      void economicRequest<{ user: EconomicUser }>('/session')
        .then(result => { if (result.user.id === user.id) setUser(result.user); })
        .catch(() => undefined);
    };
    window.addEventListener('focus', checkConnection);
    return () => window.removeEventListener('focus', checkConnection);
  }, [user?.id]);

  const loadOperations = useCallback(async (append = false, cursor?: string | null) => {
    setOperationsBusy(true);
    try {
      const params = new URLSearchParams();
      if (kindFilter) params.set('kind', kindFilter);
      if (accountFilter) params.set('accountId', accountFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (append && cursor) params.set('cursor', cursor);
      const response = await economicRequest<{ operations: Operation[]; nextCursor: string | null }>('/operations?' + params.toString());
      setOperations(prev => append ? prev.concat(response.operations) : response.operations);
      setNextCursor(response.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось загрузить операции'); }
    finally { setOperationsBusy(false); }
  }, [kindFilter, accountFilter, categoryFilter]);
  useEffect(() => { if (section === 'operations' && snapshot) void loadOperations(); }, [section, snapshot?.totals.operationCount, kindFilter, accountFilter, categoryFilter]);

  const formSet = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const openDialog = (kind: NonNullable<Dialog>['kind'], item?: Account | Operation | Debt | Loan | Category) => {
    setError('');
    setNewCategoryOpen(false);
    setNewCategoryName('');
    const fields: Record<string, string> = {};
    if (kind === 'operation') {
      const op = item as Operation | undefined;
      fields.kind = op?.kind || 'EXPENSE';
      fields.title = op?.title || '';
      fields.amount = op ? inputMoney(op.amountMinor) : '';
      fields.category = op?.category || '';
      fields.sourceAccountId = op?.sourceAccountId || snapshot?.accounts.find(a => a.isPrimary)?.id || snapshot?.accounts[0]?.id || '';
      fields.targetAccountId = op?.targetAccountId || '';
      fields.note = op?.note || '';
      fields.date = toDateInput(op?.occurredAt);
    } else if (kind === 'account') {
      const account = item as Account | undefined;
      fields.name = account?.name || '';
      fields.balance = account ? inputMoney(account.balanceMinor) : '0';
      fields.isPrimary = account?.isPrimary ? 'yes' : 'no';
    } else if (kind === 'debt') {
      const debt = item as Debt | undefined;
      fields.direction = debt?.direction || 'OWE'; fields.counterparty = debt?.counterparty || '';
      fields.amount = debt ? inputMoney(debt.amountMinor) : ''; fields.note = debt?.note || '';
      fields.date = debt?.dueAt ? toDateInput(debt.dueAt) : ''; fields.isClosed = debt?.isClosed ? 'yes' : 'no';
      fields.paid = debt ? inputMoney(debt.paidMinor) : '0';
      fields.postedToAccount = debt ? (debt.postedToAccount ? 'yes' : 'no') : 'yes';
      fields.accountId = debt?.accountId || snapshot?.accounts.find(a => a.isPrimary)?.id || snapshot?.accounts[0]?.id || '';
    } else if (kind === 'loan') {
      const loan = item as Loan | undefined;
      fields.name = loan?.name || ''; fields.lender = loan?.lender || '';
      fields.amount = loan ? inputMoney(loan.principalMinor) : '';
      fields.rate = loan ? String(loan.annualRateBps / 100).replace('.', ',') : '';
      fields.months = loan ? String(loan.termMonths) : '12';
      fields.date = toDateInput(loan?.startDate); fields.isClosed = loan?.isClosed ? 'yes' : 'no';
      fields.paid = loan ? inputMoney(loan.paidMinor) : '0';
      fields.monthlyOverride = loan?.monthlyPaymentOverrideMinor ? inputMoney(loan.monthlyPaymentOverrideMinor) : '';
      fields.paymentDate = loan?.paymentDate ? toDateInput(loan.paymentDate) : '';
      fields.remindersEnabled = loan?.remindersEnabled ? 'yes' : 'no';
    } else { fields.kind = 'EXPENSE'; fields.name = ''; }
    setForm(fields);
    setDialog({ kind, id: item?.id });
  };
  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog) return;
    setSaving(true); setError('');
    try {
      const idPath = dialog.id ? '/' + encodeURIComponent(dialog.id) : '';
      let path = '', payload: Record<string, unknown> = {};
      if (dialog.kind === 'account') {
        path = '/accounts';
        payload = { name: form.name, balanceMinor: parseMoney(form.balance, true),
          ...(dialog.id && form.isPrimary === 'yes' ? { isPrimary: true } : {}) };
      } else if (dialog.kind === 'operation') {
        path = '/operations';
        payload = { kind: form.kind, title: form.title, amountMinor: parseMoney(form.amount),
          sourceAccountId: form.sourceAccountId, targetAccountId: form.kind === 'TRANSFER' ? form.targetAccountId : null,
          category: form.kind === 'TRANSFER' ? null : form.category, note: form.note || null,
          occurredAt: new Date(form.date + 'T12:00:00').toISOString() };
      } else if (dialog.kind === 'debt') {
        path = '/debts';
        payload = { direction: form.direction, counterparty: form.counterparty, amountMinor: parseMoney(form.amount),
          note: form.note || null, dueAt: form.date ? new Date(form.date + 'T12:00:00').toISOString() : null,
          paidMinor: parseMoney(form.paid || '0'), postedToAccount: form.postedToAccount === 'yes',
          accountId: form.postedToAccount === 'yes' ? form.accountId : null,
          ...(dialog.id ? { isClosed: form.isClosed === 'yes' } : {}) };
      } else if (dialog.kind === 'loan') {
        path = '/loans';
        const rate = Number((form.rate || '').replace(',', '.'));
        if (!Number.isFinite(rate) || rate < 0 || rate > 1000 || !/^\d+(?:[,.]\d{1,2})?$/.test(form.rate)) throw new Error('Ставка должна быть в процентах, максимум два знака после запятой');
        payload = { name: form.name, lender: form.lender || null, principalMinor: parseMoney(form.amount),
          annualRateBps: Math.round(rate * 100), termMonths: Number(form.months),
          startDate: new Date(form.date + 'T12:00:00').toISOString(),
          paidMinor: parseMoney(form.paid || '0'),
          monthlyPaymentOverrideMinor: form.monthlyOverride.trim() ? parseMoney(form.monthlyOverride) : null,
          paymentDate: form.paymentDate ? new Date(form.paymentDate + 'T12:00:00Z').toISOString() : null,
          remindersEnabled: form.remindersEnabled === 'yes',
          ...(dialog.id ? { isClosed: form.isClosed === 'yes' } : {}) };
      } else {
        path = '/categories'; payload = { kind: form.kind, name: form.name };
      }
      await economicRequest(path + idPath, dialog.id ? 'PATCH' : 'POST', payload);
      setDialog(null);
      await refresh();
      if (section === 'operations') await loadOperations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить'); }
    finally { setSaving(false); }
  };
  const createInlineCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !['INCOME', 'EXPENSE'].includes(form.kind || '')) {
      setError('Введите название категории'); return;
    }
    if (name.length > 60) { setError('Название категории слишком длинное'); return; }
    if (snapshot && [...baseCategories[form.kind as 'INCOME' | 'EXPENSE'],
        ...snapshot.categories.filter(x => x.kind === form.kind).map(x => x.name)].includes(name)) {
      formSet('category', name); setNewCategoryOpen(false); return;
    }
    setNewCategorySaving(true); setError('');
    try {
      const result = await economicRequest<{ category: Category }>('/categories', 'POST', { kind: form.kind, name });
      setSnapshot(prev => prev ? { ...prev, categories: prev.categories.concat(result.category) } : prev);
      formSet('category', result.category.name);
      setNewCategoryOpen(false); setNewCategoryName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось добавить категорию'); }
    finally { setNewCategorySaving(false); }
  };
  const categoryInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); void createInlineCategory(); }
  };
  const remove = async (type: 'accounts' | 'operations' | 'debts' | 'loans' | 'categories', id: string) => {
    if (!window.confirm('Удалить запись? Это действие нельзя отменить.')) return;
    setError('');
    try {
      await economicRequest('/' + type + '/' + encodeURIComponent(id), 'DELETE');
      await refresh();
      if (type === 'operations') await loadOperations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить запись'); }
  };
  const addAssistantFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const next = [...assistantFiles, ...Array.from(event.target.files || [])];
    event.target.value = '';
    const reason = validateEconomicFiles(next);
    if (reason) { setAssistantError(reason); return; }
    setAssistantError('');
    setAssistantFiles(next);
  };
  const sendAssistantMessage = async (text: string, files: File[] = assistantFiles) => {
    const question = text.trim();
    if ((!question && !files.length) || assistantPendingRef.current) return;
    const reason = validateEconomicFiles(files);
    if (reason) { setAssistantError(reason); return; }
    assistantPendingRef.current = true;
    setAssistantBusy(true); setAssistantStage(files.length ? 'reading_files' : 'reading_finances');
    setAssistantError(''); setError('');
    setAssistantQuestion('');
    setAssistantFiles([]);
    const pendingId = 'economic-pending:' + Date.now();
    const optimistic: ChatMessage = {
      id: pendingId, role: 'user', content: question,
      attachmentNames: files.map(f => f.name), createdAt: new Date().toISOString()
    };
    setSnapshot(prev => prev ? { ...prev, assistantMessages: [...prev.assistantMessages, optimistic] } : prev);
    // useLayoutEffect scrolls as soon as the optimistic bubble enters the DOM.
    try {
      const reply = await askEconomicStream(question, files, stage => setAssistantStage(stage));
      if (typeof reply.autoApply === 'boolean') setEconomicAutoApply(reply.autoApply);
      setAssistantStage('refreshing_finances');
      // Keep the actual answer visible if the subsequent snapshot refresh fails.
      setSnapshot(prev => prev ? { ...prev,
        assistantMessages: [...prev.assistantMessages, {
          id: 'economic-answer:' + pendingId, role: 'assistant',
          content: reply.answer, creditsSpentMilli: reply.creditsSpentMilli,
          inputTokens: reply.inputTokens, outputTokens: reply.outputTokens,
          proposals: reply.proposals ?? [],
          createdAt: new Date().toISOString()
        }] } : prev);
      try { await refresh(); }
      catch { setAssistantError('Ответ получен, но история пока не синхронизирована. Обновите страницу позже.'); }
    } catch (cause) {
      setSnapshot(prev => prev ? { ...prev,
        assistantMessages: prev.assistantMessages.filter(m => m.id !== pendingId) } : prev);
      setAssistantQuestion(question);
      setAssistantFiles(files);
      setAssistantError(cause instanceof Error ? cause.message : 'ИИ недоступен');
    } finally {
      assistantPendingRef.current = false;
      setAssistantBusy(false);
      setAssistantStage(null);
    }
  };
  const askAssistant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendAssistantMessage(assistantQuestion);
  };
  const voiceTranscript = (spoken: string, sendImmediately: boolean) => {
    const phrase = spoken.trim();
    if (!phrase) return;
    const full = [assistantQuestion.trim(), phrase].filter(Boolean).join(' ');
    setAssistantQuestion(full);
    if (sendImmediately) void sendAssistantMessage(full);
  };
  const categories = (kind: 'INCOME' | 'EXPENSE') => Array.from(new Set([
    ...baseCategories[kind], ...(snapshot?.categories.filter(c => c.kind === kind).map(c => c.name) || [])
  ]));
  const accountName = (id: string | null) => snapshot?.accounts.find(a => a.id === id)?.name || 'Счёт';
  const operationRow = (op: Operation) => {
    const linkedDebt = op.debtId ? snapshot?.debts.find(d => d.id === op.debtId) : undefined;
    const isCredit = creditKinds.has(op.kind);
    const isDebit = debitKinds.has(op.kind);
    const operationTone = isCredit ? 'INCOME' : isDebit ? 'EXPENSE' : 'TRANSFER';
    return <div className="econ-operation-row" key={op.id}>
      <div className={'econ-operation-icon ' + operationTone}>
        {isCredit ? <ArrowDownLeft size={19}/> : isDebit ? <ArrowUpRight size={19}/> : <ArrowRightLeft size={19}/>}
      </div>
      <div className="econ-operation-body">
        <strong>{op.title}</strong>
        <small>{dateLabel(op.occurredAt)} · {op.kind === 'TRANSFER'
          ? accountName(op.sourceAccountId) + ' → ' + accountName(op.targetAccountId)
          : kindLabel[op.kind] + ' · ' + (op.debtId ? 'Долги · ' : op.category ? op.category + ' · ' : '') + accountName(op.sourceAccountId)}</small>
      </div>
      <strong className={'econ-operation-amount ' + operationTone}>
        {isCredit ? '+' : isDebit ? '−' : ''}{money(op.amountMinor)}
      </strong>
      {op.debtId
        ? <button className="econ-icon-button" type="button" title="Открыть связанный долг" aria-label={'Открыть долг: ' + op.title}
            onClick={() => { if (linkedDebt) openDialog('debt', linkedDebt); else setSection('debts'); }}>
            <BookOpen size={16}/></button>
        : <>
            <button className="econ-icon-button" type="button" title="Редактировать" aria-label={'Редактировать ' + op.title} onClick={() => openDialog('operation', op)}><Pencil size={15}/></button>
            <button className="econ-icon-button econ-delete" type="button" title="Удалить" aria-label={'Удалить ' + op.title} onClick={() => void remove('operations', op.id)}><Trash2 size={15}/></button>
          </>}
    </div>;
  };

  const debtCard = (d: Debt) => <article className={'econ-card econ-obligation ' + (d.isClosed ? 'closed' : '')} key={d.id}>
    <div className="econ-obligation-type">{d.direction === 'OWE' ? 'Я должен' : 'Мне должны'}{d.isClosed && <span className="econ-tag">Закрыт</span>}</div>
    <h3>{d.counterparty}</h3><strong>{money(d.amountMinor)}</strong>
    <p>{d.dueAt ? 'Вернуть до ' + dateLabel(d.dueAt) : 'Срок не указан'}</p>
    <p>{d.postedToAccount ? 'Учтён на счёте: ' + accountName(d.accountId) : 'Без движения по счёту'}</p>
    {d.note && <p>{d.note}</p>}
    <RepaymentProgress paid={d.paidMinor} total={d.amountMinor}/>
    <div className="econ-row-actions">
      <button type="button" onClick={() => openDialog('debt', d)}><Pencil size={15}/> Изменить</button>
      <button type="button" onClick={() => void remove('debts', d.id)}><Trash2 size={15}/></button>
    </div>
  </article>;
  const loanCard = (l: Loan) => {
    const figures = loanFigures(l);
    const monthly = l.monthlyPaymentOverrideMinor ?? figures.monthly;
    return <article className={'econ-card econ-obligation ' + (l.isClosed ? 'closed' : '')} key={l.id}>
      <div className="econ-obligation-type">Кредит {l.isClosed && <span className="econ-tag">Закрыт</span>}</div>
      <h3>{l.name}</h3>
      <div className="econ-monthly-payment">
        <strong>{money(monthly)} <small>/ мес.</small></strong>
        <button type="button" title="Изменить ежемесячный платёж" aria-label={'Изменить ежемесячный платёж: ' + l.name}
          onClick={() => { openDialog('loan', l); window.requestAnimationFrame(() => document.getElementById('econ-monthly-override')?.focus()); }}>
          <Pencil size={15}/>
        </button>
      </div>
      <div className="econ-loan-stats">
        <span>Сумма кредита <b>{money(l.principalMinor)}</b></span>
        <span>Ставка <b>{String(l.annualRateBps / 100).replace('.', ',')}% годовых</b></span>
        <span>Срок <b>{l.termMonths} мес.</b></span>
        <span>Переплата (оценка) <b>{money(figures.overpay)}</b></span>
        <span>Всего выплат (оценка) <b>{money(figures.total)}</b></span>
      </div>
      <p>Начало: {dateLabel(l.startDate)}. {l.paymentDate ? 'Платёж: ' + new Date(l.paymentDate).getUTCDate() + '-го числа.' : 'Дата платежа не задана.'}
        {' '}Без комиссий, страховок и досрочного погашения.
      </p>
      <RepaymentProgress paid={l.paidMinor} total={figures.total}/>
      <div className="econ-row-actions">
        <button type="button" onClick={() => openDialog('loan', l)}><Pencil size={15}/> Изменить</button>
        <button type="button" onClick={() => void remove('loans', l.id)}><Trash2 size={15}/></button>
      </div>
    </article>;
  };
  const obligationPreview = (item: Debt | Loan, kind: 'debt' | 'loan') => {
    const isDebt = kind === 'debt';
    const title = isDebt ? (item as Debt).counterparty : (item as Loan).name;
    const total = isDebt ? (item as Debt).amountMinor : loanFigures(item as Loan).total;
    return <button type="button" className="econ-obligation-preview" key={kind + item.id}
      onClick={() => openDialog(isDebt ? 'debt' : 'loan', item)}>
      <div className="econ-preview-top">
        {isDebt ? <BookOpen size={17}/> : <CreditCard size={17}/>}
        <span>{isDebt ? (item as Debt).direction === 'OWE' ? 'Я должен' : 'Мне должны' : 'Кредит'}</span>
      </div>
      <strong>{title}</strong>
      <small>{isDebt ? money(total) : money((item as Loan).monthlyPaymentOverrideMinor ?? loanFigures(item as Loan).monthly) + ' / мес.'}</small>
      <RepaymentProgress paid={item.paidMinor} total={total}/>
    </button>;
  };

  if (loading) return <main className={'econ-root econ-loading' + (mobile ? ' econ-mobile-workspace' : '') + (effectiveAppearance === 'light' ? ' econ-light' : '')}>
    {mobile ? <div className="econ-mobile-skeleton" aria-label="Загружаем финансовые данные">
      <div className="econ-skeleton-title"/><div className="econ-skeleton-banner"/>
      <div className="econ-skeleton-balance"/><div className="econ-skeleton-grid"><span/><span/></div>
      <div className="econ-skeleton-row"/><div className="econ-skeleton-row"/>
    </div> : <><Loader2 className="econ-spin" size={26}/> Загружаем Экономыч AI…</>}
  </main>;
  if (!snapshot || !user) return <main className={'econ-root econ-loading' + (mobile ? ' econ-mobile-workspace' : '') + (effectiveAppearance === 'light' ? ' econ-light' : '')}><h1>Экономыч AI</h1><p>{error || 'Для начала войдите в Планировыч.'}</p><a className="econ-primary-link" href="/">Вернуться в Планировыч</a></main>;

  const actions: Partial<Record<Section, () => void>> = {
    accounts: () => openDialog('account'), operations: () => openDialog('operation'),
    categories: () => openDialog('category')
  };
  return <div className={'econ-root ' + (effectiveAppearance === 'light' ? 'econ-light' : '') + (mobile ? ' econ-mobile-workspace' : '')}
    style={embeddedInMiniApp ? { '--econ-mobile-safe-bottom': mobileSafeBottom + 'px' } as CSSProperties : undefined}>
    {!mobile && <ModuleRail active="economic"/>}
    <div className="econ-shell">
      {!mobile && <aside className="econ-nav">
        <div className="econ-nav-brand"><span className="econ-brand-logo"><CircleDollarSign size={25}/></span><div><strong>Экономыч AI</strong><small>Ваши финансы</small></div></div>
        <div className="econ-nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <div className="econ-nav-links">{nav.map(({ section: value, icon: Icon }) => <button key={value} type="button" className={section === value ? 'selected' : ''} onClick={() => { setSection(value); setError(''); }}><Icon size={18}/><span>{sectionTitles[value]}</span>{section === value && <ChevronRight size={15}/>}</button>)}</div>
        <div className="econ-nav-foot"><span className="econ-avatar">{(user.name || user.username || 'П')[0].toUpperCase()}</span><div><strong>{user.name || user.username || 'Пользователь'}</strong><small>Личный бюджет · RUB</small></div></div>
      </aside>}
      <main className="econ-main">
        {mobile && <nav className="econ-mobile-sections" aria-label="Разделы финансов">
          {nav.map(({section:value,icon:Icon})=><button type="button" key={value}
            className={section===value?'active':''}
            aria-current={section===value?'page':undefined}
            onClick={()=>{setSection(value);setError('');}}>
            <Icon size={17}/>{sectionTitles[value]}
          </button>)}
        </nav>}
        <header className="econ-topbar"><div><div className="econ-eyebrow">ПЛАНИРОВЫЧ / ЭКОНОМЫЧ AI</div><h1>{section === 'overview' ? 'Экономыч AI' : sectionTitles[section]}</h1></div><div className="econ-top-actions"><button className="econ-add-global" data-economic-create-operation type="button" onClick={() => openDialog('operation')}><Plus size={18}/> Новая операция</button></div></header>
        {error && <div className="econ-error" role="alert"><span>{error}</span><button type="button" aria-label="Скрыть ошибку" onClick={() => setError('')}><X size={16}/></button></div>}
        {section === 'overview' && <>
          <div className="econ-intro"><div><span className="econ-kicker"><span className="econ-intro-star">✦</span> Личные финансы без хаоса</span><h2>Держите деньги<br/><em>под контролем.</em></h2><p>Баланс, повседневные траты, долги и кредиты в одном спокойном пространстве.</p></div><div className="econ-intro-illustration" aria-hidden="true"><div className="econ-coin-big">₽</div><div className="econ-coin-small">₽</div><div className="econ-intro-orbit"/></div></div>
          <div className="econ-stats">
            <article className="econ-stat"><div className="econ-stat-label"><WalletCards size={18}/> Общий баланс</div><strong>{money(snapshot.totals.balanceMinor)}</strong><small>Все ваши счета</small></article>
            <article className="econ-stat"><div className="econ-stat-label"><ArrowDownLeft size={18}/> Доходы за месяц</div><strong className="econ-positive">{money(snapshot.totals.monthIncomeMinor)}</strong><small>Без переводов между счетами</small></article>
            <article className="econ-stat"><div className="econ-stat-label"><ArrowUpRight size={18}/> Расходы за месяц</div><strong>{money(snapshot.totals.monthExpenseMinor)}</strong><small>Без переводов между счетами</small></article>
          </div>
          {snapshot.assistantMessages.some(m => m.content.startsWith('[Планировыч]') && m.proposals?.some(p => p.status === 'PENDING' || p.status === 'APPLIED')) && <section className="econ-card econ-planner-proposals">
            <div className="econ-card-header"><div><h2>Подтверждение финансовых изменений</h2><p>Предложения основного помощника Планировыча</p></div></div>
            <div className="econ-planner-proposal-list">
              {snapshot.assistantMessages.filter(m => m.content.startsWith('[Планировыч]')).flatMap(m =>
                (m.proposals ?? []).filter(p => p.status === 'PENDING' || p.status === 'APPLIED')
              ).map(item => <EconomicAiProposalCard key={item.id} initial={item} autoApply={economicAutoApply}
                onAutoApplyChange={changeEconomicAutoApply} onRefresh={refresh}/>)}
            </div>
          </section>}
          <div className="econ-dashboard-grid">
            <section className="econ-card"><div className="econ-card-header"><div><h2>Мои счета</h2><p>Остатки с учётом всех операций</p></div><button type="button" onClick={() => setSection('accounts')}>Все счета <ChevronRight size={16}/></button></div><div className="econ-account-grid">{snapshot.accounts.slice(0, 4).map(a => <button type="button" className={'econ-mini-account ' + (a.isPrimary ? 'main' : '')} key={a.id} onClick={() => openDialog('account', a)}><WalletCards size={20}/><span>{a.name}{a.isPrimary && <small>Основной</small>}</span><strong>{money(a.balanceMinor)}</strong></button>)}</div><button className="econ-inline-add" type="button" onClick={() => openDialog('account')}><Plus size={16}/> Добавить счёт</button></section>
            <section className="econ-card">
              <div className="econ-card-header"><div><h2>Долги и кредиты</h2><p>Платежи и прогресс погашения</p></div>
                <button type="button" onClick={() => setSection('debts')}>Все записи <ChevronRight size={16}/></button></div>
              <div className="econ-obligation-preview-list">
                {snapshot.debts.filter(x => !x.isClosed).map(d => obligationPreview(d, 'debt'))}
                {snapshot.loans.filter(x => !x.isClosed).map(l => obligationPreview(l, 'loan'))}
                {!snapshot.debts.some(d => !d.isClosed) && !snapshot.loans.some(l => !l.isClosed) &&
                  <div className="econ-empty">Активных долгов и кредитов пока нет</div>}
              </div>
              <div className="econ-quick-links">
                <button type="button" onClick={() => openDialog('debt')}><Plus size={15}/> Долг</button>
                <button type="button" onClick={() => openDialog('loan')}><Plus size={15}/> Кредит</button>
              </div>
            </section>
          </div>
          <section className="econ-card econ-recent"><div className="econ-card-header"><div><h2>Последние операции</h2><p>{snapshot.totals.operationCount ? snapshot.totals.operationCount + ' записей всего' : 'Здесь появятся доходы и расходы'}</p></div><button type="button" onClick={() => setSection('operations')}>Все операции <ChevronRight size={16}/></button></div>{snapshot.recent.length ? snapshot.recent.map(operationRow) : <div className="econ-empty">Пока нет операций. Начните с первой записи.</div>}</section>
        </>}
        {section !== 'overview' && <div className="econ-section-content">
          <div className="econ-section-heading">
            <p>{section === 'accounts' ? 'Управляйте счетами и начальными остатками.' :
              section === 'operations' ? 'История доходов, расходов, переводов и долговых движений.' :
              section === 'debts' ? 'Кому вы должны, кто должен вам и платежи по кредитам.' :
              'Создавайте свои категории доходов и расходов.'}</p>
            <div className="econ-heading-actions">
              {section === 'debts' && <>
                <button type="button" className="econ-action" onClick={() => openDialog('debt')}><Plus size={16}/> Долг</button>
                <button type="button" className="econ-action" onClick={() => openDialog('loan')}><Plus size={16}/> Кредит</button>
              </>}
              {section !== 'operations' && actions[section] && <button type="button" className="econ-action" onClick={actions[section]}>
                <Plus size={17}/> {section === 'accounts' ? 'Счёт' : 'Категория'}
              </button>}
            </div>
          </div>
          {section === 'accounts' && <div className="econ-collection-grid">{snapshot.accounts.map(a => <article className="econ-card econ-account-detail" key={a.id}><div className="econ-card-top"><span className="econ-account-symbol"><Landmark size={22}/></span>{a.isPrimary && <span className="econ-tag">Основной</span>}</div><h3>{a.name}</h3><strong>{money(a.balanceMinor)}</strong><p>Текущий баланс счёта</p><div className="econ-row-actions"><button type="button" onClick={() => openDialog('account', a)}><Pencil size={15}/> Изменить</button>{!a.isPrimary && <><button type="button" onClick={() => void economicRequest('/accounts/' + a.id, 'PATCH', { isPrimary: true }).then(refresh).catch(e => setError(e.message))}><Check size={15}/> Основным</button><button type="button" onClick={() => void remove('accounts', a.id)}><Trash2 size={15}/></button></>}</div></article>)}</div>}
          {section === 'operations' && <section className="econ-card econ-operations-list"><div className="econ-filters"><select value={kindFilter} onChange={e => setKindFilter(e.target.value)} aria-label="Тип операции"><option value="">Все типы</option><option value="EXPENSE">Расходы</option><option value="INCOME">Доходы</option><option value="TRANSFER">Переводы</option><option value="DEBTS">Долговые операции</option></select><select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} aria-label="Счёт"><option value="">Все счета</option>{snapshot.accounts.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Категория"><option value="">Все категории</option>{[...new Set([...categories('EXPENSE'), ...categories('INCOME')])].map(c => <option value={c} key={c}>{c}</option>)}</select></div>{operations.length ? operations.map(operationRow) : <div className="econ-empty">{operationsBusy ? 'Загружаем…' : 'Нет операций по выбранным фильтрам'}</div>}{nextCursor && <button className="econ-load-more" disabled={operationsBusy} type="button" onClick={() => void loadOperations(true, nextCursor)}>{operationsBusy ? 'Загрузка…' : 'Показать ещё 50 операций'}</button>}</section>}
          {section === 'debts' && <>
            <div className="econ-subsection-heading"><BookOpen size={19}/><h2>Долги</h2><small>{snapshot.debts.length}</small></div>
            <div className="econ-collection-grid">
              {snapshot.debts.map(debtCard)}
              {!snapshot.debts.length && <div className="econ-empty econ-card">Долгов пока нет</div>}
            </div>
            <div className="econ-subsection-heading"><CreditCard size={19}/><h2>Кредиты</h2><small>{snapshot.loans.length}</small></div>
            <div className="econ-collection-grid">
              {snapshot.loans.map(loanCard)}
              {!snapshot.loans.length && <div className="econ-empty econ-card">Кредитов пока нет</div>}
            </div>
          </>}
          {section === 'categories' && <div className="econ-collection-grid">{(['EXPENSE', 'INCOME'] as const).map(kind => <section className="econ-card" key={kind}><div className="econ-card-header"><h2>{kind === 'EXPENSE' ? 'Категории расходов' : 'Категории доходов'}</h2></div><div className="econ-category-list">{categories(kind).map(name => { const custom = snapshot.categories.find(c => c.kind === kind && c.name === name); return <div key={name}><span>{name}</span>{custom ? <button type="button" title="Удалить пользовательскую категорию" onClick={() => void remove('categories', custom.id)}><Trash2 size={14}/></button> : <small>Базовая</small>}</div>; })}</div><button className="econ-inline-add" type="button" onClick={() => { openDialog('category'); setForm({ kind, name: '' }); }}><Plus size={15}/> Своя категория</button></section>)}</div>}
        </div>}
        <footer className="econ-footer">Экономыч AI · Персональные данные видны только владельцу аккаунта. RUB · Учёт вручную.</footer>
      </main>
    </div>

    {!mobile && <EconomicMascot active={assistantOpen} busy={assistantBusy} progress={assistantStage} onClick={() => setAssistantOpen(v => !v)}/>}
    {!mobile && assistantOpen && <section id="econ-assistant-dialog" className="econ-assistant" role="dialog" aria-label="Экономыч AI, финансовый помощник">
      <div className="econ-assistant-head">
        <div><span className="econ-assistant-avatar">₽</span>
          <div><strong>Экономыч AI</strong><small>Финансовый помощник</small></div>
        </div>
        <button type="button" onClick={() => setAssistantOpen(false)} aria-label="Закрыть"><X size={18}/></button>
      </div>
      <div className="econ-assistant-body" ref={assistantScrollRef}>
        <div className="econ-insight-table">
          <table><caption>Ваши счета</caption><thead><tr><th>Счёт</th><th>Остаток</th></tr></thead>
            <tbody>{snapshot.accounts.map(a => <tr key={a.id}><td>{a.name}</td><td>{money(a.balanceMinor)}</td></tr>)}</tbody>
          </table>
        </div>
        {snapshot.assistantMessages.length === 0 &&
          <div className="econ-assistant-welcome"><MessageCircle size={21}/>
            <strong>Чем помочь с финансами?</strong>
            <p>Спросите о доходах, расходах, кредитах или способах вести бюджет. Помощник анализирует ваши данные и прикреплённые файлы. Создание и изменение финансовых записей доступны с подтверждением.</p>
          </div>}
        <div className="econ-chat-messages">
          {snapshot.assistantMessages.map(m =>
            <div key={m.id} className={'econ-chat-message ' + (m.role === 'user' ? 'mine' : 'assistant')}>
              <div className={'econ-chat-bubble ' + (m.role === 'user' ? 'mine' : 'assistant')}>
                {m.content && <span>{m.content}</span>}
                {Boolean(m.attachmentNames?.length) &&
                  <div className="econ-message-files">{m.attachmentNames?.map((name,i) =>
                    <span key={name + i} title={name}><Paperclip size={12}/>{name}</span>)}</div>}
              </div>
              {m.role === 'assistant' && m.proposals?.map(item=>
                <EconomicAiProposalCard key={item.id} initial={item}
                  autoApply={economicAutoApply}
                  onAutoApplyChange={changeEconomicAutoApply}
                  onRefresh={refresh}/>
              )}
              {m.role === 'assistant' && typeof m.creditsSpentMilli === 'number' && m.creditsSpentMilli > 0 &&
                <div className="econ-message-credits" aria-label="Стоимость ответа ИИ">
                  <Sparkles size={11}/> Потрачено: {formatCreditsSpent(m.creditsSpentMilli)}
                </div>}
            </div>
          )}
          {assistantBusy && <div className="econ-ai-progress" role="status" aria-live="polite" aria-atomic="true">
            <span className="econ-ai-progress-icon" aria-hidden="true"><Sparkles size={19} strokeWidth={2}/></span>
            <div className="econ-ai-progress-details">
              <span key={assistantStage} className="econ-ai-progress-text">{({
                reading_files: 'Подготавливаю вложения',
                reading_finances: 'Изучаю финансовые данные',
                reading_history: 'Учитываю историю диалога',
                counting_tokens: 'Подсчитываю контекст',
                forming_answer: 'Формирую ответ',
                searching_history: 'Ищу в истории переписки',
                saving_conversation: 'Сохраняю ответ',
                preparing_finances: 'Готовлю финансовые изменения',
                searching_finances: 'Ищу финансовые записи',
                applying_finances: 'Применяю подтверждённые настройки',
                refreshing_finances: 'Обновляю финансовые данные'
              } as Record<string,string>)[assistantStage || ''] || 'Анализирую запрос'}</span>
              <div key={'econ-progress-' + assistantStage} className="econ-ai-progress-track" aria-hidden="true"><span/><span/><span/></div>
            </div>
          </div>}
          {assistantError && <div className="econ-chat-error" role="alert">{assistantError}</div>}
        </div>
      </div>
      <div className="econ-chat-input-zone">
        {assistantFiles.length > 0 && <div className="econ-attachment-chips" aria-label="Выбранные вложения">
          {assistantFiles.map((file,i) => <div className="econ-attachment-chip" key={file.name + i}>
            <Paperclip size={13}/><span title={file.name}>{file.name}</span>
            <button type="button" disabled={assistantBusy} title="Убрать вложение" aria-label={'Убрать ' + file.name}
              onClick={() => setAssistantFiles(prev => prev.filter((_,index) => index !== i))}><X size={13}/></button>
          </div>)}
        </div>}
        <form className="econ-assistant-composer" onSubmit={askAssistant}>
          <input ref={assistantFilePickerRef} className="econ-hidden-file" type="file" multiple
            accept={ECONOMIC_ACCEPTED_FILE_TYPES} onChange={addAssistantFiles} aria-label="Файлы для финансового помощника"/>
          <button type="button" className="econ-attach-button" disabled={assistantBusy}
            onClick={() => assistantFilePickerRef.current?.click()} title="Прикрепить файл"
            aria-label="Прикрепить файл"><Paperclip size={17}/></button>
          <textarea aria-label="Вопрос Экономычу AI" placeholder="Спросить об операциях и бюджете"
            value={assistantQuestion} onChange={e => setAssistantQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault(); void sendAssistantMessage(assistantQuestion); } }}
            maxLength={2000} disabled={assistantBusy} rows={1}/>
          <Suspense fallback={<span className="econ-voice-placeholder" aria-hidden="true"><Mic size={16}/></span>}>
            <EconomicVoiceInput activationMode="transcription" small disabled={assistantBusy}
              onTranscript={voiceTranscript} className="econ-voice-trigger"/>
          </Suspense>
          <button type="submit" disabled={assistantBusy || (!assistantQuestion.trim() && !assistantFiles.length)}
            title="Отправить сообщение" aria-label="Отправить сообщение"><Send size={18}/></button>
        </form>
        <div className="econ-assistant-note">Стоимость рассчитывается по фактическим токенам · Голосовой ввод оплачивается отдельно</div>
      </div>
    </section>}

    {mobile && embeddedInMiniApp && !dialog && <button type="button"
      className="econ-mobile-add-fab" aria-label="Новая операция" title="Новая операция"
      onClick={() => openDialog('operation')}><Plus size={27}/></button>}
    {dialog && createPortal(<div
      className={'econ-root econ-dialog-layer ' + (effectiveAppearance === 'light' ? 'econ-light ' : '') + (mobile ? 'econ-mobile-dialog-layer ' : '') + (embeddedInMiniApp ? 'econ-miniapp-dialog-layer' : '')}
      style={embeddedInMiniApp ? { '--econ-mobile-safe-top': mobileSafeTop + 'px', '--econ-mobile-safe-bottom': mobileSafeBottom + 'px' } as CSSProperties : undefined}>
      <div className="econ-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setDialog(null); }}><section className="econ-modal" role="dialog" aria-modal="true" aria-label="Редактирование Economic"><header><div><span className="econ-eyebrow">{dialog.id ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАПИСЬ'}</span><h2>{dialog.kind === 'operation' ? 'Операция' : dialog.kind === 'account' ? 'Счёт' : dialog.kind === 'debt' ? 'Долг' : dialog.kind === 'loan' ? 'Кредит' : 'Категория'}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Закрыть"><X size={19}/></button></header>
      <form className="econ-form" onSubmit={submitDialog}>
        {dialog.kind === 'operation' && <>
          <label>Тип операции<select value={form.kind} onChange={e => { formSet('kind', e.target.value); formSet('category', ''); setNewCategoryOpen(false); }}>
            <option value="EXPENSE">Расход</option><option value="INCOME">Доход</option><option value="TRANSFER">Перевод между счетами</option>
          </select></label>
          <label>Название<input required maxLength={160} value={form.title} onChange={e => formSet('title', e.target.value)} placeholder="Что купили или получили"/></label>
          <label>Сумма, ₽<input required inputMode="decimal" value={form.amount} onChange={e => formSet('amount', e.target.value)} placeholder="0,00"/></label>
          <label>{form.kind === 'TRANSFER' ? 'Счёт списания' : 'Счёт'}
            <select required value={form.sourceAccountId} onChange={e => formSet('sourceAccountId', e.target.value)}>
              {snapshot.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          {form.kind === 'TRANSFER' && <label>Счёт зачисления
            <select required value={form.targetAccountId} onChange={e => formSet('targetAccountId', e.target.value)}>
              <option value="">Выберите счёт</option>
              {snapshot.accounts.filter(a => a.id !== form.sourceAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>}
          {form.kind !== 'TRANSFER' && <div className="econ-category-controls">
            <label>Категория<select value={form.category} onChange={e => formSet('category', e.target.value)}>
              <option value="">Без категории</option>
              {categories(form.kind as 'INCOME' | 'EXPENSE').map(name => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <button type="button" className="econ-inline-category-button" onClick={() => setNewCategoryOpen(v => !v)}>
              <Plus size={14}/> Новая категория
            </button>
            {newCategoryOpen && <div className="econ-inline-category-form">
              <input aria-label="Новая категория" placeholder="Название категории" maxLength={60}
                value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={categoryInputKeyDown}/>
              <button type="button" disabled={newCategorySaving || !newCategoryName.trim()}
                onClick={() => void createInlineCategory()}>
                {newCategorySaving ? <Loader2 size={15} className="econ-spin"/> : <Check size={15}/>} Добавить
              </button>
            </div>}
          </div>}
          <label>Дата<input required type="date" value={form.date} onChange={e => formSet('date', e.target.value)}/></label>
          <label>Примечание<input maxLength={500} value={form.note} onChange={e => formSet('note', e.target.value)} placeholder="Необязательно"/></label>
        </>}
        {dialog.kind === 'account' && <><label>Название счёта<input required maxLength={60} value={form.name} onChange={e => formSet('name',e.target.value)} placeholder="Наличные, карта, накопления"/></label><label>Баланс, ₽<input required inputMode="decimal" value={form.balance} onChange={e => formSet('balance',e.target.value)}/></label>{dialog.id && form.isPrimary !== 'yes' && <label>Статус<select value={form.isPrimary} onChange={e => formSet('isPrimary', e.target.value)}><option value="no">Дополнительный</option><option value="yes">Сделать основным</option></select></label>}<p className="econ-form-hint">Укажите текущую сумму на счёте. Корректировка баланса сохраняет историю операций и не считается доходом или расходом.</p></>}
        {dialog.kind === 'debt' && <>
          <label>Направление<select value={form.direction} onChange={e => formSet('direction', e.target.value)}>
            <option value="OWE">Я получил деньги в долг</option>
            <option value="OWED_TO_ME">Я дал деньги в долг</option>
          </select></label>
          <label>Кому или кто<input required maxLength={100} value={form.counterparty} onChange={e => formSet('counterparty', e.target.value)} placeholder="Имя человека или организация"/></label>
          <label>Сумма долга, ₽<input required inputMode="decimal" value={form.amount} onChange={e => formSet('amount', e.target.value)}/></label>
          <label className="econ-checkbox-row"><input type="checkbox" checked={form.postedToAccount === 'yes'}
              onChange={e => formSet('postedToAccount', e.target.checked ? 'yes' : 'no')}/>
            <span>Зачислить долг на счёт {form.direction === 'OWED_TO_ME' ? '(списать при выдаче)' : ''}</span>
          </label>
          {form.postedToAccount === 'yes' && <label>Счёт для учёта долга
            <select required value={form.accountId} onChange={e => formSet('accountId', e.target.value)}>
              {snapshot.accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.isPrimary ? ' (основной)' : ''}</option>)}
            </select>
          </label>}
          <label>Сколько уже возвращено, ₽<input required inputMode="decimal" value={form.paid} onChange={e => formSet('paid', e.target.value)}/></label>
          <label>Срок возврата (необязательно)<input type="date" value={form.date} onChange={e => formSet('date', e.target.value)}/></label>
          <label>Примечание<input maxLength={500} value={form.note} onChange={e => formSet('note', e.target.value)}/></label>
          {dialog.id && <label>Состояние<select value={form.isClosed} onChange={e => setForm(prev => ({
              ...prev, isClosed: e.target.value, paid: e.target.value === 'yes' ? prev.amount : prev.paid
            }))}>
              <option value="no">Активный долг</option><option value="yes">Долг погашен полностью</option>
            </select></label>}
          <p className="econ-form-hint">При активном учёте долг изменяет выбранный счёт:
            {form.direction === 'OWE' ? ' полученные деньги прибавятся к балансу.' : ' выданные деньги спишутся с баланса.'}
            {' '}Возвраты учитываются отдельно и не являются доходом или расходом.
          </p>
        </>}
        {dialog.kind === 'loan' && <>
          <label>Название кредита<input required maxLength={100} value={form.name} onChange={e => formSet('name', e.target.value)} placeholder="Автокредит, ипотека…"/></label>
          <label>Банк / кредитор<input maxLength={100} value={form.lender} onChange={e => formSet('lender', e.target.value)}/></label>
          <label>Сумма кредита, ₽<input required inputMode="decimal" value={form.amount} onChange={e => formSet('amount', e.target.value)}/></label>
          <label>Сколько уже внесено, ₽<input required inputMode="decimal" value={form.paid} onChange={e => formSet('paid', e.target.value)}/></label>
          <label>Ставка, % годовых<input required inputMode="decimal" value={form.rate} onChange={e => formSet('rate', e.target.value)} placeholder="12,5"/></label>
          <label>Срок, месяцев<input required type="number" min={1} max={600} step={1} value={form.months} onChange={e => formSet('months', e.target.value)}/></label>
          <label>Ежемесячный платёж, ₽ (необязательно)
            <input id="econ-monthly-override" inputMode="decimal" value={form.monthlyOverride}
              onChange={e => formSet('monthlyOverride', e.target.value)} placeholder="Автоматический расчёт"/>
          </label>
          <p className="econ-form-hint">Оставьте поле пустым, чтобы использовать расчёт Экономыча AI.</p>
          <label>Начало кредита<input required type="date" value={form.date} onChange={e => formSet('date', e.target.value)}/></label>
          <label>Дата платежа (необязательно)<input type="date" value={form.paymentDate} onChange={e => formSet('paymentDate', e.target.value)}/></label>
          <div className="econ-reminder-row">
            <label className="econ-checkbox-row"><input type="checkbox"
              checked={form.remindersEnabled === 'yes'}
              onChange={e => formSet('remindersEnabled', e.target.checked ? 'yes' : 'no')}/>
              <span>Напоминания о платеже</span>
            </label>
            <div className="econ-tooltip-wrap">
              <button type="button" className="econ-help-button" aria-label="Как работают напоминания" aria-describedby="econ-reminder-info">?</button>
              <div id="econ-reminder-info" className="econ-tooltip-panel" role="note">
                В дату платежа придёт уведомление в телеграм-бот «Планировыч AI».
                <div className="econ-telegram-status">Статус подключения:
                  <strong>{user.telegramLinked ? 'Подключен' : 'Не подключен'}</strong>
                </div>
                {!user.telegramLinked && <a href="/?connectTelegram=1" target="_blank" rel="noopener noreferrer">
                  Подключить <ArrowUpRight size={14}/>
                </a>}
              </div>
            </div>
          </div>
          {form.remindersEnabled === 'yes' && !form.paymentDate &&
            <p className="econ-form-hint">Укажите дату платежа, чтобы включить уведомления.</p>}
          {dialog.id && <label>Статус<select value={form.isClosed} onChange={e => formSet('isClosed', e.target.value)}>
            <option value="no">Активен</option><option value="yes">Закрыт</option>
          </select></label>}
          <p className="econ-form-hint">В прогрессе учитывается плановая сумма выплат с процентами.
            Расчёт аннуитетный, ориентировочный, без комиссий, страховок и досрочного погашения.
          </p>
        </>}
        {dialog.kind === 'category' && <><label>Тип<select value={form.kind} onChange={e => formSet('kind',e.target.value)}><option value="EXPENSE">Расходы</option><option value="INCOME">Доходы</option></select></label><label>Название<input required maxLength={60} value={form.name} onChange={e => formSet('name',e.target.value)} placeholder="Например, питомцы"/></label></>}
        {error && <div className="econ-error" role="alert">{error}</div>}
        <div className="econ-form-actions"><button type="button" disabled={saving} onClick={() => setDialog(null)}>Отмена</button><button type="submit" disabled={saving}>{saving ? <Loader2 className="econ-spin" size={17}/> : <Check size={17}/>} Сохранить</button></div>
      </form></section></div></div>, document.body)}
  </div>;
}
