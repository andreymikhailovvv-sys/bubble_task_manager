import { Image as ImageIcon } from 'lucide-react';
import type { AiChatProgressStatus, TaskAiProgressStatus } from '../lib/api';

const PROGRESS_TEXT: Record<AiChatProgressStatus | TaskAiProgressStatus, string> = {
  analyzing_request: 'Анализирую запрос', using_chat_history: 'Учитываю историю диалога',
  searching_tasks: 'Ищу задачи', listing_tasks: 'Собираю список задач', reading_task: 'Изучаю задачу', checking_sectors: 'Проверяю сектора',
  searching_subtasks: 'Ищу нужную подзадачу', analyzing_subtasks: 'Анализирую подзадачи', reading_subtask: 'Изучаю детали подзадачи',
  searching_files: 'Ищу нужный файл', reading_file: 'Изучаю содержимое файла', reading_attachment: 'Изучаю вложение',
  searching_web: 'Ищу в интернете', analyzing_web_results: 'Изучаю найденные источники',
  analyzing_retrieved_context: 'Анализирую найденные данные', forming_answer: 'Формирую ответ', applying_changes: 'Вношу изменения',
  generating_image: 'Создаю изображение'
};

export function AiProgress({ status }: { status: AiChatProgressStatus | TaskAiProgressStatus }) {
  return (
    <div className="ai-progress-group">
      <div className="miniapp-ai-progress" role="status" aria-live="polite" aria-atomic="true">
        <span key={status} className="miniapp-ai-progress-text">{PROGRESS_TEXT[status]}</span>
        <span className="miniapp-ai-progress-dots" aria-hidden="true" />
      </div>
      {status === 'generating_image' ? (
        <div className="ai-image-generating-card" role="img" aria-label="Изображение создаётся">
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
