import { ChevronRight, CircleDollarSign, ListTodo } from 'lucide-react';
import './ModuleRail.css';

/** A compact edge handle reveals module navigation on hover or keyboard focus. */
export default function ModuleRail({ active }: { active: 'planner' | 'economic' }) {
  return (
    <nav className="module-rail" aria-label="Переключение модулей">
      <button className="module-rail-handle" type="button" aria-label="Показать модули" title="Модули">
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <div className="module-rail-panel">
        <a href="/" className={'module-rail-link ' + (active === 'planner' ? 'is-active' : '')}
          aria-label="Планировыч AI" aria-current={active === 'planner' ? 'page' : undefined}>
          <ListTodo size={21} strokeWidth={2} /><span>Планировыч AI</span>
        </a>
        <span className="module-rail-separator" aria-hidden="true" />
        <a href="/economic" className={'module-rail-link module-rail-economic ' + (active === 'economic' ? 'is-active' : '')}
          aria-label="Экономыч AI" aria-current={active === 'economic' ? 'page' : undefined}>
          <CircleDollarSign size={22} strokeWidth={1.9} /><span>Экономыч AI</span>
        </a>
      </div>
    </nav>
  );
}
