import {useEffect, useRef} from 'react';
import {Check, ChevronDown, Menu, MessageCircle, Plus, Sparkles, Pencil, Star, Trash2} from 'lucide-react';
import type {AiChatModel} from '../lib/types';

type Chat = {id: string; title: string; messages: unknown[]};
type Project = {id: string; title: string; color: string; icon: string; chats: Chat[]};
export type MiniAiContextPicker = 'chats' | 'models' | null;

type Props = {
  project?: Project;
  chat?: Chat;
  model: AiChatModel;
  modelOptions: ReadonlyArray<{value: AiChatModel; label: string}>;
  picker: MiniAiContextPicker;
  hidden: boolean;
  telegramFullscreen: boolean;
  canCreateChat: boolean;
  onSetPicker: (picker: MiniAiContextPicker) => void;
  onShowHeader: () => void;
  onOpenMenu: () => void;
  onSelectChat: (id: string) => void;
  onSelectModel: (model: AiChatModel) => void;
  onCreateChat: () => void;
  onRenameChat: (chat: Chat) => void;
  onDeleteChat: (chat: Chat) => void;
};

/** Chat/model occupy a single compact row, with project management in the drawer. */
export function MiniGeneralAiChatHeader({
  project, chat, model, modelOptions, picker, hidden, telegramFullscreen,
  canCreateChat, onSetPicker, onShowHeader, onOpenMenu,
  onSelectChat, onSelectModel, onCreateChat, onRenameChat, onDeleteChat
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentModelLabel = modelOptions.find(option => option.value === model)?.label ?? model;
  const toggle = (next: Exclude<MiniAiContextPicker, null>) => {
    onShowHeader();
    onSetPicker(picker === next ? null : next);
  };
  useEffect(() => {
    if (!picker) return;
    dialogRef.current?.focus();
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSetPicker(null);
    };
    window.addEventListener('keydown', dismissOnEscape);
    return () => window.removeEventListener('keydown', dismissOnEscape);
  }, [picker, onSetPicker]);

  return <>
    <header className={'miniapp-ai-chat-header miniapp-ai-chat-header-general miniapp-ai-context-header miniapp-ai-context-header-compact' +
      (telegramFullscreen ? ' miniapp-ai-chat-header-telegram' : '') +
      (hidden ? ' miniapp-ai-chat-header-hidden' : '')}>
      <div className="miniapp-ai-context-compact-row">
        <button type="button" className="miniapp-ai-context-icon-button"
          aria-label="Меню проектов" onClick={onOpenMenu}><Menu size={20}/></button>
        <button type="button" className="miniapp-ai-context-control miniapp-ai-context-chat-control"
          aria-label={'Выбрать чат. Сейчас: ' + (chat?.title ?? 'Новый чат')}
          aria-haspopup="dialog" aria-expanded={picker === 'chats'} onClick={() => toggle('chats')}>
          <MessageCircle size={18} className="miniapp-ai-context-chat-icon" aria-hidden="true"/>
          <span className="miniapp-ai-context-control-copy">
            <span className="miniapp-ai-context-control-label">ЧАТ</span>
            <span className="miniapp-ai-context-control-value">{chat?.title ?? 'Новый чат'}{chat?.id === 'quick-ai-requests' ? <Star size={13} fill="currentColor" className="ml-1 inline-block align-middle text-amber-400" aria-label="Чат по умолчанию" /> : null}</span>
          </span>
          <ChevronDown size={15} className="miniapp-ai-context-chevron" aria-hidden="true"/>
        </button>
        <button type="button" className="miniapp-ai-context-control miniapp-ai-context-model-control"
          onClick={() => toggle('models')} aria-haspopup="dialog" aria-expanded={picker === 'models'}
          aria-label={'Выбрать модель ИИ. Сейчас: ' + currentModelLabel}>
          <span className="miniapp-ai-context-model-dot" aria-hidden="true"/>
          <span className="miniapp-ai-context-control-copy">
            <span className="miniapp-ai-context-control-label">МОДЕЛЬ ИИ</span>
            <span className="miniapp-ai-context-control-value">{currentModelLabel}</span>
          </span>
          <ChevronDown size={15} className="miniapp-ai-context-chevron" aria-hidden="true"/>
        </button>
      </div>
    </header>

    {picker && <div className="miniapp-ai-context-picker-layer">
      <button type="button" className="miniapp-ai-context-picker-dismiss"
        aria-label="Закрыть список" onClick={() => onSetPicker(null)}/>
      <div ref={dialogRef} tabIndex={-1} className="miniapp-ai-context-picker"
        role="dialog" aria-modal="true"
        aria-label={picker === 'chats' ? 'Выбор чата' : 'Выбор модели ИИ'}>
        <div className="miniapp-ai-context-picker-heading">
          <div>
            <h3>{picker === 'chats' ? 'Чаты' : 'Модель ИИ'}</h3>
            <p>{picker === 'chats' ? 'Проект «' + (project?.title ?? 'Проект') + '»' : 'Для текущего разговора'}</p>
          </div>
          <button type="button" className="miniapp-ai-context-picker-close"
            aria-label="Закрыть" onClick={() => onSetPicker(null)}>×</button>
        </div>
        <div className="miniapp-ai-context-picker-options" role="radiogroup" aria-label="Доступные варианты">
          {picker === 'chats' && (project?.chats ?? []).map(item => {
            const editable = item.id !== 'quick-ai-requests' && !item.id.startsWith('telegram-ai-assistant:') &&
              !item.id.startsWith('mail-ai-assistant:');
            return <div key={item.id} className="miniapp-ai-context-chat-option">
              <button type="button" className="miniapp-ai-context-picker-option"
                role="radio" aria-checked={chat?.id === item.id} onClick={() => onSelectChat(item.id)}>
                <span className="miniapp-ai-context-option-symbol"><MessageCircle size={19}/></span>
                <span className="miniapp-ai-context-option-copy">
                  <span className="miniapp-ai-context-option-title">{item.title}{item.id === 'quick-ai-requests' ? <Star size={14} fill="currentColor" className="ml-1 inline-block align-middle text-amber-400" aria-label="Чат по умолчанию" /> : null}</span>
                  <span className="miniapp-ai-context-option-subtitle">
                    {item.id === 'quick-ai-requests' ? 'Основной чат' : item.messages.length + ' сообщ.'}
                  </span>
                </span>
                {chat?.id === item.id && <Check size={20} className="miniapp-ai-context-selected-check"/>}
              </button>
              {editable && <div className="miniapp-ai-context-chat-actions">
                <button type="button" aria-label={'Переименовать ' + item.title} onClick={() => onRenameChat(item)}><Pencil size={15}/></button>
                <button type="button" disabled={(project?.chats.length ?? 0) <= 1}
                  aria-label={'Удалить ' + item.title} onClick={() => onDeleteChat(item)}><Trash2 size={15}/></button>
              </div>}
            </div>;
          })}
          {picker === 'models' && modelOptions.map(item =>
            <button type="button" key={item.value} className="miniapp-ai-context-picker-option"
              role="radio" aria-checked={model === item.value} onClick={() => onSelectModel(item.value)}>
              <span className="miniapp-ai-context-option-symbol miniapp-ai-context-model-symbol"><Sparkles size={19}/></span>
              <span className="miniapp-ai-context-option-copy"><span className="miniapp-ai-context-option-title">{item.label}</span></span>
              {model === item.value && <Check size={20} className="miniapp-ai-context-selected-check"/>}
            </button>
          )}
        </div>
        {picker === 'chats' && canCreateChat && <button type="button" className="miniapp-ai-context-picker-create"
          onClick={onCreateChat}><Plus size={19}/> Создать новый чат</button>}
      </div>
    </div>}
  </>;
}
