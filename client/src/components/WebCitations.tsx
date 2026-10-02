import { Globe2 } from 'lucide-react';
import type { WebSource } from '../lib/types';

export function WebCitations({ sources }: { sources?: WebSource[] }) {
  if (!sources?.length) return null;
  return <aside className="mt-3 border-t border-current/10 pt-2 text-xs" aria-label="Источники веб-поиска">
    <div className="mb-1.5 flex items-center gap-1.5 font-semibold"><Globe2 size={13} /> Поиск в интернете</div>
    <div className="mb-1 flex flex-wrap gap-1" aria-label="Ссылки в тексте">{sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="underline">[{index + 1}]</a>)}</div>
    <div className="font-semibold">Источники</div>
    <ol className="mt-1 space-y-1">{sources.map((source, index) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">[{index + 1}] {source.title}</a></li>)}</ol>
  </aside>;
}
