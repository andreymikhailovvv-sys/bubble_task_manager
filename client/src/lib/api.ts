import type { AiChatModel, ChatAttachmentPayload, ChatMessage, ChatMode, GeneratedDocument, Habit, Sphere, Task, TaskAttachment, TaskComment, WebCitation, WebSource, TelegramInlineSendDraft, TelegramReadDraft, TelegramReadApproval } from './types';

export type ApiError = Error & { status?: number; code?: string };
export type AttachmentStorage = { usedBytes: number; limitBytes: number; count: number; overLimit: boolean; plan: string };
export type AccountAttachment = { id: string; taskId: string; name: string; mimeType: string; size: number; createdAt: string; taskTitle: string; parentTaskId: string | null; parentTaskTitle: string | null };
export const formatStorageMiB = (bytes: number) => (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';
export const ATTACHMENT_STORAGE_LIMIT_EVENT = 'planirovych:attachment-storage-limit';
type UnauthorizedHandler = () => void;
export type AiBilling = { mode: 'dynamic' | 'legacy'; creditsSpentMilli: number };
export type AiChatProgressStatus = 'analyzing_request' | 'using_chat_history' | 'searching_workspace' | 'searching_notes' | 'reading_note' | 'searching_tasks' | 'listing_tasks' | 'reading_task' | 'checking_sectors' | 'analyzing_retrieved_context' | 'applying_changes' | 'reading_attachment' | 'searching_web' | 'analyzing_web_results' | 'forming_answer' | 'generating_image' | 'editing_image' | 'editing_document';
export type TaskAiProgressStatus = 'analyzing_request' | 'using_chat_history' | 'searching_subtasks' | 'analyzing_subtasks' | 'reading_subtask' | 'searching_files' | 'reading_file' | 'analyzing_retrieved_context' | 'searching_web' | 'analyzing_web_results' | 'forming_answer' | 'applying_changes' | 'generating_image' | 'editing_image' | 'editing_document';
export type TaskAssistantResult = { taskProposal?: import('./types').AiTaskProposal | null; answer: string; model: string; telegramSendDraft?: TelegramInlineSendDraft | null; telegramReadDraft?: TelegramReadDraft | null; taskDataChanged: boolean; actionReports?: string[]; generatedDocument?: GeneratedDocument | null; webSearchUsed?: boolean; webSources?: WebSource[]; webCitations?: WebCitation[]; billing?: AiBilling };
type TaskAiStreamEvent = { type: 'status'; status: TaskAiProgressStatus } | { type: 'result'; result: TaskAssistantResult } | { type: 'error'; message: string } | { type: 'ping' };

let unauthorizedHandler: UnauthorizedHandler | null = null;
const USER_TIMEZONE_STORAGE_KEY = 'btm:user-timezone';
export const INSUFFICIENT_AI_CREDITS_MESSAGE = 'Системное сообщение: у пользователя недостаточно кредитов для использования ИИ-функции.';
export const formatAiRequestError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Не удалось получить ответ ИИ';
  return message === INSUFFICIENT_AI_CREDITS_MESSAGE || /Недостаточно (?:AI|ИИ) кредитов/i.test(message)
    ? INSUFFICIENT_AI_CREDITS_MESSAGE : message;
};
const DEFAULT_TIMEZONE = 'Europe/Moscow';

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function resolveUserTimeZone(): string {
  const saved = typeof window !== 'undefined' ? localStorage.getItem(USER_TIMEZONE_STORAGE_KEY) : null;
  if (saved?.trim()) return saved.trim();
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected?.trim()) return detected.trim();
  } catch {
    // ignore timezone detection failures
  }
  return DEFAULT_TIMEZONE;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    let errorCode: string | undefined;
    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json() as { error?: unknown; message?: unknown; code?: unknown };
        if (typeof payload.code === 'string') errorCode = payload.code;
        const candidate = typeof payload.error === 'string'
          ? payload.error
          : typeof payload.message === 'string'
            ? payload.message
            : null;
        if (candidate?.trim()) {
          errorMessage = candidate.trim() === 'Недостаточно AI кредитов' ? INSUFFICIENT_AI_CREDITS_MESSAGE : candidate.trim();
        }
      } else {
        const payload = await response.text();
        const looksLikeHtml = /<\s*(?:!doctype\s+html|html|head|body)\b/i.test(payload);
        if (payload.trim() && !looksLikeHtml) {
          errorMessage = payload.trim().slice(0, 500);
        } else if (response.status >= 500) {
          errorMessage = 'Сервис временно недоступен. Попробуйте ещё раз';
        }
      }
    } catch {
      // ignore response parsing errors
    }

    const error = new Error(errorMessage) as ApiError;
    error.status = response.status;
    error.code = errorCode;
    if (errorCode === 'ATTACHMENT_STORAGE_LIMIT' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ATTACHMENT_STORAGE_LIMIT_EVENT, { detail: { message: errorMessage } }));
    }
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw error;
  }

  return response.json();
}

export async function readTaskAssistantNdjson(stream: ReadableStream<Uint8Array>, onStatus?: (status: TaskAiProgressStatus) => void): Promise<TaskAssistantResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: TaskAssistantResult | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as TaskAiStreamEvent;
    if (event.type === 'status') onStatus?.(event.status);
    else if (event.type === 'result') result = event.result;
    else if (event.type === 'error') throw new Error(event.message);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(buffer);
  if (!result) throw new Error('Сервер не вернул результат чата ИИ');
  return result;
}

export function stripAiChatDisplayPreviews(history: ChatMessage[]): ChatMessage[] {
  return history.map(({ attachmentPreviews: _preview, ...message }) => message);
}

/** Thumbnails are UI state, never persisted to AI project storage or uploaded
 * to the chat-project synchronization endpoint.
 */
export function stripAiChatProjectDisplayPreviews<T extends { chats: Array<{ messages: ChatMessage[] }> }>(projects: T[]): T[] {
  return projects.map((project) => ({
    ...project,
    chats: project.chats.map((chat) => ({
      ...chat,
      messages: stripAiChatDisplayPreviews(chat.messages)
    }))
  })) as T[];
}

/** XMLHttpRequest is used only for requests with actual files. Fetch does not
 * expose upload progress, whereas XHR reports transferred bytes of the JSON
 * request (which contains all encoded attachments). Responses stay NDJSON.
 */
function streamAiRequestWithUploadProgress<Result, Status extends string>(
  url: string, body: unknown,
  options: { onStatus?: (status: Status) => void; onUploadProgress?: (percent: number | null) => void }
): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let position = 0;
    let pending = '';
    let result: Result | undefined;
    let error: Error | null = null;
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/x-ndjson');
    xhr.upload.onprogress = (event) => {
      options.onUploadProgress?.(event.lengthComputable && event.total > 0
        ? Math.min(100, Math.round(event.loaded * 100 / event.total)) : null);
    };
    const consume = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as { type?: string; status?: Status; result?: Result; message?: string };
      if (event.type === 'status' && event.status) options.onStatus?.(event.status);
      else if (event.type === 'result' && event.result) result = event.result;
      else if (event.type === 'error') throw new Error(event.message || 'Ошибка чата ИИ');
    };
    const readAvailable = (final = false) => {
      if (error) return;
      try {
        const text = xhr.responseText;
        pending += text.slice(position);
        position = text.length;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) consume(line);
        if (final) consume(pending);
      } catch (cause) {
        error = cause instanceof Error ? cause : new Error('Некорректный ответ сервера');
      }
    };
    xhr.onprogress = () => readAvailable();
    xhr.onload = () => {
      if (xhr.status === 401) unauthorizedHandler?.();
      readAvailable(true);
      if (error) { reject(error); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = `HTTP ${xhr.status}`;
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string; message?: string };
          message = parsed.error || parsed.message || message;
        } catch { /* NDJSON may already contain an error event. */ }
        const failure = new Error(message) as ApiError;
        failure.status = xhr.status;
        reject(failure);
        return;
      }
      if (!result) { reject(new Error('Сервер не вернул результат чата ИИ')); return; }
      options.onUploadProgress?.(100);
      resolve(result);
    };
    xhr.onerror = () => reject(new Error('Ошибка сети при отправке файлов'));
    xhr.onabort = () => reject(new Error('Отправка файлов отменена'));
    xhr.send(JSON.stringify(body));
  });
}

async function askTaskAssistantStreaming(taskId: string, payload: { clientRequestId?: string; question: string; userMessage?: string; model?: AiChatModel; mode?: ChatMode; attachments?: ChatAttachmentPayload[]; skipEfficiencyBonus?: boolean; interactionContext?: 'chat' | 'focus' | 'smart_postpone'; clientSurface?: 'web' | 'miniapp'; telegramRead?: TelegramReadApproval }, options?: { onStatus?: (status: TaskAiProgressStatus) => void; onUploadProgress?: (percent: number | null) => void }): Promise<TaskAssistantResult> {
  if (payload.attachments?.length && options?.onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
    return streamAiRequestWithUploadProgress<TaskAssistantResult, TaskAiProgressStatus>(
      `/api/tasks/${taskId}/ai-chat`,
      { ...payload, clientRequestId: payload.clientRequestId ?? crypto.randomUUID(), userTimeZone: resolveUserTimeZone() }, options
    );
  }
  const response = await fetch(`/api/tasks/${taskId}/ai-chat`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ ...payload, clientRequestId: payload.clientRequestId ?? crypto.randomUUID(), userTimeZone: resolveUserTimeZone() }) });
  if (response.status === 401) unauthorizedHandler?.();
  if (!response.body) throw new Error(response.ok ? 'Поток ответа чата ИИ недоступен' : `HTTP ${response.status}`);
  try {
    return await readTaskAssistantNdjson(response.body, options?.onStatus);
  } catch (error) {
    if (!response.ok && error instanceof SyntaxError) throw new Error(`HTTP ${response.status}`);
    throw error;
  }
}

export type AiChatResult = { suggestedChatTitle?: string; taskProposal?: import('./types').AiTaskProposal | null; answer: string; model: string; telegramSendDraft?: TelegramInlineSendDraft | null; telegramReadDraft?: TelegramReadDraft | null; taskDataChanged: boolean; actionReports?: string[]; generatedDocument?: GeneratedDocument | null; undoOperations?: Array<{ taskId: string; previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' } }>; webSearchUsed: boolean; webSources?: WebSource[]; webCitations?: WebCitation[]; billing?: AiBilling };
export async function readAiChatNdjson(stream: ReadableStream<Uint8Array>, onStatus?: (status: AiChatProgressStatus) => void): Promise<AiChatResult> {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let result: AiChatResult | null = null;
  const consume = (line: string) => { if (!line.trim()) return; const event = JSON.parse(line) as { type: string; status?: AiChatProgressStatus; result?: AiChatResult; message?: string }; if (event.type === 'status' && event.status) onStatus?.(event.status); else if (event.type === 'result' && event.result) result = event.result; else if (event.type === 'error') throw new Error(event.message || 'Ошибка чата ИИ'); };
  while (true) { const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; lines.forEach(consume); if (done) break; }
  consume(buffer); if (!result) throw new Error('Сервер не вернул результат чата ИИ'); return result;
}
async function askAiChatStreaming(payload: { clientRequestId?: string; question: string; history: ChatMessage[]; model?: AiChatModel; projectTitle?: string; chatTitle?: string; projectId?: string; chatId?: string; clientSurface?: 'web' | 'miniapp'; attachments?: ChatAttachmentPayload[]; telegramRead?: TelegramReadApproval }, options?: { onStatus?: (status: AiChatProgressStatus) => void; onUploadProgress?: (percent: number | null) => void }) {
  if (payload.attachments?.length && options?.onUploadProgress && typeof XMLHttpRequest !== 'undefined') {
    return streamAiRequestWithUploadProgress<AiChatResult, AiChatProgressStatus>(
      '/api/ai-chat', { ...payload, history: stripAiChatDisplayPreviews(payload.history), userTimeZone: resolveUserTimeZone() }, options
    );
  }
  const response = await fetch('/api/ai-chat', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ ...payload, history: stripAiChatDisplayPreviews(payload.history), userTimeZone: resolveUserTimeZone() }) });
  if (response.status === 401) unauthorizedHandler?.(); if (!response.body) throw new Error(`HTTP ${response.status}`); return readAiChatNdjson(response.body, options?.onStatus);
}

export type CurrentUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
  isGuest?: boolean;
  aiCredits?: number;
  aiCreditsMilli?: number;
  aiCreditsPeriod?: string;
  aiEfficiencyCreditsSpent?: number;
  aiEfficiencyCreditsPeriod?: string;
  timeZone?: string | null;
  morningAiCheckupEnabled?: boolean;
  offerTaskCompletionReport?: boolean;
  browserNotificationsEnabled?: boolean;
  morningAiCheckupTime?: string;
  efficiencyResetAt?: string;
  efficiencyScore?: number;
  efficiencyTaskScore?: number;
  efficiencyHabitScore?: number;
  efficiencyAiScore?: number;
  efficiencyFocusScore?: number;
  efficiencyLastActivityAt?: string | Date | null;
  completedLessonIds?: string[];
  hasPassword?: boolean;
};
export type SubscriptionLinks = { start: string; pro: string; max: string };
export type CreditPackKey = 'credit_start' | 'credit_pro' | 'credit_max';
export type CreditPack = { key: CreditPackKey; name: string; creditsAmount: number; price: number; isActive: boolean };
export type CreditPackLinks = Record<CreditPackKey, string>;
export type CreditPurchase = { id: string; creditPackKey: CreditPackKey; creditsAmount: number; price: number; status: string; credited: boolean };
export type CreditUsageBreakdownItem = { key: string; label: string; creditsMilli: number };
export type CreditUsageStatistics = {
  todayCreditsMilli: number;
  weekCreditsMilli: number;
  monthCreditsMilli: number;
  averageDailyCreditsMilli: number;
  byModel: CreditUsageBreakdownItem[];
  byFeature: CreditUsageBreakdownItem[];
  daily: Array<{ date: string; creditsMilli: number }>;
  trackingStartedAt: string | null;
};

export type AdminSubscriptionPlan = 'free' | 'start' | 'pro' | 'max';
export type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  aiCredits: number;
  aiCreditsPeriod: string;
  subscriptionPlan: AdminSubscriptionPlan;
  telegramLinked: boolean;
  createdAt: string;
};
export type TelegramIntegrationStatus = TelegramUserClientAuthStatus & {
  botConnected: boolean;
  credentialsSet: boolean;
  sendEnabled: boolean;
};
export type TelegramUserClientAuthStatus = {
  enabled: boolean;
  readEnabled: boolean;
  credentialsSet?: boolean;
  connected: boolean;
  status: 'idle' | 'starting' | 'qr' | 'password_required' | 'verifying_password' | 'connected' | 'failed' | 'cancelled';
  attemptId: string | null;
  qrDataUrl: string | null;
  qrExpiresAt: number | null;
  passwordHint: string | null;
  error: string | null;
};
export type TelegramQuickSendJob = {
  id: string;
  state: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED';
  stage: 'REWRITE' | 'SEND';
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  unknownCount: number;
  createdAt: string;
  completedAt: string | null;
};
export type TelegramAiChatSettings = {
  mode: 'OBSERVE' | 'SUGGEST' | 'AUTO';
  taskMode: 'NONE' | 'SUGGEST' | 'AUTO';
  taskCreationWhen: string;
  taskIntervalMinutes: number;
  taskIntervalMonths: number | null;
  interactionIntervalMinutes: 0 | 5 | 10 | 30 | 180 | 360 | 1440;
  autoReplyIntervalMinutes: number;
  autoReplyIntervalMonths: number | null;
  summaryIntervalMinutes: number;
  summaryIntervalMonths: number | null;
  summaryInstructions: string;
  suggestWhen: string;
  suggestHow: string;
  monitorModel: 'gpt-6-luna' | 'gpt-5.4-mini' | 'gpt-6.1-sol';
  autoReplyWhen: string;
  autoReplyHow: string;
  notifyImportant: boolean;
  reviewAttachments: boolean;
  /** NULL disables the per-chat daily cap; it never bypasses the wallet balance. */
  dailyCreditLimitMilli: number | null;
};
export type TelegramAiAssistantInbox = {
  projectId: string;
  projectTitle: string;
  projectIcon: string;
  chats: Array<{ id: string; policyId: string; telegramChatId: string; title: string; kind: 'user' | 'group' | 'supergroup' }>;
  messages: Array<{ id: string; chatId: string; role: 'assistant'; content: string; createdAt: string; taskSuggestions?: string[]; taskProposal?: import('./types').AiTaskProposal | null; approvedSuggestionIndices: number[]; telegramSuggestedReply?: TelegramAiSuggestedReply | null }>;
};
export type TelegramAiSuggestedReply = {
  eventId: string; text: string; messageId: number; status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN'; chatTitle: string;
};
export type TelegramMonitorSummary = {
  summary: string;
  decisions: string[];
  obligations: string[];
  openQuestions: string[];
  risks: string[];
  taskSuggestions: Array<string | { operation: string; title: string | null; dueDate?: string | null }>;
  important: boolean;
};
export type TelegramAiChatPolicy = TelegramAiChatSettings & {
  id: string;
  userId: string;
  chatId: string;
  chatKind: 'user' | 'group' | 'supergroup';
  chatTitle: string;
  isEnabled: boolean;
  spentTodayMilli: number;
  reservedTodayMilli: number;
  totalSpentMilli: number;
  lastCheckedAt: string | null;
  lastSummaryAt: string | null;
  lastSummary: TelegramMonitorSummary | null;
  lastError: string | null;
  nextCheckAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TelegramChatCapability = {
  connected: boolean;
  readEnabled: boolean;
  analyzeEnabled: boolean;
  sendEnabled: boolean;
};
export type TelegramPrivateDialog = { id: string; name: string; username: string | null };
export type TelegramSendTarget = { id: string; name: string; username: string | null; kind: 'user' | 'group' | 'supergroup' };
export type TelegramSendTargetList = { dialogs: TelegramSendTarget[]; limited: boolean };
export type TelegramPrivateMessage = {
  id: number; date: number; out: boolean; senderName: string;
  text: string; truncated: boolean; hasMedia: boolean;
};
export type TelegramDialogList = { dialogs: TelegramPrivateDialog[]; limited: boolean };
export type TelegramAnalysisMessage = {
  id: number; date: number; speaker: 'Вы' | 'Собеседник';
  text: string; truncated: boolean; hasMedia: boolean;
};
export type TelegramAnalysisSnapshot = {
  fingerprint: string;
  messageCount: number;
  messages: TelegramAnalysisMessage[];
};
export type TelegramDialogHistory = {
  dialog: { id: string; name: string };
  messages: TelegramPrivateMessage[];
  analysisSnapshot: TelegramAnalysisSnapshot;
  limit: number;
};
export type TelegramDialogAiResult = {
  summary: string;
  reply: string;
  model: string;
  analyzedMessageCount: number;
};
export type TelegramManualSendPreview = {
  confirmationId: string;
  recipientName: string;
  recipientId: string;
  recipientKind: 'saved' | 'username';
  text: string;
  expiresAt: number;
};
export type TelegramManualSendAudit = {
  id: string;
  recipientKind: 'saved' | 'username';
  recipientTelegramId: string;
  result: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';
  createdAt: string;
  completedAt: string | null;
};
export type TelegramManualSendStatus = { enabled: boolean; aiDraftEnabled: boolean; audit: TelegramManualSendAudit[] };
export type TelegramDraftTone = 'neutral' | 'friendly' | 'formal';
export type AdminBroadcastTarget = 'user' | 'all' | 'paid' | 'free';
export type AdminBroadcastImage = { fileName: string; mimeType: string; contentBase64: string };

export type StandaloneNoteGroup = {
  id: string;
  name: string;
  color: string;
  sphereId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StandaloneNote = {
  id: string;
  title: string;
  content: string;
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const api = {
  getMe: () => request<{ user: CurrentUser }>('/api/auth/me'),
  getAiChatProjects: <T>() => request<{ projects: T[] | null }>('/api/ai-chat/projects'),
  getAiChatThreadMessages: (projectId: string, chatId: string) => request<{ messages: ChatMessage[]; projectsOutline: import('./ai-chat-reconciliation').AiChatProjectOutline[] }>(`/api/ai-chat/projects/${encodeURIComponent(projectId)}/chats/${encodeURIComponent(chatId)}/messages`),
  getAiGeneratedDocumentDownloadUrl: (id: string) => `/api/ai-documents/${encodeURIComponent(id)}/download`,
  createAiGeneratedDocumentDownloadLink: (id: string) =>
    request<{ url: string; fileName: string }>(`/api/ai-documents/${encodeURIComponent(id)}/download-link`, { method: 'POST' }),
  getSystemNotifications: () => request<{ notifications: Array<{ id: string; eventKey?: string; taskId?: string | null; content: string; readAt?: string | null; createdAt: string }>; unreadCount: number }>('/api/system-notifications'),
  markSystemNotificationsRead: () => request<{ ok: true }>('/api/system-notifications/read', { method: 'POST' }),
  saveAiChatProjects: <T extends { chats: Array<{ messages: ChatMessage[] }> }>(projects: T[]) => request<{ projects: T[] }>('/api/ai-chat/projects', {
    method: 'PUT',
    body: JSON.stringify({ projects: stripAiChatProjectDisplayPreviews(projects) })
  }),
  updateUserSettings: (payload: { timeZone?: string; morningAiCheckupEnabled?: boolean; browserNotificationsEnabled?: boolean; morningAiCheckupTime?: string; offerTaskCompletionReport?: boolean }) =>
    request<{ user: CurrentUser }>('/api/user/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
  register: (payload: { login: string; password: string; name?: string; consentAccepted: boolean }) => request<{ user: CurrentUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: { login: string; password: string }) => request<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  updateProfile: (payload: { name: string; email: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: CurrentUser }>('/api/user/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  loginTelegramMiniApp: (payload: { initData: string }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-miniapp', { method: 'POST', body: JSON.stringify(payload) }),
  loginTelegramWeb: (payload: { initData: string; login: string; password: string }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-web-login', { method: 'POST', body: JSON.stringify(payload) }),
  registerTelegramWeb: (payload: { initData: string; login: string; password: string; name: string; consentAccepted: boolean }) =>
    request<{ user: CurrentUser }>('/api/auth/telegram-web-register', { method: 'POST', body: JSON.stringify(payload) }),
  logMiniAppClientEvent: (payload: { event: string; data?: Record<string, unknown> }) =>
    request<{ ok: true }>('/api/miniapp/client-log', { method: 'POST', body: JSON.stringify(payload) }),
  loginWithGoogle: () => {
    window.location.href = '/api/auth/google';
  },
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  deleteAccount: () => request<{ ok: true }>('/api/user/account', { method: 'DELETE' }),
  createTelegramLinkToken: () =>
    request<{ deepLinkUrl: string; expiresInSeconds: number }>('/api/telegram/link-token', { method: 'POST' }),
  getStandaloneNoteGroups: () => request<StandaloneNoteGroup[]>('/api/note-groups'),
  createStandaloneNoteGroup: (payload: { name: string; color: string }) =>
    request<StandaloneNoteGroup>('/api/note-groups', { method: 'POST', body: JSON.stringify(payload) }),
  updateStandaloneNoteGroup: (id: string, payload: { name: string; color: string }) =>
    request<StandaloneNoteGroup>(`/api/note-groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteStandaloneNoteGroup: (id: string) =>
    request<{ ok: true }>(`/api/note-groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getStandaloneNotes: () => request<StandaloneNote[]>('/api/notes'),
  createStandaloneNote: (payload: { title?: string; content?: string; groupId?: string | null } = {}) =>
    request<StandaloneNote>('/api/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateStandaloneNote: (id: string, payload: { title?: string; content?: string; groupId?: string | null }) =>
    request<StandaloneNote>(`/api/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteStandaloneNote: (id: string) =>
    request<{ ok: true }>(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getSpheres: () => request<Sphere[]>('/api/spheres'),
  createSphere: (payload: Partial<Sphere>) => request<Sphere>('/api/spheres', { method: 'POST', body: JSON.stringify(payload) }),
  updateSphere: (id: string, payload: Partial<Sphere>) => request<Sphere>(`/api/spheres/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSphere: (id: string) => request<{ ok: true }>(`/api/spheres/${id}`, { method: 'DELETE' }),
  getTasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: Partial<Task>) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  generateTaskCompletionReport: (id: string) => request<{ document: GeneratedDocument; model: string; creditsSpentMilli: number; coveredEvents: number; omittedEvents: number }>(`/api/tasks/${encodeURIComponent(id)}/completion-report`, { method: 'POST' }),
  updateTask: (id: string, payload: Partial<Task> & { collaborationScope?: 'me' | 'all' }) => request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (id: string, scope: 'me' | 'all' = 'me') => request<{ ok: true }>(`/api/tasks/${id}?scope=${scope}`, { method: 'DELETE' }),
  createTaskShare: (id: string) => request<{ token: string }>(`/api/tasks/${id}/share`, { method: 'POST' }),
  getTaskShare: (token: string) => request<{ title: string; description?: string | null; subtaskCount: number; ownerName: string }>(`/api/task-shares/${token}`),
  acceptTaskShare: (token: string, sphereId: string | null) => request<{ taskId: string }>(`/api/task-shares/${token}/accept`, { method: 'POST', body: JSON.stringify({ sphereId }) }),
  updateTaskCollaboration: (id: string, color: string) => request<{ color: string }>(`/api/tasks/${id}/collaboration`, { method: 'PATCH', body: JSON.stringify({ color }) }),
  removeTaskCollaborator: (id: string, userId: string) => request<{ ok: true }>(`/api/tasks/${id}/collaboration/members/${userId}`, { method: 'DELETE' }),
  disableTaskCollaboration: (id: string) => request<{ ok: true }>(`/api/tasks/${id}/collaboration`, { method: 'DELETE' }),
  getTaskComments: (id: string) => request<{ comments: TaskComment[] }>(`/api/tasks/${id}/comments`),
  createTaskComment: (id: string, payload: { content: string; parentCommentId?: string | null }) =>
    request<TaskComment>(`/api/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
  markTaskCommentsRead: (id: string, lastCommentId?: string | null) => request<{ ok: true; lastReadAt: string }>(`/api/tasks/${id}/comments/read`, { method: 'POST', body: JSON.stringify({ lastCommentId: lastCommentId ?? null }) }),
  markAllTaskCommentsRead: (id: string) => request<{ ok: true; markedSubtasks: number }>(`/api/tasks/${id}/comments/read-all`, { method: 'POST' }),
  createTaskCalendarIcsLink: (id: string, payload: { startAt: string; durationMinutes: 30 | 60 | 90 | 120; reminderMinutes: 10 | 30 | 60 | null }) =>
    request<{ url: string }>(`/api/tasks/${id}/calendar/ics-link`, { method: 'POST', body: JSON.stringify(payload) }),
  recordEfficiencyEvent: (payload: { delta: number; bucket: 'task' | 'habit' | 'ai' | 'focus' }) =>
    request<Pick<CurrentUser, 'efficiencyScore' | 'efficiencyTaskScore' | 'efficiencyHabitScore' | 'efficiencyAiScore' | 'efficiencyFocusScore' | 'efficiencyLastActivityAt'>>('/api/efficiency/events', { method: 'POST', body: JSON.stringify(payload) }),
  completeTrainingLesson: (lessonId: string) =>
    request<{ awarded: boolean; reward: number; user: CurrentUser }>(`/api/training/lessons/${lessonId}/complete`, { method: 'POST' }),
  getHabits: () => request<Habit[]>('/api/habits'),
  getHabitHistory: (id: string) => request<Habit['stats']>(`/api/habits/${encodeURIComponent(id)}/history`),
  createHabit: (payload: Partial<Habit>) => request<Habit>('/api/habits', { method: 'POST', body: JSON.stringify(payload) }),
  updateHabit: (id: string, payload: Partial<Habit>) => request<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  completeHabit: (id: string, payload: { dateKey: string; amount?: number; completedAt?: string }) =>
    request<Habit>(`/api/habits/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) }),
  uncompleteHabit: (id: string, payload: { dateKey: string; amount?: number }) =>
    request<Habit>(`/api/habits/${id}/uncomplete`, { method: 'POST', body: JSON.stringify(payload) }),
  finishHabit: (id: string) =>
    request<{ ok: true; finishedAt: string }>(`/api/habits/${id}/finish`, { method: 'POST' }),
  deleteHabit: (id: string) => request<{ ok: true }>(`/api/habits/${id}`, { method: 'DELETE' }),
  getInsights: () => request<{ id: string; text: string }[]>('/api/dashboard/insights'),
  getAttachmentStorage: () => request<AttachmentStorage>('/api/user/attachments/storage'),
  listAccountAttachments: () => request<AccountAttachment[]>('/api/user/attachments'),
  deleteAccountAttachment: (id: string) => request<{ ok: true }>(`/api/user/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getTaskAttachments: (taskId: string) => request<TaskAttachment[]>(`/api/tasks/${taskId}/attachments`),
  getTaskAttachmentDownloadUrl: (taskId: string, attachmentId: string) => `/api/tasks/${taskId}/attachments/${attachmentId}/download`,
  createTaskAttachmentDownloadLink: (taskId: string, attachmentId: string) =>
    request<{ url: string; fileName: string }>(`/api/tasks/${taskId}/attachments/${attachmentId}/download-link`, { method: 'POST' }),
  createTaskAttachment: (taskId: string, payload: ChatAttachmentPayload) =>
    request<TaskAttachment>(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteTaskAttachment: (taskId: string, attachmentId: string) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  getTaskAssistantHistory: (taskId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/tasks/${taskId}/ai-chat?userTimeZone=${encodeURIComponent(resolveUserTimeZone())}`),
  askTaskAssistant: (taskId: string, payload: { clientRequestId?: string; question: string; userMessage?: string; model?: AiChatModel; mode?: ChatMode; attachments?: ChatAttachmentPayload[]; skipEfficiencyBonus?: boolean; interactionContext?: 'chat' | 'focus' | 'smart_postpone'; clientSurface?: 'web' | 'miniapp' }) =>
    request<TaskAssistantResult>(`/api/tasks/${taskId}/ai-chat`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, clientRequestId: payload.clientRequestId ?? crypto.randomUUID(), userTimeZone: resolveUserTimeZone() })
    }),
  askTaskAssistantStreaming,
  appendTaskAssistantMessages: (taskId: string, payload: { messages: ChatMessage[] }) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/ai-chat/messages`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  sendTaskParticipantMessage: (taskId: string, payload: { recipientUserId: string; content: string }) =>
    request<ChatMessage & { id: string }>(`/api/tasks/${taskId}/participant-messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  generateTaskSubtasks: (taskId: string, payload?: { note?: string }) =>
    request<{ createdCount: number; model: string; billing?: AiBilling }>(`/api/tasks/${taskId}/ai-subtasks`, {
      method: 'POST',
      body: JSON.stringify({ ...(payload ?? {}), userTimeZone: resolveUserTimeZone() })
    }),
  generateOverdueTaskNudge: (taskId: string) =>
    request<{ sent: boolean; answer?: string; model?: string; replayed?: boolean; billing?: AiBilling }>(`/api/tasks/${taskId}/ai-overdue-nudge`, {
      method: 'POST',
      body: JSON.stringify({ userTimeZone: resolveUserTimeZone() })
    }),
  generateTaskFromAi: (payload: { prompt: string; sphereId?: string | null; autoAssignSphere?: boolean; attachments?: ChatAttachmentPayload[] }) =>
    request<{
      model: string;
      suggestedSphereId: string | null;
      task: {
        title: string;
        description: string;
        dueDate: string | null;
        importance: number;
        urgency: number;
        notifyBeforeMinutes: number | null;
        subtasks: Array<{ title: string; description: string; dueDate: string | null }>;
      };
      firstAssistantMessage: string;
      billing?: AiBilling;
    }>('/api/tasks/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  askAiChat: (payload: { clientRequestId?: string; question: string; history: ChatMessage[]; model?: AiChatModel; projectTitle?: string; chatTitle?: string; projectId?: string; chatId?: string; clientSurface?: 'web' | 'miniapp'; attachments?: ChatAttachmentPayload[]; telegramRead?: TelegramReadApproval }) =>
    request<AiChatResult>('/api/ai-chat', {
      method: 'POST',
      body: JSON.stringify({ ...payload, history: stripAiChatDisplayPreviews(payload.history), userTimeZone: resolveUserTimeZone() })
    }),
  askAiChatStreaming,
  getGeneralAssistantHistory: () =>
    request<{ messages: ChatMessage[] }>(`/api/ai-general-chat?userTimeZone=${encodeURIComponent(resolveUserTimeZone())}`),
  askGeneralAssistant: (payload: { question: string }) =>
    request<{
      taskProposal?: import('./types').AiTaskProposal | null;
      answer: string;
      model: string;
      actionReports: string[];
      undoOperations: Array<{
        taskId: string;
        previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
      }>;
      billing?: AiBilling;
    }>('/api/ai-general-chat', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  parseRecurrence: (payload: { text: string; taskId?: string }) =>
    request<{ summary: string; schedule: { rrule: string; timezone: string; until: string | null }; model: string; nextDueDate: string | null; billing?: AiBilling }>('/api/ai/parse-recurrence', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  undoGeneralAssistantAction: (payload: {
    operations: Array<{
      taskId: string;
      previous: { dueDate: string | null; status: 'TODO' | 'IN_PROGRESS' | 'DONE' };
    }>;
  }) =>
    request<{ ok: true }>('/api/ai-general-chat/undo', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  optimizeTimeline: (payload: { scope: 'day' | 'week' | 'month'; periodStartIso: string; periodEndIso: string; userNote?: string }) =>
    request<{ model: string; summary: string; plan: Array<{ taskId: string; dueDate: string | null }>; billing?: AiBilling }>('/api/timeline/ai-optimize', {
      method: 'POST',
      body: JSON.stringify({ ...payload, userTimeZone: resolveUserTimeZone() })
    }),
  applyTimelineOptimization: (payload: { plan: Array<{ taskId: string; dueDate: string | null }> }) =>
    request<{ ok: true }>('/api/timeline/ai-optimize/apply', { method: 'POST', body: JSON.stringify(payload) }),
  postponeOverdueWithAi: () =>
    request<{ ok: true; model: string; summary: string; updatedTaskIds: string[]; billing?: AiBilling }>('/api/timeline/overdue-postpone-ai', { method: 'POST' }),

  reportClientError: (payload: {
    source: 'error-boundary' | 'window-error' | 'unhandledrejection' | 'timeline-render';
    message: string;
    stack?: string;
    details?: string;
    url?: string;
  }) =>
    request<{ ok: true }>('/api/client-errors', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getSubscriptionLinks: () => request<{ links: SubscriptionLinks }>('/api/subscription-links'),
  getCreditPacks: () => request<{ packs: CreditPack[]; paymentProvider: 'yookassa' | null; purchaseAvailable: boolean }>('/api/credit-packs'),
  createCreditPurchase: (payload: { packKey: CreditPackKey; clientRequestId: string; clientSurface: 'web' | 'miniapp'; receiptEmail?: string }) =>
    request<{ purchaseId: string; status: string; confirmationUrl: string | null }>(`/api/payments/yookassa/credit-packs/${payload.packKey}`, { method: 'POST', body: JSON.stringify({ clientRequestId: payload.clientRequestId, clientSurface: payload.clientSurface, ...(payload.receiptEmail ? { receiptEmail: payload.receiptEmail } : {}) }) }),
  getCreditPurchaseStatus: (purchaseId: string) => request<{ purchase: CreditPurchase }>(`/api/payments/yookassa/purchases/${encodeURIComponent(purchaseId)}`),
  getCreditUsageStatistics: () => request<{ statistics: CreditUsageStatistics }>('/api/credits/statistics'),
  adminGetUsers: (payload: { password: string }) =>
    request<{ users: AdminUser[] }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  telegramIntegrationStatus: () =>
    request<TelegramIntegrationStatus>('/api/telegram-user-client/integrations/status'),
  telegramIntegrationConfigure: (apiId: string, apiHash: string) =>
    request<{ ok: true; credentialsSet: true }>('/api/telegram-user-client/integrations/configure', {
      method: 'POST', body: JSON.stringify({ apiId, apiHash })
    }),
  telegramIntegrationStart: () =>
    request<{ attemptId: string; status: string }>('/api/telegram-user-client/integrations/start', {
      method: 'POST', body: '{}'
    }),
  telegramIntegrationPassword: (attemptId: string, telegramPassword: string) =>
    request<{ ok: true }>('/api/telegram-user-client/integrations/password', {
      method: 'POST', body: JSON.stringify({ attemptId, telegramPassword })
    }),
  telegramIntegrationCancel: (attemptId: string) =>
    request<{ ok: true }>('/api/telegram-user-client/integrations/cancel', {
      method: 'POST', body: JSON.stringify({ attemptId })
    }),
  telegramIntegrationDisconnect: () =>
    request<{ ok: true; remoteLogout: 'ok' | 'failed' | 'not_needed' }>('/api/telegram-user-client/integrations/disconnect', {
      method: 'POST', body: '{}'
    }),
  aiTaskProposal: (id: string) => request<import('./types').AiTaskProposal>(`/api/ai/task-proposals/${encodeURIComponent(id)}`),
  approveAiTaskProposal: (id: string) => request<import('./types').AiTaskProposal>(`/api/ai/task-proposals/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }),
  undoAiTaskProposal: (id: string) => request<import('./types').AiTaskProposal>(`/api/ai/task-proposals/${encodeURIComponent(id)}/undo`, { method: 'POST', body: '{}' }),
  rejectAiTaskProposal: (id: string) => request<import('./types').AiTaskProposal>(`/api/ai/task-proposals/${encodeURIComponent(id)}/reject`, { method: 'POST', body: '{}' }),
  aiTaskProposalPreference: () => request<{ autoApply: boolean }>('/api/ai/task-proposals/preferences'),
  setAiTaskProposalPreference: (autoApply: boolean) => request<{ autoApply: boolean }>('/api/ai/task-proposals/preferences', { method: 'PATCH', body: JSON.stringify({ autoApply }) }),
  telegramAssistantInbox: () => request<TelegramAiAssistantInbox>('/api/telegram-user-client/assistant/inbox'),
  telegramAssistantSendSuggestedReply: (eventId: string, text: string) =>
    request<{ status: 'SENT' | 'FAILED' | 'UNKNOWN'; ok: boolean }>(`/api/telegram-user-client/assistant/inbox/${encodeURIComponent(eventId)}/send-reply`, {
      method: 'POST', body: JSON.stringify({ text })
    }),
  telegramAssistantApproveTask: (eventId: string, index: number) => request<{ ok: true; taskId: string; alreadyCreated: boolean }>(
    `/api/telegram-user-client/assistant/inbox/${encodeURIComponent(eventId)}/tasks/${index}`,
    { method: 'POST', body: '{}' }
  ),
  telegramAssistantPolicies: () =>
    request<{ policies: TelegramAiChatPolicy[]; activationAvailable: boolean; maximumChats: number }>('/api/telegram-user-client/assistant/chats'),
  telegramAssistantStart: (chatId: string) =>
    request<{ ok: true; enabled: boolean }>(`/api/telegram-user-client/assistant/chats/${encodeURIComponent(chatId)}/start`, { method: 'POST', body: '{}' }),
  telegramAssistantStop: (chatId: string) =>
    request<{ ok: true; enabled: boolean }>(`/api/telegram-user-client/assistant/chats/${encodeURIComponent(chatId)}/stop`, { method: 'POST', body: '{}' }),
  telegramAssistantSummarize: (chatId: string) =>
    request<{ ok: true; queued: boolean }>(`/api/telegram-user-client/assistant/chats/${encodeURIComponent(chatId)}/summarize`, { method: 'POST', body: '{}' }),
  telegramAssistantSavePolicy: (chatId: string, policy: TelegramAiChatSettings) =>
    request<{ policy: TelegramAiChatPolicy; activationAvailable: boolean }>(`/api/telegram-user-client/assistant/chats/${encodeURIComponent(chatId)}`, {
      method: 'PUT', body: JSON.stringify(policy)
    }),
  telegramAssistantDeletePolicy: (chatId: string) =>
    request<{ ok: true }>(`/api/telegram-user-client/assistant/chats/${encodeURIComponent(chatId)}`, { method: 'DELETE' }),
  telegramQuickSend: (payload: { requestId: string; recipientIds: string[]; text: string; mode: 'DIRECT' | 'REWRITE_AND_SEND'; instruction?: string }) =>
    request<TelegramQuickSendJob>('/api/telegram-user-client/chat/quick-send', {
      method: 'POST', body: JSON.stringify(payload)
    }),
  telegramQuickSendStatus: (jobId: string) =>
    request<TelegramQuickSendJob>(`/api/telegram-user-client/chat/quick-send/${encodeURIComponent(jobId)}`),
  telegramQuickRewrite: (payload: { text: string; instruction: string }) =>
    request<{ text: string }>('/api/telegram-user-client/chat/quick-rewrite', {
      method: 'POST', body: JSON.stringify(payload)
    }),
  telegramChatCapability: () =>
    request<TelegramChatCapability>('/api/telegram-user-client/chat/status'),
  telegramChatSendTargets: () =>
    request<TelegramSendTargetList>('/api/telegram-user-client/chat/send-targets', {
      method: 'POST', body: '{}'
    }),
  telegramChatDialogs: () =>
    request<TelegramDialogList>('/api/telegram-user-client/chat/dialogs', {
      method: 'POST', body: '{}'
    }),
  telegramChatHistory: (dialogId: string) =>
    request<TelegramDialogHistory>('/api/telegram-user-client/chat/history', {
      method: 'POST', body: JSON.stringify({ dialogId })
    }),
  telegramChatAnalyze: (payload: { dialogId: string; fingerprint: string; consent: true; instruction: string; tone: TelegramDraftTone }) =>
    request<TelegramDialogAiResult>('/api/telegram-user-client/chat/analyze', {
      method: 'POST', body: JSON.stringify(payload)
    }),
  telegramChatSendPreview: (payload: { recipientKind: 'username' | 'saved'; username?: string; text: string }) =>
    request<TelegramManualSendPreview>('/api/telegram-user-client/chat/send-preview', {
      method: 'POST', body: JSON.stringify(payload)
    }),
  telegramChatSendConfirm: (confirmationId: string) =>
    request<{ ok: boolean; auditId: string }>('/api/telegram-user-client/chat/send-confirm', {
      method: 'POST', body: JSON.stringify({ confirmationId })
    }),
  adminSaveSubscriptionLinks: (payload: { password: string; links: SubscriptionLinks }) =>
    request<{ links: SubscriptionLinks }>('/api/admin/subscription-links', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminSaveCreditPackLinks: (payload: { password: string; links: CreditPackLinks }) =>
    request<{ links: CreditPackLinks }>('/api/admin/credit-packs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminAddCredits: (payload: { password: string; userId: string; creditsToAdd: number }) =>
    request<{ user: { id: string; aiCredits: number; aiCreditsMilli: number; aiCreditsPeriod: string } }>(`/api/admin/users/${payload.userId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ password: payload.password, creditsToAdd: payload.creditsToAdd })
    }),
  adminGetCreditUsageStatistics: (payload: { password: string; userId: string }) =>
    request<{ statistics: CreditUsageStatistics }>(`/api/admin/users/${payload.userId}/credit-statistics`, {
      method: 'POST',
      body: JSON.stringify({ password: payload.password })
    }),
  adminDownloadCreditUsageExcel: async (payload: { password: string; userId: string; month: string }) => {
    const response = await fetch(`/api/admin/users/${payload.userId}/credit-usage-export`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: payload.password, month: payload.month })
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json() as { error?: unknown };
        if (typeof data.error === 'string' && data.error.trim()) message = data.error.trim();
      } catch {
        // keep HTTP status fallback
      }
      throw new Error(message);
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileNameMatch = disposition.match(/filename="?([^";]+)"?/i);
    return { blob: await response.blob(), fileName: fileNameMatch?.[1] ?? `credit-usage-${payload.month}.xls` };
  },
  adminSetSubscriptionPlan: (payload: { password: string; userId: string; subscriptionPlan: AdminSubscriptionPlan }) =>
    request<{ user: { id: string; subscriptionPlan: AdminSubscriptionPlan } }>(`/api/admin/users/${payload.userId}/subscription`, {
      method: 'POST',
      body: JSON.stringify({ password: payload.password, subscriptionPlan: payload.subscriptionPlan })
    }),
  adminSendBroadcast: (payload: { password: string; target: AdminBroadcastTarget; userId?: string; text: string; image?: AdminBroadcastImage | null }) =>
    request<{ requested: number; sent: number; failed: number }>('/api/admin/broadcasts', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
