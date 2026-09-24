import { useEffect, useState } from 'react';
import { BookOpen, Newspaper, Sparkles, X } from 'lucide-react';

type UpdatesMenuProps = {
  open: boolean;
  onClose: () => void;
  onStartTaskTour: () => void;
  onStartAiTour: () => void;
};

export function UpdatesMenu({ open, onClose, onStartTaskTour, onStartAiTour }: UpdatesMenuProps) {
  const [tab, setTab] = useState<'training' | 'news'>('training');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="updates-menu-backdrop fixed inset-0 z-[180]" onMouseDown={onClose}>
      <aside className="updates-menu-panel fixed inset-y-0 left-0 flex w-[min(390px,92vw)] flex-col border-r p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="updates-menu-title">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">Планировыч AI</p><h2 id="updates-menu-title" className="mt-1 text-xl font-bold text-primary">Обновления и изменения</h2></div>
          <button type="button" className="updates-menu-close rounded-full p-2 text-muted" onClick={onClose} aria-label="Закрыть меню"><X size={19} /></button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl p-1 updates-menu-tabs">
          <button type="button" className={`rounded-lg px-2 py-2 text-sm font-semibold ${tab === 'training' ? 'updates-menu-tab-active' : 'text-muted'}`} onClick={() => setTab('training')}><BookOpen className="mr-1.5 inline" size={15} />Обучение</button>
          <button type="button" className={`rounded-lg px-2 py-2 text-sm font-semibold ${tab === 'news' ? 'updates-menu-tab-active' : 'text-muted'}`} onClick={() => setTab('news')}><Newspaper className="mr-1.5 inline" size={15} />Новости и изменения</button>
        </div>
        {tab === 'training' ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted">Короткие интерактивные уроки по возможностям сервиса.</p>
            {[
              { title: 'Работа с задачами', description: 'Создание задач, секторы, таймлайн и быстрый ИИ.', onStart: onStartTaskTour },
              { title: 'Возможности ИИ', description: 'Персональные помощники и работа с чатами.', onStart: onStartAiTour },
              { title: 'Фишки и интеграции', description: 'Полезные сценарии и внешние сервисы.', onStart: null }
            ].map((lesson) => (
              <article key={lesson.title} className="updates-lesson rounded-2xl border p-4">
                <div className="flex items-start gap-3"><span className="updates-lesson-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Sparkles size={17} /></span><div><h3 className="font-semibold text-primary">{lesson.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted">{lesson.description}</p></div></div>
                <button type="button" disabled={!lesson.onStart} className="mt-4 w-full rounded-xl px-3 py-2 text-sm font-semibold updates-lesson-button disabled:cursor-not-allowed disabled:opacity-45" onClick={lesson.onStart ?? undefined}>{lesson.onStart ? 'Пройти' : 'Скоро'}</button>
              </article>
            ))}
          </div>
        ) : <div className="mt-8 rounded-2xl border border-dashed p-8 text-center text-sm text-muted">Раздел появится позже</div>}
      </aside>
    </div>
  );
}
