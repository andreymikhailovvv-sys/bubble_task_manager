export type TaskAiProgressStatus =
  | 'analyzing_request'
  | 'using_chat_history'
  | 'searching_subtasks'
  | 'analyzing_subtasks'
  | 'reading_subtask'
  | 'searching_files'
  | 'reading_file'
  | 'analyzing_retrieved_context'
  | 'forming_answer'
  | 'applying_changes';
