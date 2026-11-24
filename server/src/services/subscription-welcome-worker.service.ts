import { prisma } from '../db/prisma.js';
import { telegramService } from './telegram.service.js';
import { accountMailConfigured, sendAccountMail } from './account-email.service.js';

let busy = false;
export async function dispatchSubscriptionWelcomes() {
  if (busy) return;
  busy = true;
  try {
    const now = new Date(), stale = new Date(now.getTime() - 5 * 60_000);
    const events = await prisma.systemNotification.findMany({where:{
      eventKey:{startsWith:'subscription-welcome:'}, subscriptionDeliveryNextAt:{lte:now},
      OR:[{subscriptionDeliveryClaimedAt:null},{subscriptionDeliveryClaimedAt:{lt:stale}}]
    },take:20,orderBy:{createdAt:'asc'},include:{user:{select:{telegramChatId:true,email:true,emailVerifiedAt:true}}}});
    for (const event of events) {
      const claim = new Date();
      const acquired = await prisma.systemNotification.updateMany({where:{id:event.id,subscriptionDeliveryNextAt:{lte:now},OR:[{subscriptionDeliveryClaimedAt:null},{subscriptionDeliveryClaimedAt:{lt:stale}}]},data:{subscriptionDeliveryClaimedAt:claim}});
      if (!acquired.count) continue;
      let telegramDone = !!event.subscriptionTelegramSentAt || !event.user.telegramChatId;
      let emailDone = !!event.subscriptionEmailSentAt || !event.user.email || !event.user.emailVerifiedAt;
      try {
        if (!telegramDone && event.user.telegramChatId) {
          telegramDone = await telegramService.sendAdminBroadcast(event.user.telegramChatId,{text:event.content});
          if (telegramDone) await prisma.systemNotification.updateMany({where:{id:event.id,subscriptionDeliveryClaimedAt:claim},data:{subscriptionTelegramSentAt:new Date()}});
        }
      } catch (error) { console.warn('[Subscription welcome] Telegram delivery failed', {id:event.id}); }
      try {
        if (!emailDone && event.user.email && accountMailConfigured()) {
          await sendAccountMail(event.user.email,'Ваша подписка Планировыча активирована',event.content);
          emailDone = true;
          await prisma.systemNotification.updateMany({where:{id:event.id,subscriptionDeliveryClaimedAt:claim},data:{subscriptionEmailSentAt:new Date()}});
        }
      } catch (error) { console.warn('[Subscription welcome] email delivery failed', {id:event.id}); }
      await prisma.systemNotification.updateMany({where:{id:event.id,subscriptionDeliveryClaimedAt:claim},data:{
        subscriptionDeliveryClaimedAt:null,subscriptionDeliveryNextAt:telegramDone && emailDone ? null : new Date(Date.now()+5*60_000)
      }});
    }
  } catch (error) { console.error('[Subscription welcome] worker failed',error); }
  finally { busy = false; }
}
export function startSubscriptionWelcomeWorker() {
  void dispatchSubscriptionWelcomes();
  const timer = setInterval(() => void dispatchSubscriptionWelcomes(),60_000);
  timer.unref();
}
