import type { ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { parseAiMarkdownTables, type AiMarkdownTableData } from '../lib/aiMarkdownTables';

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

function renderTableCell(value: string): string {
  // Task references are UI directives, never expose their internal IDs as table text.
  return value
    .replace(/\[\[task_ref:[^|\]]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[\[task_ref=[^\]]+\]\]/g, '')
    .trim();
}

function AiMarkdownTable({ table }: { table: AiMarkdownTableData }) {
  return (
    <div className="ai-markdown-table-scroll my-2 max-w-full overflow-x-auto rounded-xl border" role="region" aria-label="Таблица в ответе ИИ" tabIndex={0}>
      <table className="ai-markdown-table w-full border-collapse text-left text-xs">
        <thead>
          <tr>
            {table.headers.map((header, index) => (
              <th key={index} scope="col" style={{ textAlign: table.alignments[index] }}>{renderTableCell(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ textAlign: table.alignments[cellIndex] }}>{renderTableCell(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderTextAndTables(text: string, keyPrefix: string, renderText: (text: string, key: string) => ReactNode): ReactNode {
  const segments = parseAiMarkdownTables(text);
  if (segments.length === 1 && segments[0].type === 'text') return renderText(text, keyPrefix);
  return segments.map((segment, index) => (
    segment.type === 'table'
      ? <AiMarkdownTable key={keyPrefix + '-table-' + index} table={segment.table} />
      : <div key={keyPrefix + '-text-' + index}>{renderText(segment.text, keyPrefix + '-text-' + index)}</div>
  ));
}

/** Render code fences separately so pipes inside source code are never mistaken for tables. */

export function renderAiContentBlocks(content: string, renderText: (text: string, key: string) => ReactNode): ReactNode {
  const blocks: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CODE_BLOCK_PATTERN.lastIndex = 0;

  while ((match = CODE_BLOCK_PATTERN.exec(content)) !== null) {
    const [full, language, code] = match;
    const before = content.slice(lastIndex, match.index);
    if (before) blocks.push(renderTextAndTables(before, 'text-' + lastIndex, renderText));
    blocks.push(<AiCodeBlock key={`code-${match.index}`} code={code} language={language} />);
    lastIndex = match.index + full.length;
  }

  const tail = content.slice(lastIndex);
  if (tail) blocks.push(renderTextAndTables(tail, 'text-tail', renderText));
  CODE_BLOCK_PATTERN.lastIndex = 0;

  return blocks.length > 0 ? blocks : renderTextAndTables(content, 'text-only', renderText);
}
