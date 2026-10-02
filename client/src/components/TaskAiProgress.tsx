import type { TaskAiProgressStatus } from '../lib/api';

const TASK_AI_PROGRESS_TEXT: Record<TaskAiProgressStatus, string> = {
  analyzing_request: 'Анализирую запрос',
  using_chat_history: 'Учитываю историю диалога',
  searching_subtasks: 'Ищу нужную подзадачу',
  reading_subtask: 'Изучаю детали подзадачи',
  searching_files: 'Ищу нужный файл',
  reading_file: 'Изучаю содержимое файла',
  analyzing_retrieved_context: 'Анализирую найденные данные',
  forming_answer: 'Формирую ответ',
  applying_changes: 'Применяю изменения'
};

export function TaskAiProgress({ status }: { status: TaskAiProgressStatus }) {
  return (
    <div className="miniapp-ai-progress" role="status" aria-live="polite" aria-atomic="true">
      <span key={status} className="miniapp-ai-progress-text">{TASK_AI_PROGRESS_TEXT[status]}</span>
      <span className="miniapp-ai-progress-dots" aria-hidden="true" />
    </div>
  );
}
