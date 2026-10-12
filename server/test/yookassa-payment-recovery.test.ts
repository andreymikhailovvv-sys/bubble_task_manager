import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcilePendingCreditPurchases } from '../src/services/credit-purchase-recovery.service.js';
import { YooKassaError, yookassaService } from '../src/services/yookassa.service.js';

test('status GET retries an interrupted network call with no secret-bearing error messages', async () => {
  const oldFetch = globalThis.fetch;
  const oldShop = process.env.YOOKASSA_SHOP_ID;
  const oldKey = process.env.YOOKASSA_SECRET_KEY;
  process.env.YOOKASSA_SHOP_ID = 'safe-test-shop';
  process.env.YOOKASSA_SECRET_KEY = 'secret-not-to-log';
  const calls: { method: string; headers: Headers }[] = [];
  globalThis.fetch = async (_url, init) => {
    calls.push({ method: String(init?.method), headers: new Headers(init?.headers) });
    if (calls.length === 1) {
      const failure = new TypeError('fetch failed');
      (failure as Error & { cause: { code: string } }).cause = { code: 'ECONNRESET' };
      throw failure;
    }
    return new Response(JSON.stringify({
      id:'payment-123',status:'succeeded',paid:true,
      amount:{value:'199.00',currency:'RUB'},
      metadata:{purchase_id:'purchase-123',credit_pack_key:'credit_start'}
    }), { status:200,headers:{'Content-Type':'application/json'} });
  };
  try {
    const payment = await yookassaService.getPayment('payment-123');
    assert.equal(payment.status, 'succeeded');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].headers.has('content-type'), false);
    assert.equal(calls[0].headers.get('accept'), 'application/json');
    assert.ok(calls[0].headers.has('authorization'));
  } finally {
    globalThis.fetch=oldFetch;
    if(oldShop === undefined) delete process.env.YOOKASSA_SHOP_ID; else process.env.YOOKASSA_SHOP_ID=oldShop;
    if(oldKey === undefined) delete process.env.YOOKASSA_SECRET_KEY; else process.env.YOOKASSA_SECRET_KEY=oldKey;
  }
});

test('provider HTTP 401 is not retried or confused with a network timeout', async () => {
  const oldFetch=globalThis.fetch, oldShop=process.env.YOOKASSA_SHOP_ID, oldKey=process.env.YOOKASSA_SECRET_KEY;
  process.env.YOOKASSA_SHOP_ID='test-shop';process.env.YOOKASSA_SECRET_KEY='test-key';
  let count=0;
  globalThis.fetch=async()=>{count++;return new Response(JSON.stringify({code:'invalid_credentials'}),{status:401});};
  try {
    await assert.rejects(yookassaService.getPayment('payment-123'), (error:unknown)=>{
      assert.ok(error instanceof YooKassaError);
      assert.equal(error.httpStatus,401);
      assert.equal(error.providerCode,'invalid_credentials');
      assert.equal(error.attempts,1);
      return true;
    });
    assert.equal(count,1);
  } finally {
    globalThis.fetch=oldFetch;
    if(oldShop===undefined)delete process.env.YOOKASSA_SHOP_ID;else process.env.YOOKASSA_SHOP_ID=oldShop;
    if(oldKey===undefined)delete process.env.YOOKASSA_SECRET_KEY;else process.env.YOOKASSA_SECRET_KEY=oldKey;
  }
});

test('recovery only reconciles claimed pending purchases via YooKassa, without trusting webhooks', async () => {
  let checkedAt: Date | null = null;
  let status='pending';
  let attempts=0;
  const purchaseId='cmv5i6uji06mjlm2tvu93zimr';
  const providerPaymentId='provider-payment-123';
  const db={
    creditPurchase:{
      findMany:async()=>status==='pending' && (!checkedAt || Date.now()-checkedAt.getTime()>60_000)
        ? [{id:purchaseId,yookassaPaymentId:providerPaymentId}]:[],
      updateMany:async({where,data}:any)=>{
        if(status!=='pending'||(checkedAt&&checkedAt.getTime()>where.OR[1].providerCheckedAt.lte.getTime())) return {count:0};
        checkedAt=data.providerCheckedAt;return {count:1};
      }
    }
  };
  const payment={
    id:providerPaymentId,status:'succeeded',paid:true,
    amount:{value:'199.00',currency:'RUB'},
    metadata:{purchase_id:purchaseId,credit_pack_key:'credit_start'}
  };
  const provider={ getPayment:async(id:string)=>{assert.equal(id,providerPaymentId); attempts++;return payment;} };
  let granted=0;
  const reconcile=async(observed:any,id:string)=>{
    assert.equal(observed,payment);assert.equal(id,purchaseId);
    assert.equal(observed.paid,true);
    status='succeeded';granted++;return {outcome:'succeeded'};
  };
  const first=await reconcilePendingCreditPurchases(db as any,provider,reconcile);
  assert.deepEqual(first,{scanned:1,confirmed:1,failed:0});
  const again=await reconcilePendingCreditPurchases(db as any,provider,reconcile);
  assert.deepEqual(again,{scanned:0,confirmed:0,failed:0});
  assert.equal(granted,1);assert.equal(attempts,1);
});

test('temporary verification failure keeps purchase pending for a later retry',async()=>{
  const observed:string[]=[];
  const db={
    creditPurchase:{
      findMany:async()=>[{id:'purchase-a',yookassaPaymentId:'payment-a'}],
      updateMany:async()=>({count:1})
    }
  };
  const provider={getPayment:async()=>{throw new YooKassaError('YooKassa request failed',{failureKind:'network',networkCode:'ECONNRESET',attempts:3});}};
  const previous=console.warn;
  console.warn=(message:string,details:any)=>{observed.push(message);assert.equal(details.networkCode,'ECONNRESET');};
  try{
    const result=await reconcilePendingCreditPurchases(db as any,provider,async()=>{throw new Error('Must not grant');});
    assert.deepEqual(result,{scanned:1,confirmed:0,failed:1});
    assert.equal(observed.length,1);
  }finally{console.warn=previous;}
});
