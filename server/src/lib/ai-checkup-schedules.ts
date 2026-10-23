/**
 * Per-user daily AI checkup slots. The legacy one-time setting stays readable
 * until a user saves the new editor for the first time.
 */
export type AiCheckupSchedule = { id: string; time: string; instructions: string };
export const MAX_AI_CHECKUP_SCHEDULES = 12;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

export const resolveAiCheckupSchedules = (
  stored: unknown, legacyTime = '10:00'
): AiCheckupSchedule[] => {
  if (Array.isArray(stored)) {
    return stored.filter((row): row is Record<string, unknown> =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row) &&
      typeof (row as Record<string, unknown>).id === 'string' &&
      ID.test((row as Record<string, unknown>).id as string) &&
      typeof (row as Record<string, unknown>).time === 'string' &&
      TIME.test((row as Record<string, unknown>).time as string)
    ).slice(0, MAX_AI_CHECKUP_SCHEDULES).map(row => ({
      id: row.id as string,
      time: row.time as string,
      instructions: typeof row.instructions === 'string' ? row.instructions.slice(0, 1500) : ''
    }));
  }
  return [{ id: 'legacy', time: TIME.test(legacyTime) ? legacyTime : '10:00', instructions: '' }];
};

export function validateAiCheckupSchedules(value: unknown): AiCheckupSchedule[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_AI_CHECKUP_SCHEDULES) {
    throw new TypeError('Добавьте от 1 до 12 расписаний ИИ-чекапов.');
  }
  const seen = new Set<string>();
  return value.map((row: unknown) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Некорректное расписание чекапа.');
    const input = row as Record<string, unknown>;
    const id = typeof input.id === 'string' ? input.id : '';
    const time = typeof input.time === 'string' ? input.time : '';
    const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : '';
    if (!ID.test(id) || seen.has(id) || !TIME.test(time) || instructions.length > 1500) {
      throw new TypeError('Проверьте уникальность расписаний, время и длину пожеланий (до 1500 символов).');
    }
    seen.add(id);
    return { id, time, instructions };
  });
}
