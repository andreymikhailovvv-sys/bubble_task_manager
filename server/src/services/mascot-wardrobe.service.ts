
import { prisma } from '../db/prisma.js';
import { effectiveSubscriptionRank, SubscriptionAccessError } from './subscription-access.service.js';
import { MASCOT_SKINS, effectiveMascotSkin, findMascotSkin } from '../config/mascot-skins.js';

const selection = { id:true, subscriptionPlan:true, subscriptionExpiresAt:true, plannerMascotSkin:true, economicMascotSkin:true } as const;
type WardrobeUser = { id:string; subscriptionPlan:string; subscriptionExpiresAt:Date|null; plannerMascotSkin:string; economicMascotSkin:string };
export function wardrobeState(user: WardrobeUser, now = new Date()) {
  const rank = effectiveSubscriptionRank(user, now);
  return { userId:user.id, rank, expiresAt:user.subscriptionExpiresAt?.toISOString() ?? null,
    selected:{ planner:effectiveMascotSkin('planner',user.plannerMascotSkin,rank),
      economic:effectiveMascotSkin('economic',user.economicMascotSkin,rank) },
    catalog:MASCOT_SKINS };
}
export async function getMascotWardrobe(userId:string) {
  const user = await prisma.user.findUniqueOrThrow({ where:{id:userId}, select:selection });
  return wardrobeState(user);
}
export async function equipMascotSkin(userId:string, variant:unknown, skinId:unknown) {
  const skin = findMascotSkin(variant,skinId);
  if (!skin) throw new TypeError('Неизвестный образ маскота.');
  const user = await prisma.user.findUniqueOrThrow({ where:{id:userId}, select:selection });
  const rank = effectiveSubscriptionRank(user);
  if (rank < skin.rank) throw new SubscriptionAccessError(skin.rank === 2 ? 'pro' : 'max', 'Образ «'+skin.name+'»');
  const key = skin.variant === 'planner' ? 'plannerMascotSkin' : 'economicMascotSkin';
  // Compare the entitlement snapshot in the write itself; a concurrent admin
  // change or expiry must never persist a newly locked choice.
  const updated = await prisma.user.updateMany({ where:{id:userId, subscriptionPlan:user.subscriptionPlan,
    ...(skin.rank > 0 ? { subscriptionExpiresAt:{equals:user.subscriptionExpiresAt,gt:new Date()} } :
      {subscriptionExpiresAt:user.subscriptionExpiresAt})}, data:{[key]:skin.id} });
  return updated.count === 1 ? getMascotWardrobe(userId) : null;
}
