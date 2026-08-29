import type { ReactNode } from 'react';
import { Copy } from 'lucide-react';

const CODE_BLOCK_PATTERN = /```([\w+-]+)?\n?([\s\S]*?)```/g;

function AiCodeBlock({ code, language }: { code: string; language?: string }) {
  const normalizedCode = code.replace(/\n$/, '');

  return (
    <div className="ai-code-block my-2 overflow-hidden rounded-xl border border-slate-600/70 bg-slate-950/95 text-left shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-700/70 px-3 py-1.5 text-[10px] text-slate-300">
        <span className="truncate font-mono uppercase tracking-wide">{language || 'код'}</span>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-700/80 px-2 py-1 text-[10px] font-medium text-slate-100 transition hover:bg-slate-600"
          onClick={() => { void navigator.clipboard?.writeText(normalizedCode); }}
          title="Скопировать код"
          aria-label="Скопировать код"
        >
          <Copy size={11} /> Копировать
        </button>
      </div>
      <pre className="m-0 max-w-full overflow-x-auto p-3 text-[12px] leading-5 text-cyan-100"><code>{normalizedCode}</code></pre>
    </div>
  );
}

/** Разбивает ответ ИИ на текст и fenced-блоки Markdown, не меняя текстовый рендерер чата. */
export function renderAiContentBlocks(content: string, renderText: (text: string, key: string) => ReactNode): ReactNode {
  const blocks: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CODE_BLOCK_PATTERN.lastIndex = 0;

  while ((match = CODE_BLOCK_PATTERN.exec(content)) !== null) {
    const [full, language, code] = match;
    const before = content.slice(lastIndex, match.index);
    if (before) blocks.push(renderText(before, `text-${lastIndex}`));
    blocks.push(<AiCodeBlock key={`code-${match.index}`} code={code} language={language} />);
    lastIndex = match.index + full.length;
  }

  const tail = content.slice(lastIndex);
  if (tail) blocks.push(renderText(tail, 'text-tail'));
  CODE_BLOCK_PATTERN.lastIndex = 0;

  return blocks.length > 0 ? blocks : renderText(content, 'text-only');
}
