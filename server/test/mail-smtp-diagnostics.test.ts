import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MailSmtpError,explainMailSmtpError} from '../src/services/mail-smtp.service.js';

test('connection refusal before SMTP DATA is a definite failure, with useful nonsecret diagnostics',()=>{
  const error=new MailSmtpError({stage:'CONNECT',code:'ETIMEDOUT',deliveryUncertain:false});
  assert.equal(error.deliveryUncertain,false);
  assert.match(explainMailSmtpError(error),/порт 465/);
  assert.match(explainMailSmtpError(error),/ETIMEDOUT/);
});
test('authentication refusal is not mislabeled as an ambiguous accepted message',()=>{
  const error=new MailSmtpError({stage:'AUTH',code:'SMTP_REJECTED',smtpStatus:535,deliveryUncertain:false});
  assert.equal(error.smtpStatus,535);
  assert.match(explainMailSmtpError(error),/пароль приложения/);
  assert.doesNotMatch(explainMailSmtpError(error),/@example|password=|Authorization/);
});
test('loss of connection after DATA can still be an ambiguous delivery',()=>{
  const error=new MailSmtpError({stage:'DATA_ACK',code:'ECONNRESET',deliveryUncertain:true});
  assert.equal(error.deliveryUncertain,true);
  assert.match(explainMailSmtpError(error),/не подтвердил приём/);
});
test('API and card preserve diagnostic and only offer retry on definite failure',()=>{
  const service=readFileSync(new URL('../src/services/ai-mail-tools.service.ts',import.meta.url),'utf8');
  const router=readFileSync(new URL('../src/routes/api.ts',import.meta.url),'utf8');
  const card=readFileSync(new URL('../../client/src/components/MailInlineSendCard.tsx',import.meta.url),'utf8');
  assert.match(service,/smtpError\.deliveryUncertain/);
  assert.match(service,/status:\{in:\['PENDING','FAILED'\]\}/);
  assert.match(service,/console\.warn\('\[MailSend\] failed'/);
  assert.match(router,/res\.status\(result\.status==='NOT_FOUND' \? 404 : 200\)\.json\(result\)/);
  assert.match(card,/status!=='PENDING'&&status!=='FAILED'/);
  assert.match(card,/Повторить отправку/);
});
