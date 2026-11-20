import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { canonicalEconomicAction } from '../src/services/economic-ai-action-validation.service.js';
import { applyEconomicProposal, editEconomicProposal, undoEconomicProposal, rejectEconomicProposal, prepareEconomicProposals } from '../src/services/economic-ai-proposals.service.js';

const action=(entity:string,kind:string,payload:Record<string,unknown>,targetId:string|null=null)=>
  canonicalEconomicAction({entity,action:kind,targetId,payload});
test('Economic AI applies and reverses real PostgreSQL ledger changes without crossing user boundaries',async()=>{
  assert.ok(process.env.DATABASE_URL?.startsWith('postgresql://'),'This integration test requires ephemeral PostgreSQL');
  const suffix=randomUUID();
  const [a,b]=await Promise.all([
    prisma.user.create({data:{email:'econ-tester-a-'+suffix+'@example.test'}}),
    prisma.user.create({data:{email:'econ-tester-b-'+suffix+'@example.test'}})
  ]);
  try{
    const account=await prisma.economicAccount.create({data:{
      userId:a.id,name:'Основной',isPrimary:true,openingBalanceMinor:100000n
    }});
    const other=await prisma.economicAccount.create({data:{
      userId:b.id,name:'Чужой',isPrimary:true,openingBalanceMinor:100000n
    }});
    const propose=async(userId:string,input:ReturnType<typeof action>)=>{
      const [prepared]=await prepareEconomicProposals(userId,[input]);
      return prisma.economicAiProposal.create({data:{
        userId,entity:input.entity,action:input.action,targetId:input.targetId,
        payload:input.payload,before:prepared.before??undefined
      }});
    };

    // 1. Create an expense. A second approval cannot duplicate it.
    const expense=await propose(a.id,action('operation','create',{
      kind:'EXPENSE',title:'Бензин',amountMinor:'25000',sourceAccountId:account.id
    }));
    const race=await Promise.allSettled([
      applyEconomicProposal(a.id,expense.id),applyEconomicProposal(a.id,expense.id)
    ]);
    assert.ok(race.some(x=>x.status==='fulfilled'));
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,title:'Бензин'}}),1);
    assert.equal((await prisma.economicAiProposal.findUniqueOrThrow({where:{id:expense.id}})).status,'APPLIED');
    // Correcting an already applied (including auto-applied) chip updates
    // the same row, without double-spending or duplicating the transaction.
    const previousPayload=(await prisma.economicAiProposal.findUniqueOrThrow({
      where:{id:expense.id}})).payload;
    const revised=await editEconomicProposal(a.id,expense.id,{
      expectedPayload:previousPayload,payload:{
        kind:'EXPENSE',title:'Бензин',amountMinor:'30000',sourceAccountId:account.id,
        category:'Транспорт'
      }
    });
    assert.equal(revised.status,'APPLIED');
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,title:'Бензин'}}),1);
    assert.equal((await prisma.economicOperation.findFirstOrThrow({
      where:{userId:a.id,title:'Бензин'}})).amountMinor,30000n);
    await assert.rejects(()=>editEconomicProposal(a.id,expense.id,{
      expectedPayload:previousPayload,payload:{kind:'EXPENSE',title:'Неверно',
        amountMinor:'50000',sourceAccountId:account.id}
    }),/Карточка была изменена/);
    await assert.rejects(()=>editEconomicProposal(b.id,expense.id,{
      expectedPayload:previousPayload,payload:{kind:'EXPENSE',title:'Чужое',
        amountMinor:'50000',sourceAccountId:other.id}
    }),/не найдено/);
    await assert.rejects(()=>undoEconomicProposal(b.id,expense.id),/не найдено/);
    assert.equal((await undoEconomicProposal(a.id,expense.id)).status,'UNDONE');
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,title:'Бензин'}}),0);

    // Pending chip can be edited before first approval.
    const pending=await propose(a.id,action('operation','create',{
      kind:'EXPENSE',title:'Продукты',amountMinor:'5000',sourceAccountId:account.id
    }));
    await editEconomicProposal(a.id,pending.id,{
      expectedPayload:pending.payload,payload:{
        kind:'EXPENSE',title:'Продукты',amountMinor:'7800',
        sourceAccountId:account.id,category:'Продукты'
      }
    });
    const saved=await applyEconomicProposal(a.id,pending.id);
    const pendingRecord=await prisma.economicOperation.findUniqueOrThrow({
      where:{id:saved.appliedEntityId!}
    });
    assert.equal(pendingRecord.amountMinor,7800n);
    assert.equal(pendingRecord.category,'Продукты');
    await undoEconomicProposal(a.id,pending.id);

    // 2. Linked debt cashflow creates FUNDING and SETTLEMENT, then reverts both.
    const debt=await propose(a.id,action('debt','create',{
      direction:'OWE',counterparty:'Друг',amountMinor:'50000',paidMinor:'10000',
      postedToAccount:true,accountId:account.id
    }));
    const appliedDebt=await applyEconomicProposal(a.id,debt.id);
    assert.equal(appliedDebt.status,'APPLIED');
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,debtId:appliedDebt.appliedEntityId!}}),2);
    const source=await prisma.economicOperation.findMany({where:{userId:a.id,debtId:appliedDebt.appliedEntityId!}});
    assert.equal(source.reduce((n,o)=>n+(o.kind==='DEBT_BORROWED'?o.amountMinor:-o.amountMinor),0n),40000n);
    assert.equal((await undoEconomicProposal(a.id,debt.id)).status,'UNDONE');
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,debtId:appliedDebt.appliedEntityId!}}),0);

    // 3. Create, update and undo a separate account.
    const created=await propose(a.id,action('account','create',{name:'Накопления',openingBalanceMinor:'123450'}));
    const newAccount=await applyEconomicProposal(a.id,created.id);
    assert.equal((await prisma.economicAccount.findUniqueOrThrow({where:{id:newAccount.appliedEntityId!}})).openingBalanceMinor,123450n);
    await undoEconomicProposal(a.id,created.id);
    assert.equal(await prisma.economicAccount.count({where:{id:newAccount.appliedEntityId!}}),0);

    // Editing the current balance creates a correcting ledger operation,
    // preserving the opening baseline and remaining reversible.
    const grocery=await prisma.economicOperation.create({data:{
      userId:a.id,kind:'EXPENSE',title:'Продукты',amountMinor:25000n,
      sourceAccountId:account.id
    }});
    const currentBalance=await propose(a.id,action('account','update',{balanceMinor:'33000'},account.id));
    assert.equal((await applyEconomicProposal(a.id,currentBalance.id)).status,'APPLIED');
    assert.equal((await prisma.economicAccount.findUniqueOrThrow({where:{id:account.id}})).openingBalanceMinor,100000n);
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,sourceAccountId:account.id,isAdjustment:true,kind:'EXPENSE',amountMinor:42000n}}),1);
    assert.equal(await prisma.economicOperation.count({where:{id:grocery.id}}),1);
    assert.equal((await undoEconomicProposal(a.id,currentBalance.id)).status,'UNDONE');
    assert.equal((await prisma.economicAccount.findUniqueOrThrow({where:{id:account.id}})).openingBalanceMinor,100000n);
    assert.equal(await prisma.economicOperation.count({where:{userId:a.id,sourceAccountId:account.id,isAdjustment:true,kind:'INCOME',amountMinor:42000n}}),1);
    await prisma.economicOperation.delete({where:{id:grocery.id}});

    // Credit-card accounts store the available limit as a real account balance.
    const cardDraft=await propose(a.id,action('account','create',{
      name:'Кредитная карта',accountType:'CREDIT_CARD',
      creditLimitMinor:'5000000',balanceMinor:'4200000'
    }));
    const cardCreated=await applyEconomicProposal(a.id,cardDraft.id);
    const card=await prisma.economicAccount.findUniqueOrThrow({where:{id:cardCreated.appliedEntityId!}});
    assert.equal(card.accountType,'CREDIT_CARD');
    assert.equal(card.creditLimitMinor,5000000n);
    assert.equal(card.openingBalanceMinor,4200000n);
    const cardExpense=await prisma.economicOperation.create({data:{
      userId:a.id,kind:'EXPENSE',title:'Покупка по кредитке',amountMinor:90000n,
      sourceAccountId:card.id
    }});
    const cardEdit=await propose(a.id,action('account','update',{
      balanceMinor:'4150000'
    },card.id));
    await applyEconomicProposal(a.id,cardEdit.id);
    assert.equal(await prisma.economicOperation.count({where:{
      userId:a.id,isAdjustment:true,sourceAccountId:card.id,
      kind:'INCOME',amountMinor:40000n
    }}),1);
    assert.equal((await undoEconomicProposal(a.id,cardEdit.id)).status,'UNDONE');
    assert.equal(await prisma.economicOperation.count({where:{
      userId:a.id,isAdjustment:true,sourceAccountId:card.id,
      kind:'EXPENSE',amountMinor:40000n
    }}),1);
    await prisma.economicOperation.delete({where:{id:cardExpense.id}});
    await prisma.economicOperation.deleteMany({where:{sourceAccountId:card.id,isAdjustment:true}});
    await prisma.economicAccount.delete({where:{id:card.id}});

    // 4. A stale edit must never overwrite a newer manual change.
    const stale=await propose(a.id,action('account','update',{name:'Старое имя'},account.id));
    await prisma.economicAccount.update({where:{id:account.id},data:{name:'Переименовано вручную'}});
    await assert.rejects(()=>applyEconomicProposal(a.id,stale.id),/изменились/);
    assert.equal((await prisma.economicAccount.findUniqueOrThrow({where:{id:account.id}})).name,'Переименовано вручную');

    // 5. Undo refuses to clobber another later edit.
    const rename=await propose(a.id,action('account','update',{name:'Обновлено ИИ'},account.id));
    await applyEconomicProposal(a.id,rename.id);
    await prisma.economicAccount.update({where:{id:account.id},data:{name:'Изменено позже'}});
    await assert.rejects(()=>undoEconomicProposal(a.id,rename.id),/изменена/);
    assert.equal((await prisma.economicAccount.findUniqueOrThrow({where:{id:account.id}})).name,'Изменено позже');

    // 6. Cross-user source-account ID is rejected in real transaction.
    const foreign=await propose(a.id,action('operation','create',{
      kind:'INCOME',title:'Чужая проводка',amountMinor:'9999',sourceAccountId:other.id
    }));
    await assert.rejects(()=>applyEconomicProposal(a.id,foreign.id),/не найден/);
    assert.equal(await prisma.economicOperation.count({where:{userId:b.id}}),0);

    // 7. Categories and loan proposals remain reversible.
    const cat=await propose(a.id,action('category','create',{kind:'EXPENSE',name:'Обучение'}));
    const category=await applyEconomicProposal(a.id,cat.id);
    assert.equal((await undoEconomicProposal(a.id,cat.id)).status,'UNDONE');
    assert.equal(await prisma.economicCategory.count({where:{id:category.appliedEntityId!}}),0);

    const loan=await propose(a.id,action('loan','create',{
      name:'Автокредит',principalMinor:'7000000',annualRateBps:1250,
      termMonths:48,startDate:'2026-11-16',paidMinor:'0'
    }));
    const loanResult=await applyEconomicProposal(a.id,loan.id);
    assert.equal(await prisma.economicLoan.count({where:{id:loanResult.appliedEntityId!}}),1);
    assert.equal((await undoEconomicProposal(a.id,loan.id)).status,'UNDONE');

    // 8. Rejection is final and autoapply is off until user opts in.
    const noChange=await propose(a.id,action('category','create',{kind:'INCOME',name:'Разовое'}));
    assert.equal((await rejectEconomicProposal(a.id,noChange.id)).status,'REJECTED');
    assert.equal((await applyEconomicProposal(a.id,noChange.id)).status,'REJECTED');
    assert.equal(await prisma.economicCategory.count({where:{userId:a.id,name:'Разовое'}}),0);
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).economicAiAutoApply,false);
    await prisma.user.update({where:{id:a.id},data:{economicAiAutoApply:true}});
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).economicAiAutoApply,true);
  }finally{
    await prisma.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
    await prisma.$disconnect();
  }
});
