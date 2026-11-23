import { CircleDollarSign, ListTodo } from 'lucide-react';
import './ModuleRail.css';

/** Always-visible module icons. Labels appear only when hovered or keyboard-focused. */
export default function ModuleRail({ active }: { active: 'planner' | 'economic' }) {
  return (
    <nav className="module-rail" aria-label="Переключение модулей">
      <a href="/" className={'module-rail-link module-rail-planner ' + (active === 'planner' ? 'is-active' : '')}
        aria-label="Планировыч AI" aria-current={active === 'planner' ? 'page' : undefined}>
        <ListTodo size={21} strokeWidth={2} aria-hidden="true"/>
        <span className="module-rail-label" aria-hidden="true">Планировыч AI</span>
      </a>
      <a href="/economic" className={'module-rail-link module-rail-economic ' + (active === 'economic' ? 'is-active' : '')}
        aria-label="Экономыч AI" aria-current={active === 'economic' ? 'page' : undefined}>
        <CircleDollarSign size={22} strokeWidth={1.9} aria-hidden="true"/>
        <span className="module-rail-label" aria-hidden="true">Экономыч AI</span>
      </a>
    </nav>
  );
}
