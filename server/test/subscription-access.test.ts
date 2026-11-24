import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSubscriptionRank, featureAccessError, modelAccessError, premiumToolFeature } from '../src/services/subscription-access.service.js';
import { subscriptionRank } from '../src/config/subscription-plans.js';

test('subscription rank and expiry gate expensive features',()=>{
  const now = new Date('2026-11-24T00:00:00Z');
  for(const [plan,rank] of [['free',0],['start',1],['pro',2],['max',3]] as const) {
    assert.equal(subscriptionRank(plan),rank);
    assert.equal(effectiveSubscriptionRank({subscriptionPlan:plan,subscriptionExpiresAt:new Date('2026-12-24T00:00:00Z')},now),rank);
    assert.equal(effectiveSubscriptionRank({subscriptionPlan:plan,subscriptionExpiresAt:now},now),0);
    assert.equal(modelAccessError(rank,'gpt-6-luna'),null);
    assert.equal(Boolean(modelAccessError(rank,'gpt-6.1-terra')),rank<2);
    assert.equal(Boolean(modelAccessError(rank,'gpt-6.1-sol')),rank<3);
    for(const feature of ['image','mail','live'] as const) assert.equal(Boolean(featureAccessError(rank,feature)),rank<2);
    for(const feature of ['telegram','monitoring'] as const) assert.equal(Boolean(featureAccessError(rank,feature)),rank<3);
  }
  assert.match(featureAccessError(1,'image')!.message,/Про/);
  assert.match(featureAccessError(2,'telegram')!.message,/Максимум/);
  assert.equal(premiumToolFeature('generate_image'),'image');
  assert.equal(premiumToolFeature('search_mailbox'),'mail');
  assert.equal(premiumToolFeature('prepare_telegram_send'),'telegram');
  assert.equal(premiumToolFeature('create_word_document'),null);
});


test('file tool subscription denial stays explicit and never becomes a format error', async (t) => {
  const { fileToolFailure, terminalFileToolAnswer } = await import('../src/services/ai-file-operations.service.js');
  const { subscriptionAccessRepository, SubscriptionAccessError } = await import('../src/services/subscription-access.service.js');
  const { generateAiImage } = await import('../src/services/ai-image-generation.service.js');
  const stub = t.mock.method(subscriptionAccessRepository, 'findUser', async () => ({ subscriptionPlan: 'start', subscriptionExpiresAt: new Date(Date.now()+86400000) }));
  const input = { userId: 'test', actionId: 'test', apiKey: 'unused', args: { prompt: 'square version', size: '1024x1024', sourceFileIds: [] } };
  await assert.rejects(() => generateAiImage(input), (error: unknown) => {
    assert.ok(error instanceof SubscriptionAccessError);
    const result = fileToolFailure(error, '', 'IMAGE_GENERATION_FAILED');
    assert.equal(result.code, 'SUBSCRIPTION_FEATURE_UNAVAILABLE');
    assert.equal(terminalFileToolAnswer('generate_image', result), error.message);
    assert.equal(terminalFileToolAnswer('edit_file', result), error.message);
    assert.equal(terminalFileToolAnswer('read_file', result), null);
    return true;
  });
  assert.equal(stub.mock.callCount(), 1);
  assert.equal(premiumToolFeature('edit_file'), null);
  assert.equal(premiumToolFeature('create_excel_workbook'), null);
  assert.equal(premiumToolFeature('read_file'), null);
  assert.equal(terminalFileToolAnswer('edit_file', {ok:true,message:'done'}), null);
  assert.equal(terminalFileToolAnswer('generate_image', {ok:false,code:'IMAGE_GENERATION_FAILED',message:'HTTP 400'}), 'HTTP 400');
});

test('Express 4 forwards a denied task mutation to error middleware instead of terminating Node', async () => {
  const { asyncHandler } = await import('../src/middleware/async-handler.js');
  const { readFileSync } = await import('node:fs');
  const route = readFileSync(new URL('../src/routes/api.ts', import.meta.url), 'utf8');
  assert.match(route, /asyncHandler\(taskController\.create\)/);
  assert.match(route, /asyncHandler\(taskController\.update\)/);
  const denied = featureAccessError(1,'monitoring')!;
  const handler = asyncHandler(async () => { throw denied; });
  const forwarded = await new Promise(resolve => handler({} as never, {} as never, resolve));
  assert.equal(forwarded, denied);
});
