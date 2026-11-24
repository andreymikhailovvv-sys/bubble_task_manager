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
