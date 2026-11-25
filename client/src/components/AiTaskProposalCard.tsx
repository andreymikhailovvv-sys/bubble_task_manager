import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, Loader2, RotateCcw, Pencil, X } from 'lucide-react';
import { api } from '../lib/api';
import type { AiTaskProposal } from '../lib/types';
import './AiTaskProposalCard.css';
import { WorkAiMessageBody } from './WorkAiMessageBody';
import { TaskChipFields, type TaskChipValues } from './TaskChipFields';

const STATUS: Record<AiTaskProposal['status'], string> = {
  PENDING: 'Ожидает подтверждения',
  APPLYING: 'Применяется',
  APPLIED: 'Применено',
  REJECTED: 'Отклонено',
  FAILED: 'Ошибка применения',
  CONFLICT: 'Конфликт изменений',
  UNDOING: 'Возвращаем изменения',
  UNDONE: 'Изменения отменены'
};
const LABELS: Record<string, string> = {
  create_task: 'Новая задача', create_event: 'Новое событие', create_reminder: 'Новое напоминание', create_subtask: 'Новая подзадача',
  telegram_suggestion: 'Предложение задачи', rename: 'Переименование', rename_task: 'Переименование',
  rename_subtask: 'Переименование', reschedule: 'Перенос', reschedule_task: 'Перенос',
  reschedule_subtask: 'Перенос', complete: 'Завершение', complete_task: 'Завершение',
  complete_subtask: 'Завершение', delete: 'Удаление', delete_subtask: 'Удаление',
  set_priority: 'Приоритет', update_task: 'Изменение', update_subtask: 'Изменение',
  change_sphere: 'Сектор', change_task_sphere: 'Сектор', clear_due_date: 'Удаление срока',
  reopen: 'Возобновление', reopen_subtask: 'Возобновление', set_notification: 'Уведомления',
  create_note: 'Создание заметки', update_note: 'Изменение заметки', create_habit: 'Новая привычка'
};

type ProposalItem = AiTaskProposal['operations'][number];

const formatHumanDate = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(parsed);
};
const dateFromText = (text?: string | null) =>
  text?.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/i)?.[0] ?? null;

const cleanValue = (value: string) => {
  const date = dateFromText(value);
  if (date) return formatHumanDate(date);
  const statuses: Record<string,string> = { TODO: 'Не начато', IN_PROGRESS: 'В работе', DONE: 'Выполнено' };
  return statuses[value] ?? value;
};

/** Keep technical tool keys and enum values out of the user-visible card. */
function humanDescription(item: ProposalItem): string | null {
  const type = item.type;
  const currentDate = item.dueDate || dateFromText(item.after);
  const previousDate = dateFromText(item.before);
  if (['reschedule', 'reschedule_task', 'reschedule_subtask'].includes(type)) {
    return currentDate
      ? (previousDate ? `${formatHumanDate(previousDate)} → ${formatHumanDate(currentDate)}` : `Новый срок: ${formatHumanDate(currentDate)}`)
      : 'Срок изменён';
  }
  if (type === 'create_note') return null;
  if (['create_task', 'create_event', 'create_reminder', 'create_subtask', 'telegram_suggestion'].includes(type)) {
    return currentDate ? `Срок: ${formatHumanDate(currentDate)}` : null;
  }
  if (['complete', 'complete_task', 'complete_subtask'].includes(type)) return 'Отмечено выполненным';
  if (['reopen', 'reopen_subtask'].includes(type)) return 'Возобновлено';
  if (type === 'clear_due_date') return 'Срок удалён';
  if (type.startsWith('delete')) return 'Задача удалена';
  if (['change_sphere', 'change_task_sphere'].includes(type)) return 'Сектор изменён';
  if (type === 'set_notification') return 'Уведомления изменены';
  if (type === 'set_priority') return 'Приоритет изменён';
  const raw = item.after?.trim();
  if (!raw) return null;
  const translations: Record<string,string> = {
    title: 'Новое название', description: 'Описание',
    dueDate: 'Срок', importance: 'Важность', urgency: 'Срочность',
    notifyBeforeMinutes: 'Напоминание', status: 'Статус'
  };
  const parts = raw.split(' · ').map(part => {
    const index = part.indexOf(': ');
    if (index < 0) return cleanValue(part);
    const key = part.slice(0, index);
    const value = part.slice(index + 2);
    if (key === 'sphereId') return 'Сектор изменён';
    return (translations[key] ?? 'Изменено') + ': ' + cleanValue(value);
  });
  return parts.join(' · ');
}

const preferenceEvent = 'planovych-ai-task-autoapply';
export const proposalAppliedEvent = 'planovych-ai-task-proposal-applied';

export function AiTaskProposalCard({ proposal: initial, onApplied }: {
  proposal: AiTaskProposal; onApplied?: () => void;
}) {
  const [proposal, setProposal] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [modalDrafts, setModalDrafts] = useState<Record<number,TaskChipValues>>({});
  const [autoApply, setAutoApply] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndices, setSelectedIndices] = useState<number[]>(() => initial.operations.map((_, index) => index));
  const [taskDrafts,setTaskDrafts]=useState<Record<number,TaskChipValues>>(() =>
    Object.fromEntries(initial.operations.map((o,i)=>[i,{...o.editable}]))
  );
  const [spheres,setSpheres]=useState<Array<{id:string;name:string}>>([]);
  const telegram = ['telegram_assistant', 'telegram_bot', 'telegram_bot_task'].includes(proposal.source);
  const checkup = proposal.source === 'daily_checkup';
  const hasNotes = proposal.operations.some(item => ['update_note', 'create_note'].includes(item.type));
  const onlyNotes = proposal.operations.every(item => ['update_note', 'create_note'].includes(item.type));
  // Auto-applied edits arrive in the response with APPLIED already set,
  // bypassing the manual approve handler. Refresh the notes board in that case.
  useEffect(() => {
    if (initial.status === 'APPLIED') {
      if (initial.operations.some(item => ['update_note', 'create_note'].includes(item.type)))
        window.dispatchEvent(new Event('standalone-notes-updated'));
      if (initial.operations.some(item => item.type === 'create_habit'))
        window.dispatchEvent(new Event(proposalAppliedEvent));
    }
  }, [initial.id]);
  useEffect(() => {
    setSelectedIndices(initial.operations.map((_, index) => index));
    setTaskDrafts(Object.fromEntries(initial.operations.map((o,i)=>[i,{...o.editable}])));
  }, [initial.id]);
  useEffect(()=>{
    let active=true;
    void api.aiTaskProposalOptions().then(result=>{if(active)setSpheres(result.spheres)})
      .catch(()=>{});
    return ()=>{active=false};
  },[initial.id]);
  useEffect(() => {
    let active = true;
    void api.aiTaskProposal(initial.id).then(value => {
      if(active){setProposal(value);setTaskDrafts(Object.fromEntries(
        value.operations.map((o,i)=>[i,{...o.editable}])));}
    }).catch(() => {});
    if (!telegram && !checkup) void api.aiTaskProposalPreference().then(({ autoApply: auto }) => {
      if (active) setAutoApply(auto);
    }).catch(() => {});
    return () => { active = false; };
  }, [initial.id, telegram, checkup]);
  useEffect(() => {
    const sync = (event: Event) => setAutoApply(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(preferenceEvent, sync);
    return () => window.removeEventListener(preferenceEvent, sync);
  }, []);

  const setTaskField=(index:number,key:keyof TaskChipValues,value:string|number|null)=>{
    setTaskDrafts(previous=>({...previous,[index]:{...previous[index],[key]:value}}));
  };
  const synchronizeTaskEdits=async(start:AiTaskProposal, edits=taskDrafts)=>{
    let current=start;
    for(const [key,draft] of Object.entries(edits)){
      const index=Number(key),original=current.operations[index]?.editable;
      if(!original || !draft || JSON.stringify(draft)===JSON.stringify(original))continue;
      if(!current.revision)throw new Error('Не удалось определить версию чипа. Обновите чат.');
      current=await api.editAiTaskProposal(current.id,index,current.revision,draft);
    }
    setProposal(current);
    setTaskDrafts(Object.fromEntries(current.operations.map((o,i)=>[i,{...o.editable}])));
    return current;
  };
  const openEditor=()=>{
    setModalDrafts(Object.fromEntries(proposal.operations.map((o,i)=>[i,{...o.editable}])));
    setEditOpen(true);setError('');
  };
  const saveEditor=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const latest=await synchronizeTaskEdits(proposal,modalDrafts);
      setProposal(latest);setEditOpen(false);
      if(latest.status==='APPLIED'){
        window.dispatchEvent(new Event(proposalAppliedEvent));
        if(hasNotes)window.dispatchEvent(new Event('standalone-notes-updated'));
        onApplied?.();
      }
    }catch(cause){
      const actual=await api.aiTaskProposal(proposal.id).catch(()=>null);
      if(actual){setProposal(actual);setTaskDrafts(Object.fromEntries(actual.operations.map((o,i)=>[i,{...o.editable}])));}
      setError(cause instanceof Error?cause.message:'Не удалось сохранить поля.');
    }finally{setBusy(false);}
  };
  const revise=async()=>{
    if(busy||proposal.status!=='APPLIED')return;
    setBusy(true);setError('');
    try{
      const current=await synchronizeTaskEdits(proposal);
      setProposal(current);
      window.dispatchEvent(new Event(proposalAppliedEvent));
      onApplied?.();
    }catch(cause){
      const actual=await api.aiTaskProposal(proposal.id).catch(()=>null);
      if(actual){setProposal(actual);setTaskDrafts(Object.fromEntries(
        actual.operations.map((o,i)=>[i,{...o.editable}])));}
      setError(cause instanceof Error?cause.message:'Не удалось обновить задачу.');
    }finally{setBusy(false);}
  };

  const run = async (operation: 'approve' | 'reject') => {
    if (busy || proposal.status !== 'PENDING') return;
    setBusy(true); setError('');
    try {
      const current=operation==='approve'?await synchronizeTaskEdits(proposal):proposal;
      const result = operation === 'approve'
        ? await api.approveAiTaskProposal(proposal.id, checkup ? selectedIndices : undefined)
        : await api.rejectAiTaskProposal(proposal.id);
      setProposal(result);
      setTaskDrafts(Object.fromEntries(result.operations.map((o,i)=>[i,{...o.editable}])));
      if (result.status === 'APPLIED') {
        window.dispatchEvent(new Event(proposalAppliedEvent));
        if (hasNotes) window.dispatchEvent(new Event('standalone-notes-updated'));
        onApplied?.();
      }
    } catch (cause) {
      // An uncertain response may arrive after the server committed the action.
      try {
        const actual = await api.aiTaskProposal(proposal.id);
        setProposal(actual);
        if (actual.status === 'APPLIED') {
          window.dispatchEvent(new Event(proposalAppliedEvent));
          if (hasNotes) window.dispatchEvent(new Event('standalone-notes-updated'));
          onApplied?.();
        }
        else setError(cause instanceof Error ? cause.message : 'Не удалось проверить состояние');
      } catch {
        setError('Не удалось проверить статус. Обновите карточку перед повторной попыткой.');
      }
    } finally { setBusy(false); }
  };
  const undo = async () => {
    if (busy || proposal.status !== 'APPLIED') return;
    setBusy(true); setError('');
    try {
      const value = await api.undoAiTaskProposal(proposal.id);
      setProposal(value);
      if (value.status === 'UNDONE') {
        window.dispatchEvent(new Event(proposalAppliedEvent));
        if (hasNotes) window.dispatchEvent(new Event('standalone-notes-updated'));
        onApplied?.();
      }
    } catch (cause) {
      const latest = await api.aiTaskProposal(proposal.id).catch(() => null);
      if (latest) setProposal(latest);
      setError(cause instanceof Error ? cause.message : 'Не удалось отменить изменение');
    } finally {
      setBusy(false);
    }
  };
  const toggleAuto = async (next: boolean) => {
    setBusy(true); setError('');
    try {
      const preference = await api.setAiTaskProposalPreference(next);
      setAutoApply(preference.autoApply);
      window.dispatchEvent(new CustomEvent<boolean>(preferenceEvent, { detail: preference.autoApply }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить настройку');
    } finally { setBusy(false); }
  };
  const visible = (checkup || expanded ? proposal.operations : proposal.operations.slice(0, 4))
    .map((item, index) => ({ item, index }));
  const displayedSelection = proposal.status === 'APPLIED' && proposal.result?.selectedIndices
    ? proposal.result.selectedIndices : selectedIndices;
  const selectedCount = displayedSelection.length;
  const isApplied = proposal.status === 'APPLIED';

  return (
    <div className="ai-task-proposal mt-3 rounded-2xl border p-3 text-sm" data-ai-task-proposal={proposal.id}>
      <div className="flex items-center gap-2">
        <span className="ai-task-proposal__icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"><ClipboardCheck size={17} /></span>
        <div className="min-w-0 flex-1">
          <strong className="block">{checkup ? 'Предложение ИИ-чекапа' : onlyNotes ? 'Изменения заметки' : hasNotes ? 'Изменения задач и заметок' : 'Изменения задач'}</strong>
          <span className="ai-task-proposal__muted text-xs">
            {checkup && proposal.status === 'PENDING'
              ? `${selectedCount} из ${proposal.operations.length} выбрано · ${STATUS[proposal.status]}`
              : checkup && proposal.status === 'APPLIED' && proposal.result?.selectedIndices
                ? `${selectedCount} из ${proposal.result.totalOperations ?? proposal.operations.length} применено`
                : `${proposal.operations.length} действий · ${STATUS[proposal.status]}`}
          </span>
        </div>
        {isApplied ? <CheckCircle2 size={18} className="text-emerald-500" /> : null}
        {proposal.status === 'FAILED' || proposal.status === 'CONFLICT' ? <AlertTriangle size={17} className="text-amber-500" /> : null}
      </div>
      <div className="mt-3 space-y-1.5">
        {visible.map(({ item, index }) => (
          <div key={index} className="ai-task-proposal__item rounded-xl border px-3 py-2">
            <div className="flex items-start gap-3">
              {checkup ? (
                <input type="checkbox" className="mt-1 cursor-pointer"
                  checked={displayedSelection.includes(index)}
                  disabled={busy || proposal.status !== 'PENDING'}
                  aria-label={`Применить изменение: ${item.title}`}
                  onChange={(event) => setSelectedIndices(previous => event.target.checked
                    ? [...previous, index].sort((a, b) => a - b)
                    : previous.filter(value => value !== index))} />
              ) : null}
              <div className="min-w-0 flex-1">
                <span className="ai-task-proposal__muted block text-[11px]">{LABELS[item.type] ?? item.type}</span>
                <span className="block break-words font-semibold">{item.editable &&
                  ['PENDING','APPLIED'].includes(proposal.status)
                    ? (taskDrafts[index]?.title??item.editable.title??item.title) : item.title}</span>
                {item.parentTitle ? <span className="ai-task-proposal__muted block text-xs">В задаче «{item.parentTitle}»</span> : null}
                {(item.editable?.description || humanDescription(item) || item.details?.length) ? (
                  <div className="ai-task-proposal__muted ai-proposal-description mt-1 text-xs" tabIndex={0}>
                    <WorkAiMessageBody content={item.editable?.description || [humanDescription(item),...(item.details ?? [])].filter(Boolean).join('\n')}/>
                  </div>
                ) : null}
                {item.editable && ['PENDING','APPLIED'].includes(proposal.status) ?
                  <div className="ai-task-proposal__muted mt-1 space-y-0.5 break-words text-xs">
                    {item.editable.dueDate ? <div>Срок: {formatHumanDate(item.editable.dueDate)}</div> : null}
                    {item.editable.sphereId ? <div>Сектор: {spheres.find(s=>s.id===item.editable?.sphereId)?.name??'Выбран'}</div> : null}
                  </div> : null}
              </div>
            </div>
          </div>
        ))}
        {!checkup && proposal.operations.length > 4 && (
          <button type="button" className="ai-task-proposal__expand flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Свернуть' : 'Показать все изменения'}
          </button>
        )}
      </div>
      {checkup && proposal.status === 'PENDING' ? <p className="ai-task-proposal__muted mt-2 text-xs">Отметьте изменения, которые хотите внести. Неотмеченные задачи останутся без изменений.</p> : null}
      {proposal.error || error ? <p className="ai-task-proposal__error mt-2 text-xs" role="alert">{proposal.error || error}</p> : null}
      {proposal.status === 'PENDING' ? (
        <div className="mt-3 space-y-2">
          {proposal.operations.some(item=>item.editable) ? <button type="button" disabled={busy} onClick={openEditor} className="ai-task-proposal__secondary flex w-full items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs"><Pencil size={13}/>Изменить поля</button> : null}
          <div className="flex gap-2">
            <button type="button" disabled={busy || (checkup && selectedIndices.length === 0)} onClick={() => void run('approve')} className="ai-task-proposal__primary flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15}/>}{checkup ? `Применить выбранные (${selectedIndices.length})` : 'Принять'}
            </button>
            <button type="button" disabled={busy} onClick={() => void run('reject')} className="ai-task-proposal__secondary flex items-center justify-center gap-1 rounded-xl border px-3 py-2.5 font-medium disabled:opacity-50"><X size={14}/>Отклонить</button>
          </div>
          {!telegram && !checkup ? <label className="ai-task-proposal__muted flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={autoApply} disabled={busy} onChange={event => void toggleAuto(event.target.checked)} />
            Применять новые изменения автоматически
          </label> : null}
        </div>
      ) : proposal.status === 'APPLIED' ? null : (
        <p className="ai-task-proposal__muted mt-3 text-xs" role="status">{STATUS[proposal.status]}</p>
      )}
      {isApplied ? (
        <div className="ai-task-proposal__actions mt-3 flex w-full gap-2">
          {proposal.operations.some(item => item.editable) ? (
            <button type="button" disabled={busy} onClick={openEditor}
              className="ai-task-proposal__primary flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 font-semibold disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin"/> : <Pencil size={15}/>}
              Изменить
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void undo()}
            className="ai-task-proposal__secondary flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 font-semibold disabled:opacity-50">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            Отменить
          </button>
        </div>
      ) : null}
      {!telegram && !checkup && proposal.status !== 'PENDING' ? (
        <label className="ai-task-proposal__muted mt-2 flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={autoApply} disabled={busy} onChange={event => void toggleAuto(event.target.checked)} />
          Применять новые изменения автоматически
        </label>
      ) : null}
      {editOpen ? <div className="ai-task-proposal__modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setEditOpen(false)}}>
        <div className="ai-task-proposal__modal" role="dialog" aria-modal="true" aria-label="Изменить предложение ИИ">
          <div className="ai-task-proposal__modal-header"><strong>Изменить поля</strong><button type="button" disabled={busy} onClick={()=>setEditOpen(false)} aria-label="Закрыть"><X size={18}/></button></div>
          <div className="ai-task-proposal__modal-body">{proposal.operations.map((item,index)=>item.editable ? <section key={index} className="ai-task-proposal__item rounded-xl border p-3">
            <strong>{item.title}</strong><TaskChipFields value={modalDrafts[index]??item.editable} spheres={spheres} disabled={busy}
              onChange={(key,value)=>setModalDrafts(previous=>({...previous,[index]:{...previous[index],[key]:value}}))}/>
          </section> : null)}</div>
          {error ? <p role="alert" className="ai-task-proposal__error">{error}</p> : null}
          <div className="ai-task-proposal__modal-actions"><button type="button" disabled={busy} onClick={()=>setEditOpen(false)}>Отмена</button><button type="button" disabled={busy} onClick={()=>void saveEditor()}>{busy?'Сохраняем…':'Сохранить'}</button></div>
        </div>
      </div> : null}
      {isApplied && proposal.result?.createdIds?.length ? <div className="mt-2 flex flex-wrap gap-2">
        {proposal.result.createdIds.map(id => <span key={id} className="ai-task-proposal__muted text-[11px]">Создана задача · {id.slice(0, 8)}</span>)}
      </div> : null}
    </div>
  );
}
