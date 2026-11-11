import type { AiChatResult, TaskAssistantResult } from './api';

/** Only an actual interactive result should uncover the underlying chat.
 * Information-only tool requests and plain spoken answers remain fullscreen. */
export function hasPlanikActionSurface(result: AiChatResult | TaskAssistantResult): boolean {
  return Boolean(
    result.taskProposal || result.telegramSendDraft || result.mailSendDraft ||
    result.telegramReadDraft || result.generatedDocument ||
    /\[\[task_ref(?:[:=])[^\]]+\]\]/.test(result.answer)
  );
}
