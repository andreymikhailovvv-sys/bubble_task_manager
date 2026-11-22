/** Isolated, per-user dashboard geometry for /test-main-page. */
export type TestMainModule = 'bubbles' | 'tasks' | 'timeline' | 'notes' | 'chat' | 'habits' | 'upcoming';
export type TestMainBlock = { id: string; kind: TestMainModule; x: number; y: number; w: number; h: number };
export type TestMainLayouts = Record<string, TestMainBlock[]>;
export const TEST_MAIN_MODULES: ReadonlyArray<{ kind: TestMainModule; label: string; description: string; minW: number; minH: number; w: number; h: number }> = [
  { kind: 'bubbles', label: 'Пузыри', description: 'Основной круг задач и секторов', minW: 4, minH: 4, w: 7, h: 6 },
  { kind: 'tasks', label: 'Задачи', description: 'Список и отметки выполнения', minW: 3, minH: 3, w: 5, h: 5 },
  { kind: 'timeline', label: 'Таймлайн', description: 'Расписание по датам', minW: 4, minH: 3, w: 6, h: 4 },
  { kind: 'notes', label: 'Заметки', description: 'Настоящая доска заметок', minW: 3, minH: 4, w: 4, h: 5 },
  { kind: 'chat', label: 'Общий чат с ИИ', description: 'Диалог с Плаником', minW: 3, minH: 4, w: 4, h: 5 },
  { kind: 'habits', label: 'Привычки', description: 'Прогресс и выполнение', minW: 3, minH: 3, w: 4, h: 4 },
  { kind: 'upcoming', label: 'Ближайшие задачи', description: 'Задачи с установленным сроком', minW: 3, minH: 3, w: 4, h: 4 }
];
const byKind = new Map(TEST_MAIN_MODULES.map(item => [item.kind, item]));
const integer = (value: number) => Number.isFinite(value) ? Math.round(value) : 0;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, integer(value)));
export const testMainColumns = (width: number) => width < 720 ? 4 : width < 1150 ? 8 : 12;
export const testMainStorageKey = (userId: string) => 'btm:' + encodeURIComponent(userId) + ':test-main-page:layout:v1';
export function testMainClamp(block: TestMainBlock, columns: number): TestMainBlock {
  const spec = byKind.get(block.kind)!;
  const w = clamp(block.w, Math.min(spec.minW, columns), columns);
  const h = clamp(block.h, spec.minH, 16);
  return { ...block, x: clamp(block.x, 0, columns - w), y: clamp(block.y, 0, 300), w, h };
}
export const testMainOverlap = (a: TestMainBlock, b: TestMainBlock) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Place one block before its peers and push obstructed peers down, without overlap. */
export function testMainMove(blocks: readonly TestMainBlock[], id: string, patch: Partial<Pick<TestMainBlock, 'x' | 'y' | 'w' | 'h'>>, columns: number): TestMainBlock[] {
  const target = blocks.find(block => block.id === id);
  if (!target) return [...blocks];
  const placed: TestMainBlock[] = [testMainClamp({ ...target, ...patch }, columns)];
  for (const item of blocks) {
    if (item.id === id) continue;
    const block = testMainClamp(item, columns);
    while (placed.some(other => testMainOverlap(block, other))) block.y++;
    placed.push(block);
  }
  const indexed = new Map(placed.map(block => [block.id, block]));
  return blocks.map(block => indexed.get(block.id)!);
}
/** Add into the first empty slot. Supports any number of blocks, including duplicates. */
export function testMainAdd(blocks: readonly TestMainBlock[], kind: TestMainModule, id: string, columns: number): TestMainBlock[] {
  const spec = byKind.get(kind);
  if (!spec || blocks.some(block => block.id === id)) return [...blocks];
  const w = Math.min(columns, Math.max(spec.minW, Math.round(spec.w * columns / 12)));
  const h = spec.h;
  for (let y = 0; y < 350; y++) {
    for (let x = 0; x <= columns - w; x++) {
      const block: TestMainBlock = { id, kind, x, y, w, h };
      if (blocks.every(other => !testMainOverlap(block, other))) return [...blocks, block];
    }
  }
  return [...blocks, { id, kind, x: 0, y: Math.max(0, ...blocks.map(item => item.y + item.h)), w, h }];
}
/** Untrusted localStorage data is validated, bounded and de-overlapped. */
export function testMainNormalize(value: unknown, columns: number): TestMainBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: TestMainBlock[] = [];
  for (const raw of value.slice(0, 50)) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<TestMainBlock>;
    if (typeof candidate.id !== 'string' || candidate.id.length > 90 || !candidate.id ||
      !byKind.has(candidate.kind as TestMainModule) ||
      blocks.some(block => block.id === candidate.id)) continue;
    if (![candidate.x, candidate.y, candidate.w, candidate.h].every(v => typeof v === 'number' && Number.isFinite(v))) continue;
    const block = testMainClamp(candidate as TestMainBlock, columns);
    while (blocks.some(other => testMainOverlap(block, other))) block.y++;
    blocks.push(block);
  }
  return blocks;
}
/** Independent compact geometry per breakpoint, never mutating desktop positions. */
export function testMainReflow(blocks: readonly TestMainBlock[], columns: number): TestMainBlock[] {
  const packed: TestMainBlock[] = [];
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of sorted) {
    const spec = byKind.get(item.kind);
    if (!spec) continue;
    const w = Math.min(columns, Math.max(spec.minW, Math.round(item.w * columns / 12)));
    const h = item.h;
    let position: TestMainBlock | null = null;
    for (let y = 0; y < 350 && !position; y++) {
      for (let x = 0; x <= columns - w; x++) {
        const candidate: TestMainBlock = { ...item, x, y, w, h };
        if (packed.every(other => !testMainOverlap(candidate, other))) { position = candidate; break; }
      }
    }
    packed.push(position ?? { ...item, x: 0, y: Math.max(0, ...packed.map(block => block.y + block.h)), w, h });
  }
  return packed;
}
export function testMainDefaults(columns: number): TestMainBlock[] {
  const initial: TestMainBlock[] = [
    { id: 'starter-bubbles', kind: 'bubbles', x: 0, y: 0, w: 8, h: 6 },
    { id: 'starter-tasks', kind: 'tasks', x: 8, y: 0, w: 4, h: 6 },
    { id: 'starter-habits', kind: 'habits', x: 0, y: 6, w: 4, h: 4 },
    { id: 'starter-notes', kind: 'notes', x: 4, y: 6, w: 4, h: 5 },
    { id: 'starter-chat', kind: 'chat', x: 8, y: 6, w: 4, h: 5 }
  ];
  return columns === 12 ? initial : testMainReflow(initial, columns);
}
export function testMainReadLayouts(raw: string | null): TestMainLayouts {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const object = parsed as Record<string, unknown>;
    const result: TestMainLayouts = {};
    for (const width of [4, 8, 12] as const) {
      if (Object.prototype.hasOwnProperty.call(object, width)) result[width] = testMainNormalize(object[width], width);
    }
    return result;
  } catch { return {}; }
}
