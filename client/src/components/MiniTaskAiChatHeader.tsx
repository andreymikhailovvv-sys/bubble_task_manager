import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Check, ChevronDown, Sparkles, X } from 'lucide-react';
import type { AiChatModel } from '../lib/types';

type Props = {
  taskId: string;
  taskTitle: string;
  model: AiChatModel;
  modelOptions: ReadonlyArray<{ value: AiChatModel; label: string }>;
  monitoringEnabled: boolean;
  monitoringControl: ReactNode;
  hidden: boolean;
  telegramFullscreen: boolean;
  onSelectModel: (model: AiChatModel) => void;
  onClose: () => void;
};

/** Task chat uses the same navigation hierarchy and picker surfaces as general AI chat. */
export function MiniTaskAiChatHeader({
  taskId, taskTitle, model, modelOptions, monitoringEnabled, monitoringControl,
  hidden, telegramFullscreen, onSelectModel, onClose
}: Props) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelLabel = modelOptions.find(option => option.value === model)?.label ?? model;
  useEffect(() => { setModelPickerOpen(false); }, [taskId, monitoringEnabled, hidden]);
  useEffect(() => {
    if (!modelPickerOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelPickerOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [modelPickerOpen]);

  return <>
    <header className={'miniapp-ai-chat-header miniapp-ai-chat-header-task miniapp-ai-context-header miniapp-task-ai-context-header' +
      (telegramFullscreen ? ' miniapp-ai-chat-header-telegram-task' : '') +
      (hidden ? ' miniapp-ai-chat-header-hidden' : '')}>
      <div className="miniapp-ai-context-main-row">
        <span className="miniapp-ai-context-icon-button miniapp-task-ai-context-symbol" aria-hidden="true"><Bot size={21}/></span>
        <div className="miniapp-ai-context-title miniapp-task-ai-context-title" title={taskTitle}>
          <span>{taskTitle}</span>
        </div>
        <button type="button" className="miniapp-ai-context-icon-button"
          aria-label="Закрыть диалог с ИИ и вернуться к задаче" onClick={onClose}><X size={21}/></button>
      </div>
      <div className="miniapp-ai-context-controls miniapp-task-ai-context-controls">
        <button type="button" className="miniapp-ai-context-control miniapp-ai-context-model-control"
          onClick={() => setModelPickerOpen(value => !value)}
          disabled={monitoringEnabled}
          aria-haspopup="dialog" aria-expanded={modelPickerOpen}
          aria-label={monitoringEnabled ? 'Модель ИИ закреплена автомониторингом' : 'Выбрать модель ИИ. Сейчас: ' + modelLabel}>
          <span className="miniapp-ai-context-model-dot" aria-hidden="true"/>
          <span className="miniapp-ai-context-control-copy">
            <span className="miniapp-ai-context-control-label">Модель ИИ</span>
            <span className="miniapp-ai-context-control-value">{modelLabel}</span>
          </span>
          <ChevronDown size={16} className="miniapp-ai-context-chevron" aria-hidden="true"/>
        </button>
        <div className="miniapp-ai-context-control miniapp-task-ai-monitor-control">
          <span className="miniapp-ai-context-control-copy">
            <span className="miniapp-ai-context-control-label">Режим</span>
            <span className="miniapp-ai-context-control-value">{monitoringEnabled ? 'Автомониторинг' : 'По запросу'}</span>
          </span>
          {monitoringControl}
        </div>
      </div>
    </header>
    {modelPickerOpen && !monitoringEnabled && <div className="miniapp-ai-context-picker-layer">
      <button type="button" className="miniapp-ai-context-picker-dismiss"
        aria-label="Закрыть выбор модели" onClick={() => setModelPickerOpen(false)}/>
      <div className="miniapp-ai-context-picker" role="dialog" aria-modal="true" aria-label="Выбор модели ИИ">
        <div className="miniapp-ai-context-picker-heading">
          <div><h3>Модель ИИ</h3><p>Для задачи «{taskTitle}»</p></div>
          <button type="button" className="miniapp-ai-context-picker-close" onClick={() => setModelPickerOpen(false)}
            aria-label="Закрыть"><X size={18}/></button>
        </div>
        <div className="miniapp-ai-context-picker-options" role="radiogroup" aria-label="Доступные модели">
          {modelOptions.map(option =>
            <button type="button" className="miniapp-ai-context-picker-option" key={option.value}
              role="radio" aria-checked={model === option.value}
              onClick={() => { onSelectModel(option.value); setModelPickerOpen(false); }}>
              <span className="miniapp-ai-context-option-symbol miniapp-ai-context-model-symbol"><Sparkles size={19}/></span>
              <span className="miniapp-ai-context-option-copy"><span className="miniapp-ai-context-option-title">{option.label}</span></span>
              {model === option.value ? <Check size={20} className="miniapp-ai-context-selected-check"/> : null}
            </button>
          )}
        </div>
      </div>
    </div>}
  </>;
}
