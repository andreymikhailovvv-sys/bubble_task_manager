export const EFFICIENCY_BUCKET_ORDER = ['task', 'habit', 'ai', 'focus'] as const;

export type EfficiencyBucketKey = typeof EFFICIENCY_BUCKET_ORDER[number];
export type EfficiencyBucketScores = Record<EfficiencyBucketKey, number>;

const clampBucketScore = (value: number) => Math.max(0, Number(value.toFixed(6)));

/**
 * Списывает штраф последовательно: сначала из задач, затем из привычек,
 * работы с ИИ и режима концентрации. Неиспользованный остаток штрафа
 * переносится в следующую категорию.
 */
export const deductEfficiencyPenalty = (
  scores: EfficiencyBucketScores,
  penalty: number
): EfficiencyBucketScores => {
  const next = { ...scores };
  let remainingPenalty = Math.max(0, penalty);

  for (const bucket of EFFICIENCY_BUCKET_ORDER) {
    if (remainingPenalty <= 0) break;
    const deducted = Math.min(next[bucket], remainingPenalty);
    next[bucket] = clampBucketScore(next[bucket] - deducted);
    remainingPenalty = clampBucketScore(remainingPenalty - deducted);
  }

  return next;
};
