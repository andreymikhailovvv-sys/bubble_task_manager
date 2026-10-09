export type AiMarkdownTableData = {
  headers: string[];
  alignments: Array<'left' | 'center' | 'right'>;
  rows: string[][];
};

export type AiMarkdownSegment =
  | { type: 'text'; text: string }
  | { type: 'table'; table: AiMarkdownTableData };

/** Split a Markdown table row, retaining escaped pipes and pipes inside inline code. */
function parsePipeCells(line: string): string[] | null {
  let source = line.trim();
  if (!source.includes('|')) return null;
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !source.endsWith('\\|')) source = source.slice(0, -1);
  const cells: string[] = [];
  let buffer = '';
  let inCode = false;
  const backtick = String.fromCharCode(96);

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\' && source[index + 1] === '|') {
      buffer += '|';
      index += 1;
    } else if (char === backtick) {
      inCode = !inCode;
      buffer += char;
    } else if (char === '|' && !inCode) {
      cells.push(buffer.trim());
      buffer = '';
    } else {
      buffer += char;
    }
  }
  cells.push(buffer.trim());
  return cells.length >= 2 ? cells : null;
}

function parseDivider(cells: string[] | null, columns: number): AiMarkdownTableData['alignments'] | null {
  if (!cells || cells.length !== columns) return null;
  if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  return cells.map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
}

/** Only real header + delimiter + data-row sequences become tables. */
export function parseAiMarkdownTables(text: string): AiMarkdownSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: AiMarkdownSegment[] = [];
  let lastTextStart = 0;
  let index = 0;

  while (index + 2 < lines.length) {
    const headers = parsePipeCells(lines[index]);
    const alignments = headers ? parseDivider(parsePipeCells(lines[index + 1]), headers.length) : null;
    const firstRow = headers && alignments ? parsePipeCells(lines[index + 2]) : null;
    if (!headers || !alignments || !firstRow || firstRow.length !== headers.length) {
      index += 1;
      continue;
    }
    if (index > lastTextStart) segments.push({ type: 'text', text: lines.slice(lastTextStart, index).join('\n') });
    const rows: string[][] = [];
    let end = index + 2;
    while (end < lines.length) {
      const row = parsePipeCells(lines[end]);
      if (!row || row.length !== headers.length) break;
      rows.push(row);
      end += 1;
    }
    segments.push({ type: 'table', table: { headers, alignments, rows } });
    index = end;
    lastTextStart = end;
  }

  if (lastTextStart < lines.length) {
    segments.push({ type: 'text', text: lines.slice(lastTextStart).join('\n') });
  }
  return segments;
}
