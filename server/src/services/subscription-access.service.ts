import { prisma } from '../db/prisma.js';
import { subscriptionRank, getSubscriptionPlanByKey } from '../config/subscription-plans.js';

export type PremiumFeature = 'image' | 'mail' | 'live' | 'telegram' | 'monitoring';
const requirements: Record<PremiumFeature, {rank: number; label: string}> = {
  image: {rank: 2, label: 'Создание и редактирование изображений'},
  mail: {rank: 2, label: 'Почтовый ИИ-ассистент'},
  live: {rank: 2, label: 'Живое общение с ИИ'},
  telegram: {rank: 3, label: 'Telegram ИИ-ассистент'},
  monitoring: {rank: 3, label: 'Автомониторинг задач'}
};
export class SubscriptionAccessError extends Error {
  readonly status = 403;
  readonly code = 'SUBSCRIPTION_FEATURE_UNAVAILABLE';
  constructor(public readonly requiredPlan: 'pro' | 'max', label: string) {
    super(`Функция «${label}» недоступна на вашем тарифе. Она доступна начиная с тарифа «${getSubscriptionPlanByKey(requiredPlan)!.name}».`);
  }
}
export function effectiveSubscriptionRank(user: {subscriptionPlan: string; subscriptionExpiresAt: Date | null} | null, now = new Date()) {
  return user?.subscriptionExpiresAt && user.subscriptionExpiresAt > now ? subscriptionRank(user.subscriptionPlan) : 0;
}
export async function getSubscriptionRank(userId: string) {
  return effectiveSubscriptionRank(await prisma.user.findUnique({where:{id:userId},select:{subscriptionPlan:true,subscriptionExpiresAt:true}}));
}
export function featureAccessError(rank: number, feature: PremiumFeature) {
  const required = requirements[feature];
  return rank < required.rank ? new SubscriptionAccessError(required.rank === 2 ? 'pro' : 'max', required.label) : null;
}
export async function requireSubscriptionFeature(userId: string, feature: PremiumFeature) {
  const error = featureAccessError(await getSubscriptionRank(userId), feature);
  if (error) throw error;
}
export function modelAccessError(rank: number, model?: string) {
  if (model === 'gpt-6.1-terra' && rank < 2) return new SubscriptionAccessError('pro', 'Модель Terra');
  if ((model === 'gpt-6.1-sol' || model === 'gpt-6-sol' || model?.includes('astra')) && rank < 3) return new SubscriptionAccessError('max', model?.includes('astra') ? 'Модель Astra' : 'Модель Sol');
  return null;
}
export function premiumToolFeature(name: string): PremiumFeature | null {
  if (name === 'generate_image') return 'image';
  if (name === 'search_mailbox' || name === 'prepare_mail_send') return 'mail';
  if (name === 'request_telegram_chat_read' || name === 'prepare_telegram_send') return 'telegram';
  return null;
}
