import { Globe2 } from 'lucide-react';
import type { WebSource } from '../lib/types';

export function WebCitations({ sources, searched = false }: { sources?: WebSource[]; searched?: boolean }) {
  if (!searched && !sources?.length) return null;
  const validSources = (sources ?? []).filter(source => {
    try { return new URL(source.url).protocol === 'https:'; } catch { return false; }
  });
  return <aside className="mt-3 border-t border-current/10 pt-2 text-xs" aria-label="Источники веб-поиска">
    <div className="mb-1.5 flex items-center gap-1.5 font-semibold"><Globe2 size={13} /> Поиск в интернете</div>
    <ol className="mt-1 space-y-1">{validSources.map((source, index) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">[{index + 1}] {source.title}</a></li>)}</ol>
    {validSources.length === 0 ? <p className="mt-1 text-muted">Поиск выполнен, но сервис не передал ссылки на источники.</p> : null}
  </aside>;
}
