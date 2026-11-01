import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileCreditPurchaseFromYooKassa } from '../src/services/credit-purchase.service.js';

test('successful provider payment credits wallet once using Prisma-readable advisory lock', async () => {
  const purchase = {
    id:'purchase-123', userId:'user-123', creditPackKey:'credit_start',
    amountKopecks:19900, creditsMilli:1_800_000, currency:'RUB',
    yookassaPaymentId:'payment-123', status:'pending', creditedAt:null as Date|null
  };
  const wallet = {
    id:'user-123', aiCreditsPeriod:'2026-10', subscriptionPlan:'free',
    aiIncludedCreditsMilli:0, aiBonusCreditsMilli:100_000, aiPurchasedCreditsMilli:0,
    deviceId:null, username:'customer@example.com', passwordHash:'hash',
    googleSub:null, email:'customer@example.com', telegramChatId:null
  };
  let walletGrants=0, lockCalls=0, transactionCount=0;
  const tx={
    $queryRaw:async (query:{sql:string})=>{
      if(query.sql.includes('pg_advisory_xact_lock')) {
        lockCalls++;
        assert.match(query.sql, /SELECT 1::integer AS locked FROM pg_advisory_xact_lock/);
        assert.doesNotMatch(query.sql,/SELECT pg_advisory_xact_lock/);
        return [{locked:1}];
      }
      assert.match(query.sql,/FROM "User"/);
      return [{...wallet}];
    },
    user:{update:async({data}:{data:Record<string,number|string>})=>{
      Object.assign(wallet,data);
      walletGrants++;
      return {...wallet};
    }},
    creditPurchase:{
      findUnique:async()=>({...purchase}),
      update:async({data}:{data:Record<string,unknown>})=>{
        Object.assign(purchase,data);
        return {...purchase};
      }
    }
  };
  const db={
    creditPurchase:{findUnique:async()=>({...purchase}),update:async()=>{throw Error('unexpected outer update')}},
    $transaction:async(callback:(tx:typeof tx)=>Promise<unknown>)=>{transactionCount++;return callback(tx);}
  };
  const payment={
    id:'payment-123',status:'succeeded',paid:true,
    amount:{value:'199.00',currency:'RUB'},
    metadata:{purchase_id:'purchase-123',credit_pack_key:'credit_start'},
    recipient:{account_id:'shop-1'}
  };
  const originalShop=process.env.YOOKASSA_SHOP_ID;
  process.env.YOOKASSA_SHOP_ID='shop-1';
  try{
    const first=await reconcileCreditPurchaseFromYooKassa(payment,'purchase-123',db as any);
    assert.equal(first.outcome,'succeeded');
    assert.equal(first.purchase?.creditedAt instanceof Date,true);
    assert.equal(wallet.aiPurchasedCreditsMilli,1_800_000);
    assert.equal(walletGrants,1);
    const second=await reconcileCreditPurchaseFromYooKassa(payment,'purchase-123',db as any);
    assert.equal(second.outcome,'succeeded');
    assert.equal(wallet.aiPurchasedCreditsMilli,1_800_000);
    assert.equal(walletGrants,1);
    assert.equal(lockCalls,2);
    assert.equal(transactionCount,2);
  }finally{
    if(originalShop===undefined)delete process.env.YOOKASSA_SHOP_ID;else process.env.YOOKASSA_SHOP_ID=originalShop;
  }
});

test('payment with mismatched amount is never credited',async()=>{
  const purchase={
    id:'purchase-123', userId:'owner', creditPackKey:'credit_start', currency:'RUB',
    amountKopecks:19900, yookassaPaymentId:'payment-123', creditsMilli:1_800_000, creditedAt:null
  };
  const db={creditPurchase:{findUnique:async()=>purchase},$transaction:async()=>{throw Error('must not grant')}};
  const previous=console.warn;let mismatch=false;
  console.warn=(message:string)=>{if(message.includes('verification mismatch'))mismatch=true;};
  try{
    const result=await reconcileCreditPurchaseFromYooKassa({
      id:'payment-123',status:'succeeded',paid:true,
      amount:{value:'0.01',currency:'RUB'},
      metadata:{purchase_id:'purchase-123',credit_pack_key:'credit_start'}
    },'purchase-123',db as any);
    assert.equal(result.outcome,'ignored');
    assert.equal(mismatch,true);
  }finally{console.warn=previous;}
});
