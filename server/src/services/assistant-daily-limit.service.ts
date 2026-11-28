import { getSubscriptionPlanByKey } from '../config/subscription-plans.js';

export function validateAssistantDailyPercent(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
    throw Object.assign(new Error('Дневной лимит должен быть от 0 до 100%'), {status:400});
  }
  return value;
}

export function effectiveAssistantDailyLimit(legacy: number | null, percent: number | null | undefined, owner: {subscriptionPlan:string; subscriptionExpiresAt:Date|null}|null, now=new Date()): number | null {
  if (percent == null) return legacy;
  const plan = owner?.subscriptionExpiresAt && owner.subscriptionExpiresAt > now ? getSubscriptionPlanByKey(owner.subscriptionPlan) : null;
  if (!plan) return 0;
  return Math.floor(Math.floor(plan.creditsAmount * 1000 / 20) * percent / 100);
}
