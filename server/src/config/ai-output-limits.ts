export const AI_OUTPUT_TOKEN_LIMITS = {
  chat: 4096,
  task_chat: 3072,
  general_chat: 3072,
  planner: 4096,
  generate_task: 2048,
  generate_subtasks: 2048,
  optimize_timeline: 2048,
  notification: 1024,
  recurrence: 1024
} as const;

export type AiFeature = keyof typeof AI_OUTPUT_TOKEN_LIMITS;
