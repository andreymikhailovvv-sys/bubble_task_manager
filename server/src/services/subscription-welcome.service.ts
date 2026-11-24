import type { Prisma } from '@prisma/client';
import { getSubscriptionPlanByKey, SUBSCRIPTION_FEATURES } from '../config/subscription-plans.js';

export async function enqueueSubscriptionWelcome(tx: Prisma.TransactionClient, userId: string, planKey: string, operation: string) {
  const plan = getSubscriptionPlanByKey(planKey);
  if (!plan) throw new Error('Unknown subscription plan');
  const content = 'Спасибо, что выбрали подписку «' + plan.name + '»! Ваш тариф активирован.\n\nВозможности тарифа:\n' +
    SUBSCRIPTION_FEATURES[plan.key].join('\n') + '\n\nПриятной работы с Планировычем!';
  await tx.systemNotification.createMany({data:[{userId,eventKey:'subscription-welcome:'+operation,content,subscriptionDeliveryNextAt:new Date()}],skipDuplicates:true});
}
