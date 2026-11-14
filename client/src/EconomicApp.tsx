import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronRight, CircleDollarSign, CreditCard, Landmark, LayoutDashboard, Loader2, MessageCircle, Pencil, Plus, Send, Settings2, Trash2, WalletCards, X } from 'lucide-react';
import { api, type CurrentUser } from './lib/api';
import ModuleRail from './components/ModuleRail';
import { annuityEstimate, formatMinorRub as money, minorToRublesInput as inputMoney, rublesToMinor as parseMoney } from './lib/economicMoney';
import './EconomicApp.css';

type Kind = 'INCOME' | 'EXPENSE' | 'TRANSFER';
type Section = 'overview' | 'accounts' | 'operations' | 'debts' | 'loans' | 'categories';
type Dialog = { kind: 'account' | 'operation' | 'debt' | 'loan' | 'category'; id?: string } | null;
type Account = { id: string; name: string; isPrimary: boolean; currency: string; openingBalanceMinor: string; balanceMinor: string };
type Operation = { id: string; kind: Kind; amountMinor: string; title: string; note: string | null; category: string | null; sourceAccountId: string; targetAccountId: string | null; occurredAt: string };
type Debt = { id: string; direction: 'OWE' | 'OWED_TO_ME'; counterparty: string; amountMinor: string; dueAt: string | null; note: string | null; isClosed: boolean };
type Loan = { id: string; name: string; lender: string | null; principalMinor: string; annualRateBps: number; termMonths: number; startDate: string; isClosed: boolean };
type Category = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' };
type ChatMessage = { id: string; role: string; content: string; createdAt: string };
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
const kindLabel: Record<Kind, string> = { INCOME: 'Доход', EXPENSE: 'Расход', TRANSFER: 'Перевод' };
const sectionTitles: Record<Section, string> = {
  overview: 'Обзор', accounts: 'Счета', operations: 'Операции', debts: 'Долги', loans: 'Кредиты', categories: 'Категории'
};
const nav: Array<{ section: Section; icon: typeof WalletCards }> = [
  { section: 'overview', icon: LayoutDashboard }, { section: 'accounts', icon: WalletCards },
  { section: 'operations', icon: ArrowRightLeft }, { section: 'debts', icon: BookOpen },
  { section: 'loans', icon: CreditCard }, { section: 'categories', icon: Settings2 }
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

function EconomicMascot({ onClick, active }: { onClick: () => void; active: boolean }) {
  return <button className={'econ-mascot ' + (active ? 'active' : '')} type="button" onClick={onClick} aria-label={active ? 'Закрыть помощника Economic' : 'Открыть помощника Economic'} title="Помощник Economic">
    <svg viewBox="0 0 98 100" width="80" height="80" aria-hidden="true">
      <defs><linearGradient id="econ-robot-metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff0d5"/><stop offset=".5" stopColor="#f9b34b"/><stop offset="1" stopColor="#9e500a"/></linearGradient></defs>
      <path d="M15 48 Q8 48 8 56 L8 70 Q8 77 15 77 L21 73 L21 52Z" fill="#c17b31"/>
      <path d="M83 48 Q90 48 90 56 L90 70 Q90 77 83 77 L77 73 L77 52Z" fill="#c17b31"/>
      <rect x="21" y="29" width="56" height="54" rx="19" fill="url(#econ-robot-metal)" stroke="#ffda9a" strokeWidth="2"/>
      <rect x="29" y="42" width="40" height="25" rx="11" fill="#28202b"/>
      <ellipse cx="40" cy="54" rx="5" ry="7" fill="#ffc66b"/><ellipse cx="58" cy="54" rx="5" ry="7" fill="#ffc66b"/>
      <path d="M43 74 Q49 78 55 74" fill="none" stroke="#824a1b" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="49" cy="20" r="16" fill="#f7bf54" stroke="#ffe6a3" strokeWidth="3"/><text x="49" y="27" fill="#854704" fontSize="23" fontWeight="800" textAnchor="middle">₽</text>
      <path d="M34 84 L30 93 M64 84 L68 93" stroke="#eeb362" strokeWidth="6" strokeLinecap="round"/>
    </svg>
    <span className="econ-mascot-pulse"/>
  </button>;
}

export default function EconomicApp() {
  const [user, setUser] = useState<CurrentUser | null>(null);
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
  const [operations, setOperations] = useState<Operation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [operationsBusy, setOperationsBusy] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const refresh = useCallback(async () => {
    setSnapshot(await economicRequest<Snapshot>('/snapshot'));
  }, []);
  useEffect(() => {
    let alive = true;
    document.title = 'Economic · Планировыч';
    void (async () => {
      try {
        const response = await api.getMe();
        if (!alive) return;
        setUser(response.user);
        const data = await economicRequest<Snapshot>('/snapshot');
        if (alive) setSnapshot(data);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Сервис недоступен');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);
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
      fields.opening = account ? inputMoney(account.openingBalanceMinor) : '0';
      fields.isPrimary = account?.isPrimary ? 'yes' : 'no';
    } else if (kind === 'debt') {
      const debt = item as Debt | undefined;
      fields.direction = debt?.direction || 'OWE'; fields.counterparty = debt?.counterparty || '';
      fields.amount = debt ? inputMoney(debt.amountMinor) : ''; fields.note = debt?.note || '';
      fields.date = debt?.dueAt ? toDateInput(debt.dueAt) : ''; fields.isClosed = debt?.isClosed ? 'yes' : 'no';
    } else if (kind === 'loan') {
      const loan = item as Loan | undefined;
      fields.name = loan?.name || ''; fields.lender = loan?.lender || '';
      fields.amount = loan ? inputMoney(loan.principalMinor) : '';
      fields.rate = loan ? String(loan.annualRateBps / 100).replace('.', ',') : '';
      fields.months = loan ? String(loan.termMonths) : '12';
      fields.date = toDateInput(loan?.startDate); fields.isClosed = loan?.isClosed ? 'yes' : 'no';
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
        payload = { name: form.name, openingBalanceMinor: parseMoney(form.opening, true),
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
          ...(dialog.id ? { isClosed: form.isClosed === 'yes' } : {}) };
      } else if (dialog.kind === 'loan') {
        path = '/loans';
        const rate = Number((form.rate || '').replace(',', '.'));
        if (!Number.isFinite(rate) || rate < 0 || rate > 1000 || !/^\d+(?:[,.]\d{1,2})?$/.test(form.rate)) throw new Error('Ставка должна быть в процентах, максимум два знака после запятой');
        payload = { name: form.name, lender: form.lender || null, principalMinor: parseMoney(form.amount),
          annualRateBps: Math.round(rate * 100), termMonths: Number(form.months),
          startDate: new Date(form.date + 'T12:00:00').toISOString(),
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
  const remove = async (type: 'accounts' | 'operations' | 'debts' | 'loans' | 'categories', id: string) => {
    if (!window.confirm('Удалить запись? Это действие нельзя отменить.')) return;
    setError('');
    try {
      await economicRequest('/' + type + '/' + encodeURIComponent(id), 'DELETE');
      await refresh();
      if (type === 'operations') await loadOperations();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить запись'); }
  };
  const askAssistant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = assistantQuestion.trim();
    if (!question || assistantBusy) return;
    setAssistantBusy(true); setError('');
    setAssistantQuestion('');
    // Optimistic local bubble, replaced with database history on success.
    const optimistic = { id: 'pending-user', role: 'user', content: question, createdAt: new Date().toISOString() };
    setSnapshot(prev => prev ? { ...prev, assistantMessages: [...prev.assistantMessages, optimistic] } : prev);
    try {
      await economicRequest<{ answer: string }>('/assistant/chat', 'POST', { question });
      await refresh();
    } catch (cause) {
      setSnapshot(prev => prev ? { ...prev, assistantMessages: prev.assistantMessages.filter(x => x.id !== 'pending-user') } : prev);
      setAssistantQuestion(question);
      setError(cause instanceof Error ? cause.message : 'ИИ недоступен');
    } finally { setAssistantBusy(false); }
  };
  const categories = (kind: 'INCOME' | 'EXPENSE') => Array.from(new Set([
    ...baseCategories[kind], ...(snapshot?.categories.filter(c => c.kind === kind).map(c => c.name) || [])
  ]));
  const accountName = (id: string | null) => snapshot?.accounts.find(a => a.id === id)?.name || 'Счёт';
  const operationRow = (op: Operation) => <div className="econ-operation-row" key={op.id}>
    <div className={'econ-operation-icon ' + op.kind}>
      {op.kind === 'INCOME' ? <ArrowDownLeft size={19}/> : op.kind === 'EXPENSE' ? <ArrowUpRight size={19}/> : <ArrowRightLeft size={19}/>}
    </div>
    <div className="econ-operation-body">
      <strong>{op.title}</strong>
      <small>{dateLabel(op.occurredAt)} · {op.kind === 'TRANSFER' ? accountName(op.sourceAccountId) + ' → ' + accountName(op.targetAccountId) : (op.category || kindLabel[op.kind]) + ' · ' + accountName(op.sourceAccountId)}</small>
    </div>
    <strong className={'econ-operation-amount ' + op.kind}>{op.kind === 'INCOME' ? '+' : op.kind === 'EXPENSE' ? '−' : ''}{money(op.amountMinor)}</strong>
    <button className="econ-icon-button" type="button" title="Редактировать" aria-label={'Редактировать ' + op.title} onClick={() => openDialog('operation', op)}><Pencil size={15}/></button>
    <button className="econ-icon-button econ-delete" type="button" title="Удалить" aria-label={'Удалить ' + op.title} onClick={() => void remove('operations', op.id)}><Trash2 size={15}/></button>
  </div>;

  if (loading) return <main className="econ-root econ-loading"><Loader2 className="econ-spin" size={26}/> Загружаем Economic…</main>;
  if (!snapshot || !user) return <main className="econ-root econ-loading"><h1>Economic</h1><p>{error || 'Для начала войдите в Планировыч.'}</p><a className="econ-primary-link" href="/">Вернуться в Планировыч</a></main>;

  const actions: Partial<Record<Section, () => void>> = {
    accounts: () => openDialog('account'), operations: () => openDialog('operation'),
    debts: () => openDialog('debt'), loans: () => openDialog('loan'), categories: () => openDialog('category')
  };
  return <div className="econ-root">
    <ModuleRail active="economic"/>
    <div className="econ-shell">
      <aside className="econ-nav">
        <div className="econ-nav-brand"><span className="econ-brand-logo"><CircleDollarSign size={25}/></span><div><strong>Economic</strong><small>Ваши финансы</small></div></div>
        <div className="econ-nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <div className="econ-nav-links">{nav.map(({ section: value, icon: Icon }) => <button key={value} type="button" className={section === value ? 'selected' : ''} onClick={() => { setSection(value); setError(''); }}><Icon size={18}/><span>{sectionTitles[value]}</span>{section === value && <ChevronRight size={15}/>}</button>)}</div>
        <div className="econ-nav-foot"><span className="econ-avatar">{(user.name || user.username || 'П')[0].toUpperCase()}</span><div><strong>{user.name || user.username || 'Пользователь'}</strong><small>Личный бюджет · RUB</small></div></div>
      </aside>
      <main className="econ-main">
        <header className="econ-topbar"><div><div className="econ-eyebrow">ПЛАНИРОВЫЧ / ECONOMIC</div><h1>{section === 'overview' ? 'Economic' : sectionTitles[section]}</h1></div><div className="econ-top-actions"><span className="econ-today"><CalendarDays size={15}/>{new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span><button className="econ-add-global" type="button" onClick={() => openDialog('operation')}><Plus size={18}/> Новая операция</button></div></header>
        {error && <div className="econ-error" role="alert"><span>{error}</span><button type="button" aria-label="Скрыть ошибку" onClick={() => setError('')}><X size={16}/></button></div>}
        {section === 'overview' && <>
          <div className="econ-intro"><div><span className="econ-kicker"><span className="econ-intro-star">✦</span> Личные финансы без хаоса</span><h2>Держите деньги<br/><em>под контролем.</em></h2><p>Баланс, повседневные траты, долги и кредиты в одном спокойном пространстве.</p><button type="button" onClick={() => openDialog('operation')}>Добавить операцию <ArrowUpRight size={17}/></button></div><div className="econ-intro-illustration" aria-hidden="true"><div className="econ-coin-big">₽</div><div className="econ-coin-small">₽</div><div className="econ-intro-orbit"/></div></div>
          <div className="econ-stats">
            <article className="econ-stat featured"><div className="econ-stat-label"><WalletCards size={18}/> Общий баланс</div><strong>{money(snapshot.totals.balanceMinor)}</strong><small>Все ваши счета</small></article>
            <article className="econ-stat"><div className="econ-stat-label"><ArrowDownLeft size={18}/> Доходы за месяц</div><strong className="econ-positive">{money(snapshot.totals.monthIncomeMinor)}</strong><small>Без переводов между счетами</small></article>
            <article className="econ-stat"><div className="econ-stat-label"><ArrowUpRight size={18}/> Расходы за месяц</div><strong>{money(snapshot.totals.monthExpenseMinor)}</strong><small>Без переводов между счетами</small></article>
          </div>
          <div className="econ-dashboard-grid">
            <section className="econ-card"><div className="econ-card-header"><div><h2>Мои счета</h2><p>Остатки с учётом всех операций</p></div><button type="button" onClick={() => setSection('accounts')}>Все счета <ChevronRight size={16}/></button></div><div className="econ-account-grid">{snapshot.accounts.slice(0, 4).map(a => <button type="button" className={'econ-mini-account ' + (a.isPrimary ? 'main' : '')} key={a.id} onClick={() => setSection('accounts')}><WalletCards size={20}/><span>{a.name}{a.isPrimary && <small>Основной</small>}</span><strong>{money(a.balanceMinor)}</strong></button>)}</div><button className="econ-inline-add" type="button" onClick={() => openDialog('account')}><Plus size={16}/> Добавить счёт</button></section>
            <section className="econ-card"><div className="econ-card-header"><div><h2>Долги и кредиты</h2><p>Текущие обязательства</p></div></div><div className="econ-side-metrics"><div><BookOpen size={19}/><span>Активные долги</span><strong>{snapshot.debts.filter(d => !d.isClosed).length}</strong></div><div><CreditCard size={19}/><span>Активные кредиты</span><strong>{snapshot.loans.filter(l => !l.isClosed).length}</strong></div></div><div className="econ-quick-links"><button type="button" onClick={() => openDialog('debt')}><Plus size={15}/> Долг</button><button type="button" onClick={() => openDialog('loan')}><Plus size={15}/> Кредит</button></div></section>
          </div>
          <section className="econ-card econ-recent"><div className="econ-card-header"><div><h2>Последние операции</h2><p>{snapshot.totals.operationCount ? snapshot.totals.operationCount + ' записей всего' : 'Здесь появятся доходы и расходы'}</p></div><button type="button" onClick={() => setSection('operations')}>Все операции <ChevronRight size={16}/></button></div>{snapshot.recent.length ? snapshot.recent.map(operationRow) : <div className="econ-empty">Пока нет операций. Начните с первой записи.</div>}</section>
        </>}
        {section !== 'overview' && <div className="econ-section-content">
          <div className="econ-section-heading"><p>{section === 'accounts' ? 'Управляйте счетами и начальными остатками.' : section === 'operations' ? 'История всех доходов, расходов и переводов.' : section === 'debts' ? 'Кому вы должны и кто должен вам.' : section === 'loans' ? 'Расчёт аннуитетных платежей и переплаты.' : 'Создавайте свои категории доходов и расходов.'}</p>{actions[section] && <button type="button" className="econ-action" onClick={actions[section]}><Plus size={17}/> {section === 'operations' ? 'Операция' : section === 'accounts' ? 'Счёт' : section === 'debts' ? 'Долг' : section === 'loans' ? 'Кредит' : 'Категория'}</button>}</div>
          {section === 'accounts' && <div className="econ-collection-grid">{snapshot.accounts.map(a => <article className="econ-card econ-account-detail" key={a.id}><div className="econ-card-top"><span className="econ-account-symbol"><Landmark size={22}/></span>{a.isPrimary && <span className="econ-tag">Основной</span>}</div><h3>{a.name}</h3><strong>{money(a.balanceMinor)}</strong><p>Начальный остаток: {money(a.openingBalanceMinor)}</p><div className="econ-row-actions"><button type="button" onClick={() => openDialog('account', a)}><Pencil size={15}/> Изменить</button>{!a.isPrimary && <><button type="button" onClick={() => void economicRequest('/accounts/' + a.id, 'PATCH', { isPrimary: true }).then(refresh).catch(e => setError(e.message))}><Check size={15}/> Основным</button><button type="button" onClick={() => void remove('accounts', a.id)}><Trash2 size={15}/></button></>}</div></article>)}</div>}
          {section === 'operations' && <section className="econ-card econ-operations-list"><div className="econ-filters"><select value={kindFilter} onChange={e => setKindFilter(e.target.value)} aria-label="Тип операции"><option value="">Все типы</option><option value="EXPENSE">Расходы</option><option value="INCOME">Доходы</option><option value="TRANSFER">Переводы</option></select><select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} aria-label="Счёт"><option value="">Все счета</option>{snapshot.accounts.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select><select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Категория"><option value="">Все категории</option>{[...new Set([...categories('EXPENSE'), ...categories('INCOME')])].map(c => <option value={c} key={c}>{c}</option>)}</select></div>{operations.length ? operations.map(operationRow) : <div className="econ-empty">{operationsBusy ? 'Загружаем…' : 'Нет операций по выбранным фильтрам'}</div>}{nextCursor && <button className="econ-load-more" disabled={operationsBusy} type="button" onClick={() => void loadOperations(true, nextCursor)}>{operationsBusy ? 'Загрузка…' : 'Показать ещё 50 операций'}</button>}</section>}
          {section === 'debts' && <div className="econ-collection-grid">{snapshot.debts.map(d => <article className={'econ-card econ-obligation ' + (d.isClosed ? 'closed' : '')} key={d.id}><div className="econ-obligation-type">{d.direction === 'OWE' ? 'Я должен' : 'Мне должны'}{d.isClosed && <span className="econ-tag">Закрыт</span>}</div><h3>{d.counterparty}</h3><strong>{money(d.amountMinor)}</strong><p>{d.dueAt ? 'Вернуть до ' + dateLabel(d.dueAt) : 'Срок не указан'}</p>{d.note && <p>{d.note}</p>}<div className="econ-row-actions"><button type="button" onClick={() => openDialog('debt', d)}><Pencil size={15}/> Изменить</button><button type="button" onClick={() => void remove('debts', d.id)}><Trash2 size={15}/></button></div></article>)}{!snapshot.debts.length && <div className="econ-empty econ-card">Долгов пока нет</div>}</div>}
          {section === 'loans' && <div className="econ-collection-grid">{snapshot.loans.map(l => { const figures = loanFigures(l); return <article className={'econ-card econ-obligation ' + (l.isClosed ? 'closed' : '')} key={l.id}><div className="econ-obligation-type">Аннуитетный расчёт {l.isClosed && <span className="econ-tag">Закрыт</span>}</div><h3>{l.name}</h3><strong>{money(figures.monthly)} <small>/ мес.</small></strong><div className="econ-loan-stats"><span>Сумма кредита <b>{money(l.principalMinor)}</b></span><span>Ставка <b>{String(l.annualRateBps / 100).replace('.', ',')}% годовых</b></span><span>Срок <b>{l.termMonths} мес.</b></span><span>Переплата (оценка) <b>{money(figures.overpay)}</b></span><span>Всего выплат (оценка) <b>{money(figures.total)}</b></span></div><p>Начало: {dateLabel(l.startDate)}. Без комиссий, страховок и досрочного погашения.</p><div className="econ-row-actions"><button type="button" onClick={() => openDialog('loan', l)}><Pencil size={15}/> Изменить</button><button type="button" onClick={() => void remove('loans', l.id)}><Trash2 size={15}/></button></div></article>; })}{!snapshot.loans.length && <div className="econ-empty econ-card">Кредитов пока нет</div>}</div>}
          {section === 'categories' && <div className="econ-collection-grid">{(['EXPENSE', 'INCOME'] as const).map(kind => <section className="econ-card" key={kind}><div className="econ-card-header"><h2>{kind === 'EXPENSE' ? 'Категории расходов' : 'Категории доходов'}</h2></div><div className="econ-category-list">{categories(kind).map(name => { const custom = snapshot.categories.find(c => c.kind === kind && c.name === name); return <div key={name}><span>{name}</span>{custom ? <button type="button" title="Удалить пользовательскую категорию" onClick={() => void remove('categories', custom.id)}><Trash2 size={14}/></button> : <small>Базовая</small>}</div>; })}</div><button className="econ-inline-add" type="button" onClick={() => { openDialog('category'); setForm({ kind, name: '' }); }}><Plus size={15}/> Своя категория</button></section>)}</div>}
        </div>}
        <footer className="econ-footer">Economic · Персональные данные видны только владельцу аккаунта. RUB · Учёт вручную.</footer>
      </main>
    </div>

    <EconomicMascot active={assistantOpen} onClick={() => setAssistantOpen(v => !v)}/>
    {assistantOpen && <section className="econ-assistant" role="dialog" aria-label="Economic, финансовый помощник"><div className="econ-assistant-head"><div><span className="econ-assistant-avatar">₽</span><div><strong>Economic AI</strong><small>Финансовый помощник</small></div></div><button type="button" onClick={() => setAssistantOpen(false)} aria-label="Закрыть"><X size={18}/></button></div><div className="econ-assistant-body">
      <div className="econ-insight-table"><table><caption>Брюс Хуй</caption><thead><tr><th>Счёт</th><th>Остаток</th></tr></thead><tbody>{snapshot.accounts.map(a => <tr key={a.id}><td>{a.name}</td><td>{money(a.balanceMinor)}</td></tr>)}</tbody></table></div>
      {snapshot.assistantMessages.length === 0 && <div className="econ-assistant-welcome"><MessageCircle size={21}/><strong>Чем помочь с финансами?</strong><p>Спросите о доходах, расходах, кредитах или способах вести бюджет. ИИ отвечает на основе ваших данных, но не меняет их.</p></div>}
      <div className="econ-chat-messages">{snapshot.assistantMessages.map(m => <div key={m.id} className={'econ-chat-bubble ' + (m.role === 'user' ? 'mine' : 'assistant')}>{m.content}</div>)}{assistantBusy && <div className="econ-chat-bubble assistant"><Loader2 className="econ-spin" size={17}/> Анализирую…</div>}</div>
    </div><form className="econ-assistant-composer" onSubmit={askAssistant}><input aria-label="Вопрос Economic" placeholder="Спросить об операциях и бюджете" value={assistantQuestion} onChange={e => setAssistantQuestion(e.target.value)} maxLength={2000} disabled={assistantBusy}/><button type="submit" disabled={assistantBusy || !assistantQuestion.trim()} aria-label="Отправить вопрос"><Send size={18}/></button></form><div className="econ-assistant-note">1 ИИ-кредит за запрос · Автоматических списаний по счетам нет</div></section>}

    {dialog && <div className="econ-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setDialog(null); }}><section className="econ-modal" role="dialog" aria-modal="true" aria-label="Редактирование Economic"><header><div><span className="econ-eyebrow">{dialog.id ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАПИСЬ'}</span><h2>{dialog.kind === 'operation' ? 'Операция' : dialog.kind === 'account' ? 'Счёт' : dialog.kind === 'debt' ? 'Долг' : dialog.kind === 'loan' ? 'Кредит' : 'Категория'}</h2></div><button type="button" onClick={() => setDialog(null)} aria-label="Закрыть"><X size={19}/></button></header>
      <form className="econ-form" onSubmit={submitDialog}>
        {dialog.kind === 'operation' && <><label>Тип операции<select value={form.kind} onChange={e => {formSet('kind', e.target.value);formSet('category','');}}><option value="EXPENSE">Расход</option><option value="INCOME">Доход</option><option value="TRANSFER">Перевод между счетами</option></select></label><label>Название<input required maxLength={160} value={form.title} onChange={e => formSet('title',e.target.value)} placeholder="Что купили или получили"/></label><label>Сумма, ₽<input required inputMode="decimal" value={form.amount} onChange={e => formSet('amount',e.target.value)} placeholder="0,00"/></label><label>{form.kind === 'TRANSFER' ? 'Счёт списания' : 'Счёт'}<select required value={form.sourceAccountId} onChange={e => formSet('sourceAccountId',e.target.value)}>{snapshot.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{form.kind === 'TRANSFER' && <label>Счёт зачисления<select required value={form.targetAccountId} onChange={e => formSet('targetAccountId',e.target.value)}><option value="">Выберите счёт</option>{snapshot.accounts.filter(a => a.id !== form.sourceAccountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{form.kind !== 'TRANSFER' && <label>Категория<select value={form.category} onChange={e => formSet('category',e.target.value)}><option value="">Без категории</option>{categories(form.kind as 'INCOME' | 'EXPENSE').map(c => <option key={c} value={c}>{c}</option>)}</select></label>}<label>Дата<input required type="date" value={form.date} onChange={e => formSet('date',e.target.value)}/></label><label>Примечание<input maxLength={500} value={form.note} onChange={e => formSet('note',e.target.value)} placeholder="Необязательно"/></label></>}
        {dialog.kind === 'account' && <><label>Название счёта<input required maxLength={60} value={form.name} onChange={e => formSet('name',e.target.value)} placeholder="Наличные, карта, накопления"/></label><label>Начальный остаток, ₽<input required inputMode="decimal" value={form.opening} onChange={e => formSet('opening',e.target.value)}/></label>{dialog.id && form.isPrimary !== 'yes' && <label>Статус<select value={form.isPrimary} onChange={e => formSet('isPrimary', e.target.value)}><option value="no">Дополнительный</option><option value="yes">Сделать основным</option></select></label>}<p className="econ-form-hint">Вводите только стартовый остаток. Текущий баланс рассчитывается автоматически по операциям.</p></>}
        {dialog.kind === 'debt' && <><label>Направление<select value={form.direction} onChange={e => formSet('direction', e.target.value)}><option value="OWE">Я должен</option><option value="OWED_TO_ME">Мне должны</option></select></label><label>Кому или кто<input required maxLength={100} value={form.counterparty} onChange={e => formSet('counterparty',e.target.value)} placeholder="Имя человека или организация"/></label><label>Сумма, ₽<input required inputMode="decimal" value={form.amount} onChange={e => formSet('amount',e.target.value)}/></label><label>Срок возврата (необязательно)<input type="date" value={form.date} onChange={e => formSet('date',e.target.value)}/></label><label>Примечание<input maxLength={500} value={form.note} onChange={e => formSet('note',e.target.value)}/></label>{dialog.id && <label>Состояние<select value={form.isClosed} onChange={e => formSet('isClosed', e.target.value)}><option value="no">Активный долг</option><option value="yes">Долг закрыт</option></select></label>}</>}
        {dialog.kind === 'loan' && <><label>Название кредита<input required maxLength={100} value={form.name} onChange={e => formSet('name',e.target.value)} placeholder="Автокредит, ипотека…"/></label><label>Банк / кредитор<input maxLength={100} value={form.lender} onChange={e => formSet('lender',e.target.value)}/></label><label>Сумма кредита, ₽<input required inputMode="decimal" value={form.amount} onChange={e => formSet('amount',e.target.value)}/></label><label>Ставка, % годовых<input required inputMode="decimal" value={form.rate} onChange={e => formSet('rate',e.target.value)} placeholder="12,5"/></label><label>Срок, месяцев<input required type="number" min={1} max={600} step={1} value={form.months} onChange={e => formSet('months',e.target.value)}/></label><label>Начало кредита<input required type="date" value={form.date} onChange={e => formSet('date',e.target.value)}/></label>{dialog.id && <label>Статус<select value={form.isClosed} onChange={e => formSet('isClosed', e.target.value)}><option value="no">Активен</option><option value="yes">Закрыт</option></select></label>}<p className="econ-form-hint">Расчёт аннуитетный, ориентировочный. Банковские комиссии, страховки и досрочные погашения не учитываются.</p></>}
        {dialog.kind === 'category' && <><label>Тип<select value={form.kind} onChange={e => formSet('kind',e.target.value)}><option value="EXPENSE">Расходы</option><option value="INCOME">Доходы</option></select></label><label>Название<input required maxLength={60} value={form.name} onChange={e => formSet('name',e.target.value)} placeholder="Например, питомцы"/></label></>}
        {error && <div className="econ-error" role="alert">{error}</div>}
        <div className="econ-form-actions"><button type="button" disabled={saving} onClick={() => setDialog(null)}>Отмена</button><button type="submit" disabled={saving}>{saving ? <Loader2 className="econ-spin" size={17}/> : <Check size={17}/>} Сохранить</button></div>
      </form></section></div>}
  </div>;
}
