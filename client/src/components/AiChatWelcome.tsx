import { lazy, Suspense, useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlarmClock, ArrowUpRight, BellRing, BookOpenText, CalendarClock,
  CalendarDays, CheckCheck, ChevronRight, ClipboardList, FilePenLine,
  FileSpreadsheet, FileText, Globe2, ImagePlus, ListTodo, Mail,
  MessageCircle, NotebookPen, Search, Settings2, ShieldCheck, Sparkles,
  WandSparkles, X, type LucideIcon
} from 'lucide-react';
import './AiChatWelcome.css';

const TelegramAssistantSettings = lazy(() =>
  import('./TelegramAiAssistantSettings').then(module => ({ default: module.TelegramAiAssistantSettings }))
);
const MailAssistantSettings = lazy(() =>
  import('./MailAssistantSettings').then(module => ({ default: module.MailAssistantSettings }))
);

type ChatKind = 'task' | 'general';
type Action = 'telegram' | 'mail' | 'checkups';
type Capability = { title: string; description: string; icon: LucideIcon; action?: Action };
type CapabilityGroup = { label: string; items: Capability[] };

const taskGroups: CapabilityGroup[] = [
  {
    label: 'Задача и планирование',
    items: [
      { icon: ListTodo, title: 'Управление подзадачами', description: 'Создать, изменить, выполнить или удалить подзадачу.' },
      { icon: CalendarClock, title: 'Сроки выполнения', description: 'Перенести дедлайн задачи или отдельных подзадач.' },
      { icon: Settings2, title: 'Описание и параметры', description: 'Изменить описание, важность, срочность или сектор задачи.' },
      { icon: AlarmClock, title: 'Напоминания и отложенные действия', description: 'Напомнить в нужное время или выполнить поддерживаемое действие по расписанию.' },
      { icon: ClipboardList, title: 'План работы', description: 'Разобрать задачу, составить пошаговый план и уточнить приоритеты.' }
    ]
  },
  {
    label: 'Документы и информация',
    items: [
      { icon: FilePenLine, title: 'Документы Word', description: 'Прочитать, создать или отредактировать документ DOCX.' },
      { icon: FileSpreadsheet, title: 'Таблицы Excel', description: 'Проанализировать, создать или изменить таблицу XLSX.' },
      { icon: ImagePlus, title: 'Изображения', description: 'Создать иллюстрацию или отредактировать изображение.' },
      { icon: Globe2, title: 'Поиск в интернете', description: 'Найти актуальные сведения, проверить факты и собрать материалы.' }
    ]
  },
  {
    label: 'Telegram и почта',
    items: [
      { icon: MessageCircle, title: 'Переписки Telegram', description: 'Прочитать выбранную переписку и подготовить или отправить сообщение с необходимым подтверждением.', action: 'telegram' },
      { icon: Mail, title: 'Электронная почта', description: 'Прочитать письма, подготовить ответ и отправить его при разрешённом доступе.', action: 'mail' }
    ]
  }
];

const generalGroups: CapabilityGroup[] = [
  {
    label: 'Задачи и расписание',
    items: [
      { icon: CheckCheck, title: 'Задачи и подзадачи', description: 'Создавать, изменять, выполнять и удалять задачи и их подзадачи.' },
      { icon: CalendarDays, title: 'События и напоминания', description: 'Планировать встречи, события, напоминания и привычки с повторениями.' },
      { icon: Search, title: 'Поиск по рабочему пространству', description: 'Находить задачи, подзадачи и заметки по смыслу и условиям.' },
      { icon: WandSparkles, title: 'Оптимизация расписания', description: 'Находить пересечения, предлагать подходящее время и переносить задачи.' }
    ]
  },
  {
    label: 'Ассистенты и коммуникации',
    items: [
      { icon: MessageCircle, title: 'Telegram-ассистент', description: 'Сводки по чатам, предложения ответов и задач, а при включении соответствующих режимов — автоматические действия.', action: 'telegram' },
      { icon: Mail, title: 'Почтовый ассистент', description: 'Сводки по письмам, предложения ответов и задач, а при отдельном разрешении — автоответы.', action: 'mail' },
      { icon: ShieldCheck, title: 'Чтение и отправка сообщений', description: 'Помочь с выбранной перепиской или письмом с учётом подключений и необходимых подтверждений.' }
    ]
  },
  {
    label: 'Контент и исследование',
    items: [
      { icon: FileText, title: 'Документы Word', description: 'Анализировать, создавать и редактировать документы DOCX.' },
      { icon: FileSpreadsheet, title: 'Таблицы Excel', description: 'Работать с данными, создавать и изменять файлы XLSX.' },
      { icon: ImagePlus, title: 'Изображения', description: 'Генерировать и редактировать изображения по описанию.' },
      { icon: Globe2, title: 'Поиск информации в интернете', description: 'Искать актуальные данные и готовить сводки по найденному.' }
    ]
  },
  {
    label: 'Автоматизация',
    items: [
      { icon: BookOpenText, title: 'ИИ-чекапы', description: 'Настраивать регулярный анализ дел и получать предложения по улучшению плана.', action: 'checkups' },
      { icon: BellRing, title: 'Уведомления о задачах', description: 'Получать напоминания, информацию о дедлайнах и важных изменениях.' }
    ]
  }
];

type Props = {
  kind: ChatKind;
  variant?: 'web' | 'miniapp';
  onOpenCheckups?: () => void;
};

export function AiChatWelcome({ kind, variant = 'web', onOpenCheckups }: Props) {
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [integration, setIntegration] = useState<'telegram' | 'mail' | null>(null);
  const titleId = useId();
  const groups = kind === 'task' ? taskGroups : generalGroups;

  useEffect(() => {
    if (!showCapabilities) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setShowCapabilities(false);
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [showCapabilities]);

  const runAction = (action: Action) => {
    setShowCapabilities(false);
    if (action === 'checkups') onOpenCheckups?.();
    else setIntegration(action);
  };

  const settingsDialog: ReactNode = integration ? (
    <Suspense fallback={createPortal(
      <div className="ai-capabilities-loading" role="status">Загружаем настройки…</div>,
      document.body
    )}>
      {integration === 'telegram'
        ? <TelegramAssistantSettings onClose={() => setIntegration(null)} />
        : <MailAssistantSettings onClose={() => setIntegration(null)} />}
    </Suspense>
  ) : null;

  return (
    <>
      <section className={'ai-chat-welcome ai-chat-welcome--' + kind + ' ai-chat-welcome--' + variant} aria-label="Начало диалога с ИИ">
        <span className="ai-chat-welcome__icon" aria-hidden="true"><Sparkles size={26} strokeWidth={1.8} /></span>
        <strong>ИИ готов помочь</strong>
        <p>{kind === 'task'
          ? 'Спросите, как эффективнее выполнить эту задачу, или поручите ИИ конкретное действие.'
          : 'Задайте вопрос, обсудите идею или поручите ИИ работу с задачами и материалами.'}</p>
        <button type="button" className="ai-chat-welcome__learn" onClick={() => setShowCapabilities(true)}>
          Узнать возможности чата <ChevronRight size={15} aria-hidden="true" />
        </button>
      </section>

      {showCapabilities && createPortal(
        <div className="ai-capabilities-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) setShowCapabilities(false);
        }}>
          <section className="ai-capabilities-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <header className="ai-capabilities-header">
              <span className="ai-capabilities-header__icon" aria-hidden="true"><Sparkles size={21}/></span>
              <div className="ai-capabilities-header__copy">
                <span className="ai-capabilities-eyebrow">Возможности Планировыча</span>
                <h2 id={titleId}>Что умеет ИИ в {kind === 'task' ? 'чате задачи' : 'общем чате'}</h2>
                <p>Выберите направление или просто опишите задачу своими словами.</p>
              </div>
              <button type="button" className="ai-capabilities-close" aria-label="Закрыть возможности ИИ" onClick={() => setShowCapabilities(false)}><X size={19}/></button>
            </header>
            <div className="ai-capabilities-scroll">
              {groups.map(group => (
                <section className="ai-capabilities-group" key={group.label}>
                  <h3>{group.label}</h3>
                  <div className="ai-capabilities-grid">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <article className="ai-capabilities-item" key={item.title}>
                          <span className="ai-capabilities-item__icon" aria-hidden="true"><Icon size={19} strokeWidth={1.8}/></span>
                          <div className="ai-capabilities-item__copy">
                            <strong>{item.title}</strong>
                            <p>{item.description}</p>
                            {item.action && (item.action !== 'checkups' || onOpenCheckups) ? (
                              <button type="button" className="ai-capabilities-item__link" onClick={() => runAction(item.action!)}>
                                {item.action === 'checkups' ? 'Перейти к настройкам' : 'Настроить ассистента'}
                                <ArrowUpRight size={14} aria-hidden="true"/>
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
              <footer className="ai-capabilities-note">
                <ShieldCheck size={16} aria-hidden="true"/>
                <span>Некоторые функции требуют подключённой интеграции, доступных ИИ-кредитов и подтверждения пользователя. Автоматические действия включаются отдельно.</span>
              </footer>
            </div>
          </section>
        </div>,
        document.body
      )}
      {settingsDialog}
    </>
  );
}
