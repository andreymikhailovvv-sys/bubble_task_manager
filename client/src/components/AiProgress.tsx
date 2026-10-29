import { Image as ImageIcon, Sparkles } from 'lucide-react';
import type { AiChatProgressStatus, TaskAiProgressStatus } from '../lib/api';

const PROGRESS_TEXT: Record<string, string> = {
  analyzing_request: 'Анализирую запрос', using_chat_history: 'Учитываю историю диалога',
  searching_workspace: 'Ищу в задачах и заметках', searching_notes: 'Ищу заметки', reading_note: 'Читаю заметку',
  searching_tasks: 'Ищу задачи', listing_tasks: 'Собираю список задач', reading_task: 'Изучаю задачу', checking_sectors: 'Проверяю сектора',
  searching_subtasks: 'Ищу нужную подзадачу', analyzing_subtasks: 'Анализирую подзадачи', reading_subtask: 'Изучаю детали подзадачи',
  searching_files: 'Ищу нужный файл', reading_file: 'Изучаю содержимое файла', reading_attachment: 'Изучаю вложение',
  searching_web: 'Ищу в интернете', analyzing_web_results: 'Изучаю найденные источники',
  analyzing_retrieved_context: 'Анализирую найденные данные', forming_answer: 'Формирую ответ', applying_changes: 'Вношу изменения',
  generating_image: 'Создаю изображение', editing_image: 'Редактирую изображение', editing_document: 'Редактирую документ'
};

export function AiProgress({ status }: { status: AiChatProgressStatus | TaskAiProgressStatus }) {
  const fileName = status.startsWith('reading_file:') ? status.slice('reading_file:'.length)
    : status.startsWith('reading_attachment:') ? status.slice('reading_attachment:'.length) : '';
  const progressLabel = fileName ? `Ищу в документе «${fileName.slice(0, 100)}»`
    : PROGRESS_TEXT[status] ?? 'Анализирую запрос';
  return (
    <div className="ai-progress-group">
      <div className="miniapp-ai-progress" role="status" aria-live="polite" aria-atomic="true">
        <span className="miniapp-ai-progress-icon" aria-hidden="true"><Sparkles size={19} strokeWidth={2} /></span>
        <div className="miniapp-ai-progress-details">
          <span key={status} className="miniapp-ai-progress-text">{progressLabel}</span>
          <div key={`progress-${status}`} className="miniapp-ai-progress-track" aria-hidden="true"><span /><span /><span /></div>
        </div>
      </div>
      {(status === 'generating_image' || status === 'editing_image') ? (
        <div className="ai-image-generating-card" role="img" aria-label={status === 'editing_image' ? 'Изображение редактируется' : 'Изображение создаётся'}>
          <div className="ai-image-generating-art" aria-hidden="true">
            <span className="ai-image-generating-orb ai-image-generating-orb-one" />
            <span className="ai-image-generating-orb ai-image-generating-orb-two" />
            <ImageIcon size={38} strokeWidth={1.3} className="ai-image-generating-icon" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
