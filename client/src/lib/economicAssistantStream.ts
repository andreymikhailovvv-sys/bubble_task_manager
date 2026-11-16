export type EconomicAssistantStage =
  | 'reading_finances' | 'reading_history' | 'counting_tokens'
  | 'forming_answer' | 'searching_history' | 'saving_conversation';
export type EconomicAssistantAttachment = {
  name: string; mimeType: string; size: number; contentBase64: string;
};
export type EconomicAssistantReply = {
  answer: string;
  creditsSpentMilli: number;
  inputTokens: number;
  outputTokens: number;
  attachmentNames: string[];
};

export const ECONOMIC_SUPPORTED_FILE_PATTERN = /\.(?:png|jpe?g|webp|pdf|docx|xlsx|txt|md|csv|json)$/i;
export const ECONOMIC_ACCEPTED_FILE_TYPES =
  '.png,.jpg,.jpeg,.webp,.pdf,.docx,.xlsx,.txt,.md,.csv,.json';

const SUPPORTED: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  json: 'application/json'
};
export function validateEconomicFiles(files: File[]): string | null {
  if (files.length > 3) return 'Можно прикрепить максимум три файла.';
  if (files.some(f => !ECONOMIC_SUPPORTED_FILE_PATTERN.test(f.name))) return 'Формат файла не поддерживается.';
  if (files.some(f => f.size < 1 || f.size > 3 * 1024 * 1024)) return 'Размер одного файла: не больше 3 МБ.';
  if (files.reduce((sum,f) => sum + f.size,0) > 5 * 1024 * 1024) return 'Размер всех вложений: не больше 5 МБ.';
  return null;
}
export async function encodeEconomicFiles(files: File[]): Promise<EconomicAssistantAttachment[]> {
  const error = validateEconomicFiles(files);
  if (error) throw new Error(error);
  return Promise.all(files.map(async file => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const mimeType = SUPPORTED[extension];
    // Server independently validates MIME, file signature and byte length.
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(new Error('Не удалось прочитать вложение.'));
      reader.readAsDataURL(file);
    });
    return { name: file.name, mimeType, size: file.size, contentBase64 };
  }));
}

type StreamEvent = { event: string; data: Record<string, unknown> };
export function parseEconomicSseFrames(text: string): { frames: StreamEvent[]; remainder: string } {
  const normalized = text.replace(/\r\n/g,'\n');
  const chunks = normalized.split('\n\n');
  const remainder = chunks.pop() || '';
  const frames: StreamEvent[] = [];
  for (const chunk of chunks) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (!dataLines.length) continue;
    try {
      const value: unknown = JSON.parse(dataLines.join('\n'));
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        frames.push({ event, data: value as Record<string, unknown> });
      }
    } catch { /* Invalid frames are never converted into a success result. */ }
  }
  return { frames, remainder };
}

export async function askEconomicStream(
  question: string, files: File[],
  onStage: (status: EconomicAssistantStage) => void
): Promise<EconomicAssistantReply> {
  const attachments = await encodeEconomicFiles(files);
  const response = await fetch('/api/economic/assistant/chat', {
    method: 'POST', credentials: 'include', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question, attachments })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || 'Не удалось выполнить запрос помощнику.');
  }
  if (!response.body) throw new Error('Сервер не поддерживает поток статусов.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let remainder = '';
  let result: EconomicAssistantReply | null = null;
  let serverError: string | null = null;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const parsed = parseEconomicSseFrames(remainder + decoder.decode(chunk.value, { stream: true }));
      remainder = parsed.remainder;
      for (const frame of parsed.frames) {
        if (frame.event === 'status') {
          const stage = frame.data.stage;
          if (typeof stage === 'string') onStage(stage as EconomicAssistantStage);
        } else if (frame.event === 'error') {
          serverError = typeof frame.data.error === 'string' ? frame.data.error : 'Ошибка ИИ';
        } else if (frame.event === 'result' && typeof frame.data.answer === 'string') {
          result = frame.data as EconomicAssistantReply;
        }
      }
    }
  } finally { reader.releaseLock(); }
  if (serverError) throw new Error(serverError);
  if (!result) throw new Error('Соединение прервалось до получения ответа ИИ.');
  return result;
}
