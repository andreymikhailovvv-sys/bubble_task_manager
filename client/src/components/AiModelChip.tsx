import {ChevronDown} from 'lucide-react';
import {CustomSelect} from './CustomSelect';
import type {AiChatModel} from '../lib/types';

const AI_CHAT_MODEL_OPTIONS: Array<{value:AiChatModel;label:string}>=[
  {value:'gpt-6-luna',label:'GPT-6 Luna'},
  {value:'gpt-6.1-terra',label:'GPT-6.1 Terra'},
  {value:'gpt-6.1-sol',label:'GPT-6.1 Sol'}
];
const AI_CHAT_MODEL_SELECT_OPTIONS=AI_CHAT_MODEL_OPTIONS.map(({value,label})=>({value,label}));

export function AiModelChip({ value, onChange, ariaLabel, className = '', disabled = false }: { value: AiChatModel; onChange: (value: AiChatModel) => void; ariaLabel: string; className?: string; disabled?: boolean }) {
  return (
    <div className={`ai-chat-model-cap w-40 ${className}`}>
      {disabled ? <button type="button" disabled title="Модель изменяется только в настройках автомониторинга" aria-label={`${ariaLabel}: закреплена настройками автомониторинга`}
        className="ai-chat-model-cap-button flex w-full items-center justify-between gap-1 rounded-b-xl rounded-t-none border px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur">
        <span className="truncate">{AI_CHAT_MODEL_OPTIONS.find(option => option.value === value)?.label ?? 'GPT-6 Luna'}</span>
        <ChevronDown size={13} className="shrink-0 opacity-35" />
      </button> : <CustomSelect value={value} options={AI_CHAT_MODEL_SELECT_OPTIONS} onChange={(next) => onChange(next as AiChatModel)} className="w-full" buttonClassName="ai-chat-model-cap-button rounded-b-xl rounded-t-none border px-3 py-1.5 text-xs font-semibold text-primary shadow-sm backdrop-blur hover:brightness-105" menuClassName="ai-chat-model-cap-menu surface-popover text-primary" ariaLabel={ariaLabel} />}
    </div>
  );
}
