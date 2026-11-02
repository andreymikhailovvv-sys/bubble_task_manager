import {useEffect, useRef} from 'react';
import {Check, ChevronDown, Menu, MessageCircle, Plus, Sparkles, X} from 'lucide-react';
import type {AiChatModel} from '../lib/types';

type Chat = {id: string; title: string; messages: unknown[]};
type Project = {id: string; title: string; color: string; icon: string; chats: Chat[]};
export type MiniAiContextPicker = 'chats' | 'projects' | 'models' | null;

type Props = {
  project?: Project;
  chat?: Chat;
  projects: Project[];
  model: AiChatModel;
  modelOptions: ReadonlyArray<{value: AiChatModel; label: string}>;
  picker: MiniAiContextPicker;
  hidden: boolean;
  telegramFullscreen: boolean;
  canCreateChat: boolean;
  onSetPicker: (picker: MiniAiContextPicker) => void;
  onShowHeader: () => void;
  onOpenMenu: () => void;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
  onSelectChat: (id: string) => void;
  onSelectModel: (model: AiChatModel) => void;
  onCreateProject: () => void;
  onCreateChat: () => void;
};

function ProjectSymbol({icon, color}: {icon: string; color: string}) {
  return <span className="miniapp-ai-context-project-symbol" style={{backgroundColor: color}} aria-hidden="true">
    {icon === 'telegram' ?
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M21.94 4.17a1.46 1.46 0 0 0-1.7-.23L2.1 11.1a1.18 1.18 0 0 0 .12 2.24l4.68 1.45 1.77 5.3a1.15 1.15 0 0 0 1.9.47l2.9-2.88 4.68 3.46a1.3 1.3 0 0 0 2.03-.76l2.18-14.6a1.52 1.52 0 0 0-.42-1.61Zm-3.88 3.9-8.2 7.47-.32 2.63-1.28-3.83 9.8-6.27Z"/>
      </svg> : icon}
  </span>;
}

/** Only the navigation above the general chat. Messages and composer belong to MiniApp. */
export function MiniGeneralAiChatHeader({
  project, chat, projects, model, modelOptions, picker, hidden, telegramFullscreen,
  canCreateChat, onSetPicker, onShowHeader, onOpenMenu, onClose,
  onSelectProject, onSelectChat, onSelectModel, onCreateProject, onCreateChat
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
    <header className={'miniapp-ai-chat-header miniapp-ai-chat-header-general miniapp-ai-context-header' +
      (telegramFullscreen ? ' miniapp-ai-chat-header-telegram' : '') +
      (hidden ? ' miniapp-ai-chat-header-hidden' : '')}>
      <div className="miniapp-ai-context-main-row">
        <button type="button" className="miniapp-ai-context-icon-button"
          aria-label="Меню проектов и чатов" onClick={onOpenMenu}><Menu size={21}/></button>
        <button type="button" className="miniapp-ai-context-title"
          aria-label="Выбрать чат" aria-haspopup="dialog" aria-expanded={picker === 'chats'}
          onClick={() => toggle('chats')}>
          <span>{chat?.title ?? 'Новый чат'}</span><ChevronDown size={16} aria-hidden="true"/>
        </button>
        <button type="button" className="miniapp-ai-context-icon-button"
          aria-label="Закрыть чат с ИИ" onClick={onClose}><X size={21}/></button>
      </div>
      <div className="miniapp-ai-context-controls">
        <button type="button" className="miniapp-ai-context-control miniapp-ai-context-project-control"
          onClick={() => toggle('projects')} aria-haspopup="dialog" aria-expanded={picker === 'projects'}
          aria-label={'Выбрать проект. Сейчас: ' + (project?.title ?? 'Проект')}>
          <ProjectSymbol icon={project?.icon ?? '✨'} color={project?.color ?? '#8b5cf6'}/>
          <span className="miniapp-ai-context-control-copy">
            <span className="miniapp-ai-context-control-label">Проект</span>
            <span className="miniapp-ai-context-control-value">{project?.title ?? 'Проект'}</span>
          </span>
          <ChevronDown size={16} className="miniapp-ai-context-chevron" aria-hidden="true"/>
        </button>
        <button type="button" className="miniapp-ai-context-control miniapp-ai-context-model-control"
          onClick={() => toggle('models')} aria-haspopup="dialog" aria-expanded={picker === 'models'}
          aria-label={'Выбрать модель ИИ. Сейчас: ' + currentModelLabel}>
          <span className="miniapp-ai-context-model-dot" aria-hidden="true"/>
          <span className="miniapp-ai-context-control-copy">
            <span className="miniapp-ai-context-control-label">Модель ИИ</span>
            <span className="miniapp-ai-context-control-value">{currentModelLabel}</span>
          </span>
          <ChevronDown size={16} className="miniapp-ai-context-chevron" aria-hidden="true"/>
        </button>
      </div>
    </header>

    {picker && <div className="miniapp-ai-context-picker-layer">
      <button type="button" className="miniapp-ai-context-picker-dismiss"
        aria-label="Закрыть список" onClick={() => onSetPicker(null)}/>
      <div ref={dialogRef} tabIndex={-1} className="miniapp-ai-context-picker"
        role="dialog" aria-modal="true"
        aria-label={picker === 'chats' ? 'Выбор чата' : picker === 'projects' ? 'Выбор проекта' : 'Выбор модели ИИ'}>
        <div className="miniapp-ai-context-picker-heading">
          <div>
            <h3>{picker === 'chats' ? 'Чаты' : picker === 'projects' ? 'Проекты' : 'Модель ИИ'}</h3>
            <p>{picker === 'chats' ? 'Проект «' + (project?.title ?? 'Проект') + '»' :
              picker === 'projects' ? 'Выберите пространство для чатов' : 'Для текущего разговора'}</p>
          </div>
          <button type="button" className="miniapp-ai-context-picker-close"
            aria-label="Закрыть" onClick={() => onSetPicker(null)}><X size={18}/></button>
        </div>
        <div className="miniapp-ai-context-picker-options" role="radiogroup" aria-label="Доступные варианты">
          {picker === 'chats' && (project?.chats ?? []).map(item =>
            <button type="button" key={item.id} className="miniapp-ai-context-picker-option"
              role="radio" aria-checked={chat?.id === item.id} onClick={() => onSelectChat(item.id)}>
              <span className="miniapp-ai-context-option-symbol"><MessageCircle size={20}/></span>
              <span className="miniapp-ai-context-option-copy">
                <span className="miniapp-ai-context-option-title">{item.title}</span>
                <span className="miniapp-ai-context-option-subtitle">
                  {item.id === 'quick-ai-requests' ? 'Основной чат' : item.messages.length + ' сообщ.'}
                </span>
              </span>
              {chat?.id === item.id && <Check size={20} className="miniapp-ai-context-selected-check"/>}
            </button>
          )}
          {picker === 'projects' && projects.map(item =>
            <button type="button" key={item.id} className="miniapp-ai-context-picker-option"
              role="radio" aria-checked={project?.id === item.id} onClick={() => onSelectProject(item)}>
              <ProjectSymbol icon={item.icon} color={item.color}/>
              <span className="miniapp-ai-context-option-copy">
                <span className="miniapp-ai-context-option-title">{item.title}</span>
                <span className="miniapp-ai-context-option-subtitle">{item.chats.length} чат(ов)</span>
              </span>
              {project?.id === item.id && <Check size={20} className="miniapp-ai-context-selected-check"/>}
            </button>
          )}
          {picker === 'models' && modelOptions.map(item =>
            <button type="button" key={item.value} className="miniapp-ai-context-picker-option"
              role="radio" aria-checked={model === item.value} onClick={() => onSelectModel(item.value)}>
              <span className="miniapp-ai-context-option-symbol miniapp-ai-context-model-symbol"><Sparkles size={19}/></span>
              <span className="miniapp-ai-context-option-copy">
                <span className="miniapp-ai-context-option-title">{item.label}</span>
              </span>
              {model === item.value && <Check size={20} className="miniapp-ai-context-selected-check"/>}
            </button>
          )}
        </div>
        {picker === 'chats' && canCreateChat && <button type="button" className="miniapp-ai-context-picker-create"
          onClick={onCreateChat}><Plus size={19}/> Создать новый чат</button>}
        {picker === 'projects' && <button type="button" className="miniapp-ai-context-picker-create"
          onClick={onCreateProject}><Plus size={19}/> Создать проект</button>}
      </div>
    </div>}
  </>;
}
