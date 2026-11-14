import { CircleDollarSign, ListTodo } from 'lucide-react';
import './ModuleRail.css';

/** Desktop website module selector; not rendered by the Android MiniApp. */
export default function ModuleRail({ active }: { active: 'planner' | 'economic' }) {
  return (
    <nav className="module-rail" aria-label="Модули Планировыча">
      <a href="/" className={`module-rail-link ${active === 'planner' ? 'is-active' : ''}`}
        title="Планировыч AI" aria-label="Планировыч AI" aria-current={active === 'planner' ? 'page' : undefined}>
        <ListTodo size={21} strokeWidth={2} />
      </a>
      <span className="module-rail-separator" aria-hidden="true" />
      <a href="/economic" className={`module-rail-link module-rail-economic ${active === 'economic' ? 'is-active' : ''}`}
        title="Economic" aria-label="Economic" aria-current={active === 'economic' ? 'page' : undefined}>
        <CircleDollarSign size={23} strokeWidth={1.9} />
      </a>
    </nav>
  );
}
