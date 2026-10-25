/**
 * Fallback check-ins are replaceable automation. A specifically scheduled
 * follow-up, in contrast, must survive normal replies and task edits.
 */
export const MONITORING_FALLBACK_DELAY_MS = 3 * 60 * 60 * 1_000;
export const MONITORING_FALLBACK_QUESTION =
  'С последнего сообщения прошло три часа без подтверждённого ответа или прогресса в задаче. Проверь актуальный контекст и кратко напомни пользователю о следующем конкретном действии. Не утверждай, что он ничего не делал вне сервиса.';
