import { prisma } from '../db/prisma.js';
import { taskAccessWhere } from '../lib/task-access.js';
import { getOfficeDocumentPreview } from './ooxml-document-editor.js';
import { sourceFormat, editUserDocumentIfRequested } from './ai-user-document-edit.service.js';
import { validateUploadedImage } from './ai-user-image-input.js';
import { generateAiImage, AI_IMAGE_MAX_REFERENCE_FILES } from './ai-image-generation.service.js';
import type { ValidatedImage } from './ai-user-image-input.js';
import type { AiFileCatalog } from './ai-file-catalog.service.js';
import type { GeneratedDocumentMeta } from './word-document.service.js';

export const AI_READ_FILE_TOOL = {
  type: 'function', name: 'read_file', strict: true,
  description: 'Прочитать конкретный файл из каталога по точному fileId. Вызывай для вопросов о содержимом. Никогда не угадывай содержимое по названию файла. Если выбор неоднозначен, попроси уточнить вместо вызова инструмента.',
  parameters: { type: 'object', additionalProperties: false, required: ['fileId'], properties: { fileId: { type: 'string' } } }
} as const;
export const AI_EDIT_FILE_TOOL = {
  type: 'function', name: 'edit_file', strict: true,
  description: 'Изменить существующий файл из каталога с точным fileId. Для изображений fileId — обязательное исходное изображение, а referenceFileIds — до 4 дополнительных изображений из каталога для вставки объектов/стиля. Для Word/Excel referenceFileIds оставь пустым. Не подбирай старые файлы автоматически и не угадывай ID. Для PDF редактирование недоступно.',
  parameters: { type: 'object', additionalProperties: false, required: ['fileId', 'instruction', 'referenceFileIds'], properties: {
    fileId: { type: 'string' }, instruction: { type: 'string' },
    referenceFileIds: { type: 'array', items: { type: 'string' }, description: 'Точные fileId дополнительных изображений-референсов, максимум 4. Пустой массив, если не нужны.' }
  } }
} as const;

type RawFile = { name: string; mimeType: string; size: number; contentBase64: string };
export type FileToolContext = {
  userId: string;
  taskId?: string;
  projectId?: string;
  chatId?: string;
  catalog: AiFileCatalog;
  uploads?: RawFile[];
  model: string;
  apiKey: string;
  actionId: string;
  dynamicBilling: boolean;
};
export type FileToolResult = {
  response: { ok: boolean; code?: string; message?: string; fileName?: string; fileId?: string; text?: string; truncated?: boolean; format?: string };
  modelAttachment?: RawFile;
  document?: GeneratedDocumentMeta;
  creditsSpentMilli?: number;
};

const maxReadCharacters = 42_000;
const validIdentifier = (text: unknown) => typeof text === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(text);

async function resolveFile(input: FileToolContext, fileId: unknown): Promise<RawFile | null> {
  if (typeof fileId !== 'string' || !input.catalog.items.some((entry) => entry.fileId === fileId)) return null;
  const [source, key] = fileId.split(':');
  if (!key) return null;
  if (source === 'current') {
    if (!/^\d+$/.test(key)) return null;
    const index = Number(key);
    return Number.isSafeInteger(index) && index >= 0 ? input.uploads?.[index] ?? null : null;
  }
  if (!validIdentifier(key)) return null;
  if (input.taskId) {
    const task = await prisma.task.findFirst({
      where: { id: input.taskId, AND: [taskAccessWhere(input.userId)] }, select: { id: true, parentTaskId: true }
    });
    if (!task) return null;
    if (source === 'task_attachment') {
      if (task.parentTaskId) return null;
      const file = await prisma.taskAttachment.findFirst({
        where: { id: key, taskId: input.taskId, userId: input.userId },
        select: { name: true, mimeType: true, size: true, contentBase64: true }
      });
      return file ?? null;
    }
  }
  if (source === 'generated_document') {
    const file = await prisma.aiGeneratedDocument.findFirst({
      where: { id: key, userId: input.userId, taskId: input.taskId ?? null },
      select: { fileName: true, mimeType: true, size: true, contentBase64: true }
    });
    return file ? { name: file.fileName, mimeType: file.mimeType, size: file.size, contentBase64: file.contentBase64 } : null;
  }
  if (source === 'chat_upload') {
    const file = await prisma.aiConversationAttachment.findFirst({
      where: { id: key, userId: input.userId, ...(input.taskId
        ? { taskId: input.taskId }
        : { taskId: null, projectId: input.projectId ?? null, chatId: input.chatId ?? null }) },
      select: { fileName: true, mimeType: true, size: true, contentBase64: true }
    });
    return file ? { name: file.fileName, mimeType: file.mimeType, size: file.size, contentBase64: file.contentBase64 } : null;
  }
  return null;
}

/** Resolve selected images through the same catalog and ownership checks as read_file.
 * Catalog metadata alone never grants access. No guessed, unrelated or inaccessible
 * file is silently discarded from a requested multi-image edit.
 */
export async function resolveCatalogImageReferences(input: FileToolContext, fileIds: string[]): Promise<ValidatedImage[]> {
  if (!Array.isArray(fileIds) || fileIds.length > AI_IMAGE_MAX_REFERENCE_FILES ||
      new Set(fileIds).size !== fileIds.length ||
      fileIds.some((id) => typeof id !== 'string' || !input.catalog.items.some((entry) => entry.fileId === id))) {
    throw new TypeError('Указаны некорректные или недоступные изображения-референсы.');
  }
  const images: ValidatedImage[] = [];
  for (const id of fileIds) {
    const metadata = input.catalog.items.find((entry) => entry.fileId === id);
    if (!metadata || /\.(?:docx?|xlsx?|xlsm|pdf)$/i.test(metadata.fileName) ||
        (!metadata.mimeType.startsWith('image/') && !/\.(?:png|jpe?g|webp)$/i.test(metadata.fileName))) {
      throw new TypeError('В списке референсов есть файл, который не является изображением.');
    }
    const file = await resolveFile(input, id);
    if (!file) throw new TypeError('Изображение-референс недоступно или доступ отозван.');
    images.push(validateUploadedImage(file));
  }
  return images;
}

export function validateFileToolRequest(value: unknown, operation: 'read' | 'edit'): { fileId: string; instruction: string; referenceFileIds: string[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const request = value as Record<string, unknown>;
  if (typeof request.fileId !== 'string' || request.fileId.length > 160) return null;
  if (operation === 'edit' && (typeof request.instruction !== 'string' || request.instruction.trim().length < 3 || request.instruction.length > 5000)) return null;
  const referenceFileIds = request.referenceFileIds === undefined ? [] : request.referenceFileIds;
  if (!Array.isArray(referenceFileIds) || referenceFileIds.length >= AI_IMAGE_MAX_REFERENCE_FILES ||
      referenceFileIds.some((id) => typeof id !== 'string' || id.length < 3 || id.length > 160) ||
      new Set(referenceFileIds).size !== referenceFileIds.length || referenceFileIds.includes(request.fileId)) return null;
  return { fileId: request.fileId, instruction: operation === 'edit' ? String(request.instruction) : '', referenceFileIds: referenceFileIds as string[] };
}

export async function executeAiFileTool(input: FileToolContext, operation: 'read' | 'edit', rawArgs: unknown): Promise<FileToolResult> {
  const args = validateFileToolRequest(rawArgs, operation);
  if (!args) return { response: { ok: false, code: 'INVALID_ARGUMENTS' } };
  const metadata = input.catalog.items.find((item) => item.fileId === args.fileId);
  if (!metadata) return { response: { ok: false, code: 'FILE_NOT_IN_CATALOG', message: 'Сначала уточните конкретный файл из каталога.' } };
  const file = await resolveFile(input, args.fileId);
  if (!file) return { response: { ok: false, code: 'FILE_NOT_AVAILABLE', message: 'Файл не найден или доступ отозван.' } };
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 8 * 1024 * 1024 ||
      typeof file.contentBase64 !== 'string' || file.contentBase64.length > 11_200_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(file.contentBase64)) return { response: { ok: false, code: 'INVALID_FILE' } };
  const bytes = Buffer.from(file.contentBase64, 'base64');
  if (bytes.length !== file.size) return { response: { ok: false, code: 'INVALID_FILE' } };
  const format = sourceFormat(file.name, file.mimeType);

  if (operation === 'read') {
    if (file.mimeType === 'text/plain' || /\.txt$/i.test(file.name)) {
      const text = bytes.toString('utf8').replace(/\u0000/g, '');
      return { response: { ok: true, fileName: metadata.fileName, fileId: args.fileId,
        format: 'txt', text: text.slice(0, maxReadCharacters), truncated: text.length > maxReadCharacters } };
    }
    if (format) {
      try {
        const preview = getOfficeDocumentPreview(bytes, format, {
          maxCharacters: maxReadCharacters, maxParagraphs: 1_000, maxSheetRows: 300
        });
        return { response: { ok: true, fileName: metadata.fileName, fileId: args.fileId,
          format, text: preview.text.slice(0, maxReadCharacters),
          truncated: preview.truncated === true || preview.text.length > maxReadCharacters } };
      } catch {
        return { response: { ok: false, code: 'UNREADABLE_FILE', message: 'Не удалось прочитать этот Word/Excel-файл.' } };
      }
    }
    if (/\.pdf$/i.test(file.name) || /^application\/pdf$/i.test(file.mimeType) ||
        /^image\//i.test(file.mimeType) || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
      return { response: { ok: true, fileName: metadata.fileName, fileId: args.fileId, format: 'multimodal' }, modelAttachment: file };
    }
    return { response: { ok: false, code: 'UNSUPPORTED_FORMAT', message: 'Чтение этого формата пока недоступно.' } };
  }

  if (format) {
    if (args.referenceFileIds.length) return { response: { ok: false, code: 'UNSUPPORTED_REFERENCES', message: 'Референсы изображений разрешены только при редактировании изображений.' } };
    const result = await editUserDocumentIfRequested({
      userId: input.userId, taskId: input.taskId, question: args.instruction,
      attachments: [file], apiKey: input.apiKey, model: input.model, explicitFileToolSelection: true
    });
    if (!result?.generatedDocument) return { response: { ok: false, code: 'NO_EDITS', message: result?.answer ?? 'Редактирование не выполнено.' } };
    return { response: { ok: true, fileName: result.generatedDocument.fileName, fileId: args.fileId, format, message: result.answer },
      document: result.generatedDocument, creditsSpentMilli: result.billing.creditsSpentMilli };
  }
  if (/^image\//i.test(file.mimeType) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
    const imageSources = [validateUploadedImage(file), ...await resolveCatalogImageReferences(input, args.referenceFileIds)];
    const edited = await generateAiImage({
      userId: input.userId, taskId: input.taskId, actionId: input.actionId,
      apiKey: input.apiKey, args: { prompt: args.instruction, size: 'auto' },
      sourceImages: imageSources
    });
    return { response: { ok: true, fileName: edited.document.fileName, fileId: args.fileId, format: 'image', message: 'Изображение изменено. Новая версия прикреплена к сообщению.' },
      document: edited.document, creditsSpentMilli: edited.creditsSpentMilli };
  }
  return { response: { ok: false, code: 'UNSUPPORTED_EDIT_FORMAT', message: 'Редактирование поддерживается для DOCX, XLSX и PNG/JPEG/WebP.' } };
}
