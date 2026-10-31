import { prisma } from '../db/prisma.js';
import { calculateMaximumRequestCreditsMilli, calculateOpenAiUsageCost, type OpenAiUsage } from './ai-usage-metering.service.js';

const MAX_MILLI = 2_000_000_000;
export class CompanyInsufficientCreditsError extends Error {
  constructor() { super('Недостаточно кредитов организации. Попросите администратора платформы пополнить баланс.'); }
}
export function validateCompanyCreditAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 100000 ? value * 1000 : null;
}
export async function grantCompanyCredits(organizationId:string, amountMilli:number, adminId:string|null) {
  if(!Number.isSafeInteger(amountMilli)||amountMilli<=0||amountMilli>100_000_000)throw new RangeError('Некорректное начисление');
  return prisma.$transaction(async tx=>{
    const updated=await tx.organization.updateMany({
      where:{id:organizationId,aiCreditsMilli:{lte:MAX_MILLI-amountMilli}},
      data:{aiCreditsMilli:{increment:amountMilli}}
    });
    if(!updated.count)throw new Error('Организация не найдена или превышен лимит баланса');
    await tx.organizationAiCreditLedger.create({data:{organizationId,deltaMilli:amountMilli,kind:'ADMIN_GRANT',actorUserId:adminId}});
    const org=await tx.organization.findUniqueOrThrow({where:{id:organizationId},select:{aiCreditsMilli:true}});
    return org.aiCreditsMilli;
  });
}
export async function reserveCompanyCredits(organizationId:string,model:string,feature:string,inputUpperBoundTokens:number,maxOutputTokens:number){
  const maximum=calculateMaximumRequestCreditsMilli({model,inputTokens:inputUpperBoundTokens,maxOutputTokens}).totalCreditsMilli;
  const amountMilli=Math.max(1,maximum);
  if(!Number.isSafeInteger(amountMilli)||amountMilli>MAX_MILLI)throw new RangeError('AI request exceeds budget limits');
  return prisma.$transaction(async tx=>{
    const row=await tx.organization.updateMany({
      where:{id:organizationId,aiCreditsMilli:{gte:amountMilli}},
      data:{aiCreditsMilli:{decrement:amountMilli}}
    });
    if(!row.count)throw new CompanyInsufficientCreditsError();
    const reservation=await tx.organizationAiReservation.create({
      data:{organizationId,reservedMilli:amountMilli,model,feature}
    });
    await tx.organizationAiCreditLedger.create({
      data:{organizationId,deltaMilli:-amountMilli,kind:'RESERVE',reservationId:reservation.id}
    });
    return reservation;
  });
}
export async function settleCompanyCredits(id:string,usage:OpenAiUsage|null,reason:'completed'|'failed') {
  return prisma.$transaction(async tx=>{
    const reservation=await tx.organizationAiReservation.findUnique({where:{id}});
    if(!reservation)throw new Error('Reservation missing');
    if(reservation.state!=='RESERVED')return {chargedMilli:reservation.chargedMilli,refundedMilli:0};
    if(reason==='completed'&&!usage) {
      // The provider may have charged us; preserve the reservation for manual
      // reconciliation rather than quietly refunding and allowing overspend.
      await tx.organizationAiReservation.update({where:{id},data:{state:'UNKNOWN_USAGE',settledAt:new Date()}});
      return {chargedMilli:reservation.reservedMilli,refundedMilli:0};
    }
    const cost=usage?calculateOpenAiUsageCost(reservation.model,usage):null;
    if(usage && cost?.estimatedCreditsMilli===null) {
      await tx.organizationAiReservation.update({where:{id},data:{state:'UNKNOWN_USAGE',settledAt:new Date()}});
      return {chargedMilli:reservation.reservedMilli,refundedMilli:0};
    }
    const actual=reason==='failed'?0:Math.min(reservation.reservedMilli,Math.max(0,cost?.estimatedCreditsMilli??0));
    const refund=reservation.reservedMilli-actual;
    await tx.organizationAiReservation.update({where:{id},data:{
      state:reason==='failed'?'REFUNDED':'SETTLED',chargedMilli:actual,
      inputTokens:cost?.inputTokens,outputTokens:cost?.outputTokens,settledAt:new Date()
    }});
    if(refund){
      await tx.organization.update({where:{id:reservation.organizationId},data:{aiCreditsMilli:{increment:refund}}});
      await tx.organizationAiCreditLedger.create({data:{
        organizationId:reservation.organizationId,deltaMilli:refund,kind:'RESERVATION_REFUND',reservationId:id
      }});
    }
    return {chargedMilli:actual,refundedMilli:refund};
  });
}
export async function getCompanyCreditSnapshot(organizationId:string){
  const [org,usage]=await Promise.all([
    prisma.organization.findUnique({where:{id:organizationId},select:{aiCreditsMilli:true,aiModel:true}}),
    prisma.organizationAiReservation.aggregate({where:{organizationId,state:'SETTLED'},_sum:{chargedMilli:true}})
  ]);
  if(!org)throw new Error('Organization not found');
  return {...org,spentMilli:usage._sum.chargedMilli??0};
}
