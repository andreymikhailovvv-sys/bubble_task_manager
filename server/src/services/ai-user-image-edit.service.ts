import { randomUUID } from 'node:crypto';
import { generateAiImage } from './ai-image-generation.service.js';
import { isGeneratedImageEditRequest } from './ai-image-edit-intent.js';
import { selectUploadedImageForEdit, type UploadedImage } from './ai-user-image-input.js';

type EditInput = {
  userId: string;
  taskId?: string;
  question: string;
  attachments?: UploadedImage[];
  apiKey: string;
  onProgress?: (status: 'editing_image' | 'forming_answer') => void;
  model: string;
  dynamicBilling: boolean;
};

export async function editUserImageIfRequested(input: EditInput) {
  if (!isGeneratedImageEditRequest(input.question)) return null;
  // Only a file attached in THIS message can be passed to a direct editor.
  // Neither last-generated task PNGs nor client-provided "last image" IDs
  // establish user intent or a source selection.
  const attachments = input.attachments ?? [];
  if (attachments.some(file => /\.(?:docx?|xlsx?|xlsm|pdf)$/i.test(file.name ?? ''))) return null;
  const uploaded = selectUploadedImageForEdit(attachments, true);
  if (!uploaded) return null;

  const requestId = randomUUID();
  input.onProgress?.('editing_image');
  try {
    const edited = await generateAiImage({
      userId: input.userId, taskId: input.taskId,
      actionId: requestId, apiKey: input.apiKey,
      args: { prompt: input.question, size: 'auto' },
      uploadedSourceImage: uploaded
    });
    return {
      answer: 'Изображение отредактировано. Новая версия прикреплена к сообщению.',
      model: input.model,
      actionReports: [] as string[], undoOperations: [] as unknown[],
      taskDataChanged: false,
      generatedDocument: edited.document,
      imageCreditsSpentMilli: edited.creditsSpentMilli,
      webSearchUsed: false, webSources: [], webCitations: [],
      diagnostics: undefined,
      billing: { mode: input.dynamicBilling ? 'dynamic' as const : 'legacy' as const,
        creditsSpentMilli: edited.creditsSpentMilli },
      workflowDiagnostics: {
        providerStreaming: false, webSearchProgressObserved: false, providerCalls: 0,
        toolCalls: 1, toolOperations: ['edit_image'], inputTokensTotal: 0, outputTokensTotal: 0,
        webSearchUsed: false, webSearchCallsActual: 0, webSearchCallsBilled: 0,
        webSearchLimit: 1, webSearchLimitExceeded: false, webSearchDuplicateItems: 0,
        webSearchSearchItemsRaw: 0, webSearchCreditsMilliBilled: 0,
        providerWebSearchCostMilli: 0, webSearchCalls: 0, webSearchCreditsMilli: 0,
        webSourceCount: 0
      }
    };
  } finally {
    input.onProgress?.('forming_answer');
  }
}
