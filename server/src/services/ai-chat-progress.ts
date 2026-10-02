export type AiChatProgressStatus =
  | 'analyzing_request'
  | 'using_chat_history'
  | 'searching_tasks'
  | 'listing_tasks'
  | 'reading_task'
  | 'checking_sectors'
  | 'analyzing_retrieved_context'
  | 'applying_changes'
  | 'reading_attachment'
  | 'forming_answer';
