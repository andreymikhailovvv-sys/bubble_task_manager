import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, Paperclip, Plus, SendHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { AutoGrowingTextarea } from './AutoGrowingTextarea';
import { AiAttachmentTiles } from './AiAttachmentTiles';
import { CustomSelect } from './CustomSelect';
import type { AiChatModel } from '../lib/types';
import { AiReplyPreview, type AiReplyTarget } from './AiMessageReply';

export type ExpandedAiChatThread = { id: string; title: string; messages: unknown[] };
export type ExpandedAiChatProject = { id: string; title: string; color: string; icon: string; chats: ExpandedAiChatThread[] };

type Props = {
  projects: ExpandedAiChatProject[];
  activeProject?: ExpandedAiChatProject;
  activeChat?: ExpandedAiChatThread;
  quickChatId: string;
  model: AiChatModel;
  modelOptions: Array<{ value: string; label: string }>;
  pendingFiles: File[];
  loading: boolean;
  imageGenerating: boolean;
  uploadProgress?: number | null;
  messageCount: number;
  messages: ReactNode;
  status: ReactNode;
  onClose: () => void;
  onCreateProject: () => void;
  onCreateChat: () => void;
  onSelectProject: (project: ExpandedAiChatProject) => void;
  onSelectChat: (chatId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onContextMenu: (event: MouseEvent, type: 'project' | 'chat', id: string) => void;
  onModelChange: (model: AiChatModel) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (file: File) => void;
  onSend: (draft: string) => void;
  replyTo?: AiReplyTarget | null;
  onClearReply?: () => void;
};

export const ExpandedAiChat = memo(function ExpandedAiChat({ projects, activeProject, activeChat, quickChatId, model, modelOptions, pendingFiles, loading, imageGenerating, uploadProgress, messageCount, messages, status, onClose, onCreateProject, onCreateChat, onSelectProject, onSelectChat, onDeleteProject, onDeleteChat, onContextMenu, onModelChange, onAddFiles, onRemoveFile, onSend, replyTo, onClearReply }: Props) {
  const [draft, setDraft] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadContentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const previousScrollTopRef = useRef(0);
  const headerHiddenRef = useRef(false);
  const nearBottomRef = useRef(true);
  const awaitAssistantReplyRef = useRef(false);
  const previousLoadingRef = useRef(loading);
  const scrollFrameRef = useRef<number | null>(null);
  const previousChatIdRef = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    const root = composer?.parentElement;
    if (!composer || !root) return;
    const update = () => root.style.setProperty('--ai-composer-height', `${composer.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (previousChatIdRef.current !== activeChat?.id) {
      awaitAssistantReplyRef.current = false;
      container.scrollTop = container.scrollHeight;
      previousScrollTopRef.current = container.scrollTop;
      nearBottomRef.current = true;
      setHeaderHidden(false);
      headerHiddenRef.current = false;
      previousChatIdRef.current = activeChat?.id;
      return;
    }
    // When a response to our own send arrives, show it even if layout growth
    // had previously moved the bottom outside the 120px stickiness threshold.
    if (awaitAssistantReplyRef.current && previousLoadingRef.current && !loading) {
      nearBottomRef.current = true;
      awaitAssistantReplyRef.current = false;
      container.scrollTop = container.scrollHeight;
      requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
    } else if (nearBottomRef.current) container.scrollTop = container.scrollHeight;
    previousLoadingRef.current = loading;
  }, [activeChat?.id, messageCount, loading, imageGenerating]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  useEffect(() => {
    const content = threadContentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      const container = scrollRef.current;
      if (container && nearBottomRef.current) container.scrollTop = container.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      const scrollTop = container.scrollTop;
      nearBottomRef.current = container.scrollHeight - scrollTop - container.clientHeight < 120;
      let hidden = headerHiddenRef.current;
      if (scrollTop <= 8) hidden = false;
      else {
        const delta = scrollTop - previousScrollTopRef.current;
        if (Math.abs(delta) >= 8) hidden = delta > 0;
      }
      previousScrollTopRef.current = scrollTop;
      if (hidden !== headerHiddenRef.current) {
        headerHiddenRef.current = hidden;
        setHeaderHidden(hidden);
      }
    });
  }, []);

  const submit = () => {
    const value = draft.trim();
    if (loading || (!value && pendingFiles.length === 0)) return;
    nearBottomRef.current = true;
    awaitAssistantReplyRef.current = true;
    onSend(value);
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    setDraft('');
  };

  return (
    <div className="ai-chat-expanded-backdrop fixed inset-0 z-[140] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div data-tour="ai-full-chat" className={`ai-chat-expanded focus-mode-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`} onClick={(event) => event.stopPropagation()}>
        <aside className="ai-chat-expanded-sidebar focus-side-panel">
          <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Проекты</p><div className="flex gap-1"><button className="surface-muted rounded-full p-1.5" onClick={onCreateProject} aria-label="Создать проект"><Plus size={14} /></button><button className="surface-muted rounded-full p-1.5" onClick={() => setSidebarCollapsed(true)} aria-label="Свернуть панель проектов"><PanelLeftClose size={15} /></button></div></div>
          <div className="space-y-2 overflow-y-auto pr-1">{projects.map((project) => <div key={project.id} onContextMenu={(event) => { if (project.id !== 'telegram-ai-assistant-project') onContextMenu(event, 'project', project.id); }} className={`ai-chat-sidebar-project group/project flex w-full items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-sm shadow-sm ${project.id === activeProject?.id ? 'border-white/50 text-white' : 'surface-muted text-primary'}`} style={project.id === activeProject?.id ? { background: `linear-gradient(135deg, ${project.color}, #7c3aed)` } : undefined}><button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelectProject(project)}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-base">{project.icon === 'telegram' ? <svg aria-label="Telegram" role="img" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21.94 4.17a1.46 1.46 0 0 0-1.7-.23L2.1 11.1a1.18 1.18 0 0 0 .12 2.24l4.68 1.45 1.77 5.3a1.15 1.15 0 0 0 1.9.47l2.9-2.88 4.68 3.46a1.3 1.3 0 0 0 2.03-.76l2.18-14.6a1.52 1.52 0 0 0-.42-1.61Zm-3.88 3.9-8.2 7.47-.32 2.63-1.28-3.83 9.8-6.27Z"/></svg> : project.icon}</span><span className="min-w-0 flex-1 truncate font-semibold">{project.title}</span></button><button className="rounded-full p-1 opacity-60 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-20" disabled={projects.length <= 1 || project.id === 'telegram-ai-assistant-project'} onClick={() => onDeleteProject(project.id)} title="Удалить проект"><Trash2 size={13} /></button></div>)}</div>
          <div className="mt-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Чаты</p><button className="surface-muted rounded-full p-1.5 disabled:opacity-25" disabled={activeProject?.id === 'telegram-ai-assistant-project'} onClick={onCreateChat} title="Создать чат"><Plus size={14} /></button></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">{activeProject?.chats.map((chat) => <div key={chat.id} onContextMenu={(event) => { if (chat.id !== quickChatId && !chat.id.startsWith('telegram-ai-assistant:')) onContextMenu(event, 'chat', chat.id); }} className={`ai-chat-sidebar-thread group/chat flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm ${chat.id === activeChat?.id ? 'border-cyan-300 bg-cyan-500/20 text-primary' : 'surface-muted text-muted'}`}><button className="min-w-0 flex-1 text-left" onClick={() => onSelectChat(chat.id)}><span className="block truncate font-medium">{chat.title}</span><span className="block truncate text-[11px] text-subtle">{chat.id === quickChatId ? 'Чат по умолчанию' : `${chat.messages.length} сообщ.`}</span></button><button className="rounded-full p-1 opacity-50 hover:bg-rose-500/15 hover:text-rose-400 disabled:opacity-20" disabled={chat.id === quickChatId || chat.id.startsWith('telegram-ai-assistant:') || (activeProject?.chats.length ?? 0) <= 1} onClick={() => onDeleteChat(chat.id)} title="Удалить чат"><Trash2 size={13} /></button></div>)}</div>
        </aside>
        <section className="ai-chat-expanded-main" onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); onAddFiles(Array.from(event.dataTransfer.files)); }}>
          <header className={`ai-chat-expanded-header ${headerHidden ? 'is-hidden' : ''}`}>
            <button className={`ai-chat-header-button ${sidebarCollapsed ? '' : 'is-invisible'}`} onClick={() => setSidebarCollapsed(false)} aria-label="Показать панель проектов"><PanelLeftOpen size={18} /></button>
            <div className="min-w-0 flex-1"><div className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700"><Sparkles size={13} /> Чат с ИИ</div><h2 className="mt-1 truncate text-xl font-bold text-primary">{activeChat?.title ?? 'Новый чат'}</h2><p className="truncate text-xs text-muted">{activeChat?.id === quickChatId ? 'Развернутая версия быстрых запросов к ИИ' : 'ИИ поможет с вопросами, задачами и расписанием'}</p></div>
            <CustomSelect value={model} options={modelOptions} onChange={(value) => onModelChange(value as AiChatModel)} className="ai-chat-expanded-model w-40" buttonClassName="ai-chat-model-cap-button rounded-xl border px-3 py-2 text-xs font-semibold text-primary" menuClassName="ai-chat-model-cap-menu surface-popover text-primary" ariaLabel="Выбрать модель чата" />
            <button className="ai-chat-header-button" onClick={onClose} aria-label="Закрыть чат"><X size={18} /></button>
          </header>
          {dragActive ? <div className="ai-chat-drop-overlay">Перетащите файл, чтобы прикрепить его</div> : null}
          <div ref={scrollRef} onScroll={handleScroll} className="ai-chat-expanded-thread">
            <div className="ai-chat-expanded-top-spacer" aria-hidden="true" />
            <div ref={threadContentRef}>
              {messageCount === 0 ? <p className="text-sm text-subtle">Начните диалог: задайте вопрос, обсудите идею или попросите помочь с задачами.</p> : null}
              {messages}{status}
            </div>
            <div className="ai-chat-expanded-bottom-spacer" aria-hidden="true" />
          </div>
          <div ref={composerRef} className="ai-chat-expanded-composer-wrap">
            {replyTo ? <AiReplyPreview target={replyTo} onDismiss={onClearReply} /> : null}
            <AiAttachmentTiles files={pendingFiles} onRemove={onRemoveFile} busy={loading} uploadProgress={uploadProgress} />
            <div className="ai-chat-composer flex items-end gap-2 rounded-3xl border p-2"><AutoGrowingTextarea className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 text-sm leading-6 focus:outline-none focus:ring-0" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder="Напишите сообщение…" /><input ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.docx,.xls,.xlsx,image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { onAddFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} /><button className="surface-muted inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted" aria-label="Прикрепить файл" onClick={() => fileInputRef.current?.click()}><Paperclip size={17} /></button><button className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-sm hover:bg-violet-500 disabled:opacity-50" aria-label="Отправить" disabled={loading || (!draft.trim() && pendingFiles.length === 0)} onClick={submit}><SendHorizontal size={18} /></button></div>
          </div>
        </section>
      </div>
    </div>
  );
});
