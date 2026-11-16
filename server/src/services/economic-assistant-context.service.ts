import { estimateTaskChatTokens } from './task-chat-context.service.js';

export type EconomicChatHistoryRow = {
  role: string; content: string; createdAt: Date;
};
export type EconomicAttachment = {
  name: string; mimeType: string; size: number; contentBase64: string;
};
export type EconomicInputPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'input_file'; filename: string; file_data: string };

const ALLOWED = new Map<string, string>([
  ['png','image/png'], ['jpg','image/jpeg'], ['jpeg','image/jpeg'],
  ['webp','image/webp'], ['pdf','application/pdf'],
  ['txt','text/plain'], ['md','text/markdown'], ['csv','text/csv'],
  ['json','application/json'], ['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
]);
export const ECONOMIC_MAX_ATTACHMENTS = 3;
export const ECONOMIC_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_FILE = 3 * 1024 * 1024;
const isMime = (mime: string, extension: string) =>
  mime === ALLOWED.get(extension) || (extension === 'md' && mime === 'text/plain') ||
  (extension === 'csv' && (mime === 'text/plain' || mime === 'application/vnd.ms-excel')) ||
  (extension === 'jpg' && mime === 'image/jpg');

export function prepareEconomicAttachments(value: unknown): {
  names: string[]; content: EconomicInputPart[]; totalBytes: number;
} {
  if (value === undefined || value === null) return { names: [], content: [], totalBytes: 0 };
  if (!Array.isArray(value) || value.length > ECONOMIC_MAX_ATTACHMENTS) throw new Error('Можно прикрепить не больше трёх файлов.');
  const content: EconomicInputPart[] = [];
  const names: string[] = [];
  let totalBytes = 0;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new Error('Некорректный файл.');
    const file = raw as Partial<EconomicAttachment>;
    const name = typeof file.name === 'string' ? file.name.trim() : '';
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const mime = typeof file.mimeType === 'string' ? file.mimeType.split(';')[0].toLowerCase().trim() : '';
    if (!name || name.length > 130 || name.includes('/') || name.includes('\\') || !isMime(mime, extension)) {
      throw new Error('Неподдерживаемое имя или формат вложения.');
    }
    if (typeof file.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) {
      throw new Error('Некорректное содержимое вложения.');
    }
    if (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE) {
      throw new Error('Файл слишком большой. Максимум 3 МБ.');
    }
    const bytes = Buffer.from(file.contentBase64, 'base64');
    if (bytes.length !== file.size) throw new Error('Размер файла не совпадает с вложением.');
    totalBytes += bytes.length;
    if (totalBytes > ECONOMIC_MAX_ATTACHMENT_BYTES) throw new Error('Общий размер вложений не должен превышать 5 МБ.');
    if (mime.startsWith('image/')) {
      const valid = mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
        mime === 'image/webp' ? bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' :
        bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!valid) throw new Error('Некорректный формат изображения.');
      content.push({ type: 'input_image', image_url: 'data:' + (mime === 'image/jpg' ? 'image/jpeg' : mime) + ';base64,' + file.contentBase64 });
    } else if (extension === 'txt' || extension === 'md' || extension === 'csv' || extension === 'json') {
      let decoded = '';
      try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('Текстовый файл должен быть в UTF-8.'); }
      if (decoded.length > 36_000) throw new Error('Слишком большой текстовый файл: максимум 36 000 символов.');
      content.push({ type: 'input_text', text: 'Вложение «' + name + '»:\n' + decoded });
    } else {
      const expected = extension === 'pdf' ? '%PDF-' : 'PK';
      if (bytes.toString('ascii',0,expected.length) !== expected) throw new Error('Неверный формат документа.');
      // Responses accepts base64 input_file for PDF and supported Office documents.
      content.push({ type: 'input_file', filename: name, file_data: 'data:' + ALLOWED.get(extension) + ';base64,' + file.contentBase64 });
    }
    names.push(name);
  }
  return { names, content, totalBytes };
}

export function selectEconomicHistory(
  rowsOldestFirst: EconomicChatHistoryRow[],
  tokenBudget = 3000,
  maxMessages = 22
): { messages: Array<{role:'user'|'assistant'; content:string}>; estimatedTokens:number } {
  let used = 0;
  const selected: Array<{role:'user'|'assistant';content:string}> = [];
  for (let i = rowsOldestFirst.length - 1; i >= 0 && selected.length < maxMessages; i--) {
    const row = rowsOldestFirst[i];
    if (row.role !== 'user' && row.role !== 'assistant') continue;
    const content = row.content.trim();
    const tokens = estimateTaskChatTokens(content) + 5;
    if (!content) continue;
    if (tokens > tokenBudget - used) break;
    selected.unshift({ role: row.role, content });
    used += tokens;
  }
  return { messages: selected, estimatedTokens: used };
}

export function searchEconomicHistoryTerm(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const query = value.trim().replace(/\s+/g, ' ').slice(0,100);
  return query.length >= 2 ? query : null;
}
