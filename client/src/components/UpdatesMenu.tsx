import { useEffect, useState } from 'react';
import { BookOpen, Coins, FileSpreadsheet, FileText, ImagePlus, MessageCircle, Newspaper, SendHorizontal, Sparkles, WandSparkles, X } from 'lucide-react';

export const LATEST_NEWS_ID = '2026-10-11-ai-images-and-office-edits';

type UpdatesMenuProps = {
  open: boolean;
  onClose: () => void;
  onStartTaskTour: () => void;
  onStartAiTour: () => void;
  onStartFeatureTour: () => void;
  onStartWorkspaceTour: () => void;
  completedLessonIds: string[];
  hasUnreadNews?: boolean;
  onNewsViewed?: () => void;
};

export function UpdatesMenu({ open, onClose, onStartTaskTour, onStartAiTour, onStartFeatureTour, onStartWorkspaceTour, completedLessonIds, hasUnreadNews = false, onNewsViewed }: UpdatesMenuProps) {
  const [tab, setTab] = useState<'training' | 'news'>('training');

  useEffect(() => {
    if (open && tab === 'news') onNewsViewed?.();
  }, [open, tab, onNewsViewed]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="updates-menu-backdrop fixed inset-0 z-[180]" onMouseDown={onClose}>
      <aside className="updates-menu-panel fixed inset-y-0 left-0 flex w-[min(480px,94vw)] flex-col border-r p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="updates-menu-title">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] updates-news-date updates-news-date--violet">Планировыч AI</p><h2 id="updates-menu-title" className="mt-1 text-xl font-bold text-primary">Обновления и изменения</h2></div>
          <button type="button" className="updates-menu-close rounded-full p-2 text-muted" onClick={onClose} aria-label="Закрыть меню"><X size={19} /></button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl p-1 updates-menu-tabs">
          <button type="button" className={`rounded-lg px-2 py-2 text-sm font-semibold ${tab === 'training' ? 'updates-menu-tab-active' : 'text-muted'}`} onClick={() => setTab('training')}><BookOpen className="mr-1.5 inline" size={15} />Обучение</button>
          <button type="button" className={`relative rounded-lg px-2 py-2 text-sm font-semibold ${tab === 'news' ? 'updates-menu-tab-active' : 'text-muted'}`} onClick={() => { setTab('news'); onNewsViewed?.(); }}><Newspaper className="mr-1.5 inline" size={15} />Новости и изменения{hasUnreadNews ? <span className="absolute right-2 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">1</span> : null}</button>
        </div>
        {tab === 'training' ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted">Короткие интерактивные уроки по возможностям сервиса.</p>
            {[
              { id: 'workspace', title: 'Рабочее пространство', description: 'Режимы отображения, фильтры, таймлайн и ИИ-кредиты.', onStart: onStartWorkspaceTour },
              { id: 'tasks', title: 'Работа с задачами', description: 'Создание задач, секторы, таймлайн и быстрый ИИ.', onStart: onStartTaskTour },
              { id: 'ai', title: 'Возможности ИИ', description: 'Персональные помощники и работа с чатами.', onStart: onStartAiTour },
              { id: 'features', title: 'Фишки и интеграции', description: 'Рейтинг, режим концентрации и подключение Telegram.', onStart: onStartFeatureTour }
            ].map((lesson) => (
              <article key={lesson.title} className="updates-lesson rounded-2xl border p-4">
                <div className="flex items-start gap-3"><span className="updates-lesson-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Sparkles size={17} /></span><div><h3 className="font-semibold text-primary">{lesson.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{lesson.description}</p><span className="updates-lesson-reward mt-2 inline-flex">Награда +5 рейтинга</span></div></div>
                <button type="button" className={`mt-4 w-full rounded-xl px-3 py-2 text-sm font-semibold updates-lesson-button ${completedLessonIds.includes(lesson.id) ? 'updates-lesson-button-completed' : ''}`} onClick={lesson.onStart}>{completedLessonIds.includes(lesson.id) ? 'Пройдено' : 'Пройти'}</button>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-5 space-y-3 overflow-y-auto pr-1">
            <article className="updates-lesson updates-news-latest rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="updates-news-date updates-news-date--fuchsia text-[11px] font-semibold uppercase tracking-[0.14em]">11 октября 2026</p>
                  <h3 className="mt-1 text-base font-semibold text-primary">ИИ создаёт изображения и редактирует файлы</h3>
                </div>
                <span className="updates-lesson-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><ImagePlus size={18} /></span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">В чатах Планировыча теперь можно не только обсуждать идеи, но и получать готовые изображения и изменённые документы прямо в сообщениях.</p>
              <div className="mt-3 space-y-2.5">
                <div className="updates-news-feature updates-news-feature--image rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <WandSparkles size={17} className="shrink-0" aria-hidden="true" />
                    <h4 className="text-sm font-semibold">Создание и редактирование изображений</h4>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed">Попросите ИИ нарисовать картинку по описанию: например, «Нарисуй космический пейзаж». Готовый PNG появится с превью и кнопкой «Скачать». Можно также прикрепить свою PNG, JPG или WebP и попросить изменить фон, цвета или детали.</p>
                </div>
                <div className="updates-news-feature updates-news-feature--office rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={17} className="shrink-0" aria-hidden="true" />
                    <h4 className="text-sm font-semibold">Правки в Word и Excel</h4>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed">Прикрепите DOCX или XLSX и опишите изменения. Например, «Замени фразу в документе» или «Измени ячейку и добавь формулу». ИИ пришлёт новую версию для скачивания, сохранив исходный файл. Пока поддерживаются точечные правки абзацев, ячеек и формул.</p>
                </div>
              </div>
              <span className="updates-news-tag updates-news-tag--fuchsia mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
                <Sparkles size={13} className="shrink-0" aria-hidden="true" />
                Из идеи в готовый файл
              </span>
            </article>
            <article className="updates-lesson rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] updates-news-date updates-news-date--fuchsia">8 октября 2026</p>
                  <h3 className="mt-1 text-base font-semibold text-primary">ИИ теперь может присылать готовые Word-файлы</h3>
                </div>
                <span className="updates-lesson-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><FileText size={17} /></span>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <p><strong className="text-primary">Попросите ИИ оформить результат в Word</strong> прямо в обычном чате или в чате внутри задачи. Например: «Сделай это Word-файлом» или «Оформи результат в Word и пришли файл».</p>
                <p><strong className="text-primary">Файл появится прямо в сообщении ИИ.</strong> Его можно скачать и открыть в Microsoft Word, LibreOffice или другом редакторе DOCX.</p>
                <p><strong className="text-primary">Сборка документа происходит быстро на сервере.</strong> Сам DOCX формируется без отдельной долгой генерации, поэтому дополнительный расход AI-кредитов минимален.</p>
              </div>
              <div className="updates-news-tag updates-news-tag--fuchsia mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"><FileText size={13} /> Документы без ручного копирования</div>
            </article>
            <article className="updates-lesson rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] updates-news-date updates-news-date--cyan">7 октября 2026</p>
                  <h3 className="mt-1 text-base font-semibold text-primary">Теперь можно посмотреть, куда уходят AI-кредиты</h3>
                </div>
                <span className="updates-lesson-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Coins size={17} /></span>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <p><strong className="text-primary">В окне «Кредиты» появился раздел «Статистика».</strong> Там видно расход за сегодня, последние 7 и 30 дней, а также средний расход в день.</p>
                <p><strong className="text-primary">Расход разбит по моделям и ИИ-инструментам.</strong> Можно быстро понять, сколько кредитов ушло на GPT-6.1 Sol, Luna, чаты с ИИ, создание задач, оптимизацию таймлайна и другие функции.</p>
                <p><strong className="text-primary">Учитываются именно подтверждённые списания.</strong> Резервы и возвращённые кредиты в статистику не попадают.</p>
              </div>
              <div className="updates-news-tag updates-news-tag--cyan mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"><Coins size={13} /> Расход кредитов стал прозрачнее</div>
            </article>
            <article className="updates-lesson rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-400">6 октября 2026</p>
                  <h3 className="mt-1 text-base font-semibold text-primary">Совместные задачи стали удобнее для общения</h3>
                </div>
                <span className="updates-lesson-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><MessageCircle size={17} /></span>
              </div>
              <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                <p><strong className="text-primary">Комментарии теперь доступны у любой подзадачи</strong> на сайте, мобильной версии и в Mini App. Лента сразу открывается на свежих сообщениях, а цвета помогают быстро понять, кто что написал.</p>
                <p><strong className="text-primary">Ответы приходят именно тому человеку, которому вы ответили.</strong> В Telegram-уведомлении появилась кнопка «Ответить», она сразу открывает нужную переписку по подзадаче.</p>
                <p><strong className="text-primary">В чате задачи можно писать не только ИИ, но и участникам.</strong> Перед отправкой выберите получателя. Если выбран человек, ИИ сообщение не обрабатывает, а получатель получает обычное уведомление на сайте и в Telegram.</p>
              </div>
              <div className="updates-news-tag updates-news-tag--violet mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"><SendHorizontal size={13} /> Всё работает внутри совместной задачи</div>
            </article>
          </div>
        )}
      </aside>
    </div>
  );
}
