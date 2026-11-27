#!/usr/bin/env node
/**
 * Real Chromium regression test of guided training, with mock API
 * responses isolated to this browser. No user or server data is touched.
 * Requires an existing client build, playwright and Chromium.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port = Number(process.env.PLANNER_BROWSER_SMOKE_PORT ?? '4188');
const baseUrl = 'http://127.0.0.1:' + port;
const startedAt = '2026-11-19T08:00:00.000Z';
const user = {
  id:'browser-smoke-user',email:'smoke@example.invalid',name:'Проверка интерфейса',
  username:'smoke',emailVerified:true,isGuest:false,aiCredits:1000,
  aiCreditsMilli:1000000,timeZone:'Europe/Moscow',
  browserNotificationsEnabled:false,completedLessonIds:['basic-onboarding-v1-seen']
};
const spheres = [{id:'browser-smoke-sphere',name:'Тестовые задачи',color:'#8b5cf6',icon:'briefcase'}];
const tasks = Array.from({length:Number(process.env.PLANNER_BROWSER_SMOKE_TASKS ?? 35)}, (_, index) => ({
  id:index===0?'smoke-primary-task':index===1?'smoke-event-task':'smoke-task-'+index,
  title:index===0?'Проверка открытия задачи':index===1?'Проверка открытия события':'Проверка нагрузки '+index,
  description:index===0?'Описание исходной задачи':'Простое тестовое описание',
  status:'TODO',taskType:index===1?'EVENT':'TASK',
  importance:3,urgency:3,priorityScore:9+index,parentTaskId:null,
  sphereId:spheres[0].id,dueDate:null,createdAt:startedAt,updatedAt:startedAt,
  isRecurring:false,aiNotificationsEnabled:false,aiMonitoringEnabled:false,
  notifyBeforeMinutes:0,linkedTaskIds:[]
}));

const failures=[];
let previewOutput='';
const preview=spawn('npm',[
  'run','preview','--workspace','client','--',
  '--host','127.0.0.1','--port',String(port),'--strictPort'
],{stdio:['ignore','pipe','pipe']});
preview.stdout.on('data',chunk=>{previewOutput+=chunk.toString().slice(-2000);});
preview.stderr.on('data',chunk=>{previewOutput+=chunk.toString().slice(-2000);});

let browser;
try {
  let ready=false;
  for(let attempt=0;attempt<75;attempt++){
    if(preview.exitCode!==null) throw new Error('Vite preview exited: '+previewOutput);
    try{
      const response=await fetch(baseUrl+'/?enter=1');
      if(response.ok){ready=true;break;}
    }catch{ /* Not ready yet */ }
    await delay(400);
  }
  if(!ready)throw new Error('Vite preview not ready: '+previewOutput);

  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:'ru-RU'});
  const page=await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(20000);
  page.on('pageerror',error=>failures.push(error.stack??error.message));
  page.on('console',message=>{
    if(message.type()==='error'&&/react|render|hook|TypeError|Ошибка рендера/i.test(message.text()))
      failures.push(message.text().slice(0,600));
  });
  let writes=0;
  let wardrobeWrites=0;
  const wardrobe={userId:user.id,rank:2,expiresAt:'2099-01-01T00:00:00.000Z',selected:{planner:'classic',economic:'classic'},catalog:[{id:'classic',variant:'planner',name:'Верный помощник',description:'Базовый',rank:0},{id:'cat',variant:'planner',name:'Котик концентрации',description:'Ушки',rank:0},{id:'northern',variant:'planner',name:'Полярник фокуса',description:'Шарф и варежки',rank:2},{id:'maestro',variant:'planner',name:'Маэстро привычек',description:'Берет',rank:0},{id:'zoomer',variant:'planner',name:'Зумер рабочего потока',description:'Телефон',rank:2},{id:'pirate',variant:'planner',name:'Расхититель задач',description:'Карта сокровищ',rank:2},{id:'wizard',variant:'planner',name:'Астролог приоритетов',description:'Шляпа',rank:3},{id:'ninja',variant:'planner',name:'Ниндзя дедлайнов',description:'Дым',rank:3},{id:'space',variant:'planner',name:'Космонавт продуктивности',description:'Спутник',rank:3},{id:'classic',variant:'economic',name:'Верный казначей',description:'Базовый',rank:0},{id:'cat',variant:'economic',name:'Котик накоплений',description:'Ушки',rank:0},{id:'banker',variant:'economic',name:'Хранитель бюджета',description:'Портфель',rank:2},{id:'king',variant:'economic',name:'Король',description:'Корона',rank:3}]};
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const method=request.method();
    let payload={};
    if(path==='/api/auth/me'||path==='/api/economic/session')payload={user};
    else if(path==='/api/economic/snapshot')payload={accounts:[],recent:[],debts:[],loans:[],categories:[],assistantMessages:[],totals:{balanceMinor:'0',monthIncomeMinor:'0',monthExpenseMinor:'0',operationCount:0,topExpenseCategory:null,topExpenseCategoryMinor:'0'}};
    else if(path==='/api/mail-assistant/accounts')payload={available:true,accounts:[]};
    else if(path==='/api/mascot-wardrobe'){
      if(method==='PUT'){
        const body=request.postDataJSON();
        if(wardrobeWrites===0)assert.deepEqual(body,{variant:'planner',skinId:'northern'});
        else if(wardrobeWrites===1)assert.deepEqual(body,{variant:'economic',skinId:'cat'});
        else if(wardrobeWrites===2)assert.deepEqual(body,{variant:'planner',skinId:'cat'});
        else assert.fail('Unexpected wardrobe write');
        const outfit=wardrobe.catalog.find(s=>s.variant===body.variant&&s.id===body.skinId);
        assert.ok(outfit&&outfit.rank<=wardrobe.rank);
        wardrobe.selected[body.variant]=body.skinId;wardrobeWrites++;
      }
      payload=wardrobe;
    }
    else if(path==='/api/tasks')payload=tasks;
    else if(/^\/api\/tasks\/[^/]+\/attachments$/.test(path))payload=[];
    else if(path==='/api/spheres')payload=spheres;
    else if(path==='/api/habits'||path==='/api/notes'||path==='/api/note-groups')payload=[];
    else if(path==='/api/ai-chat/projects')payload={projects:[]};
    else if(path==='/api/ai-general-chat')payload={messages:[]};
    else if(path==='/api/system-notifications')payload={notifications:[]};
    else if(/\/api\/tasks\/[^/]+\/ai-chat$/.test(path))payload={messages:[]};
    else if(/\/api\/tasks\/[^/]+\/monitoring\/triggers$/.test(path))payload=[];
    else if(/\/api\/tasks\/[^/]+\/monitoring\/statuses\/unread$/.test(path))payload={unreadCount:0};
    else if(/\/api\/tasks\/[^/]+\/monitoring\/statuses$/.test(path))payload=[];
    else if(path==='/api/client-performance'||path==='/api/client-error')payload={ok:true};
    else if(method!=='GET'){
      writes++;
      payload={task:tasks[0],success:true,notifications:[],user};
    }else if(path.includes('/inbox'))payload={messages:[],chats:[],items:[],events:[]};
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'cache-control':'no-store'},body:JSON.stringify(payload)});
  });

  const metrics={taskCount:tasks.length,browser:'headless Chromium'};
  await page.goto(baseUrl+'/?enter=1',{waitUntil:'domcontentloaded'});
  const primary=page.locator('[data-bubble-task-id="smoke-primary-task"]').first();
  await primary.waitFor({state:'visible',timeout:30000});
  // Fresh Chromium profiles have not accepted cookies yet. Complete the
  // actual consent interaction before testing the launcher underneath it.
  const cookieNotice=page.getByRole('complementary',{name:'Уведомление об использовании cookies'});
  await cookieNotice.getByRole('button',{name:'Принять',exact:true}).click({timeout:12000});
  await cookieNotice.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('planirovych_cookie_consent')),'v1');

  const overlay = page.locator('[data-basic-training-overlay]');
  const waitStep = async id => {
    await page.locator('[data-training-step="' + id + '"]').waitFor({state:'visible'});
    // Wait for the animated card to leave the previous control.
    await delay(550);
    console.log('[Guided browser] ' + id);
  };
  const next = async id => {
    await overlay.getByRole('button',{name:'Далее',exact:true}).click();
    await waitStep(id);
  };
  const start = async title => {
    await page.getByRole('button',{name:'Открыть обновления и обучение'}).click();
    await page.locator('.updates-lesson').filter({has:page.getByRole('heading',{name:title,exact:true})}).getByRole('button',{name:'Пройти',exact:true}).click();
  };
  const assertLauncher = async () => {
    const actual = page.locator('[data-guided-launcher] .planik-mascot');
    await actual.waitFor({state:'visible'});
    const styles = await actual.evaluate(el=>({
      visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity
    }));
    assert.deepEqual(styles,{visibility:'visible',opacity:'1'});
    await page.locator('[data-guided-launcher] .planik-launcher-button').click({trial:true});
  };
  await start('Возможности ИИ');
  await waitStep('ai-intro');
  await next('ai-quick-chat');
  await next('ai-open-chat');
  await assertLauncher();
  await page.locator('[data-guided-launcher] .planik-launcher-button').click();
  await waitStep('ai-full-chat');
  await page.locator('[data-tour="ai-full-chat"]').waitFor({state:'visible'});
  await overlay.getByRole('button',{name:'Закончить обучение'}).click();
  await overlay.waitFor({state:'hidden'});

  await start('Фишки и интеграции');
  await waitStep('feature-intro');
  await next('feature-rating-open');
  await page.locator('.efficiency-icon-button:visible').first().click();
  await waitStep('feature-rating');
  await next('feature-focus-button');
  await page.locator('[data-tour="feature-focus-button"]:visible').first().click();
  await waitStep('feature-focus-setup');
  await page.locator('.focus-task-pick').nth(0).click();
  await page.locator('.focus-task-pick').nth(1).click();
  await page.locator('[data-guided-focus-start]').click();
  await waitStep('feature-focus-timer');
  await page.locator('[data-guided-focus-play]').click();
  await page.waitForFunction(()=>document.querySelector('[data-tour="feature-focus-timer"] .tabular-nums')?.textContent==='24:59');
  await next('feature-focus-task');
  await next('feature-telegram-button');
  await next('feature-telegram-qr');
  await next('feature-integration-send');
  await next('feature-open-telegram-assistant');
  const openAssistant = async (kind,id) => {
    const target=page.locator('[data-tour="integration-'+kind+'"]:visible').first();
    await target.locator(':scope > button').click();
    await target.getByRole('button',{name:'Настроить ассистента'}).click();
    await waitStep(id);
  };
  await openAssistant('assistant','feature-integration-telegram-ai');
  await page.locator('[data-guided-assistant="telegram"]').waitFor({state:'visible'});
  await next('feature-telegram-conversation');
  await next('feature-telegram-tasks');
  await page.waitForFunction(()=>{
    const section=document.querySelector('[data-guided-assistant="telegram"] .telegram-ai-settings-section--tasks');
    const scroll=section?.closest('.telegram-ai-settings-scroll');
    const spot=document.querySelector('.basic-planik-spotlight');
    if(!section?.open||!scroll||!spot)return false;
    const a=scroll.getBoundingClientRect(),b=spot.getBoundingClientRect();
    return scroll.scrollTop>0 && b.top>=a.top-2 && b.bottom<=a.bottom+2;
  });
  await next('feature-telegram-summaries');
  await next('feature-telegram-general');
  await next('feature-open-mail-assistant');
  await openAssistant('email','feature-integration-mail');
  await page.locator('[data-guided-assistant="mail"]').waitFor({state:'visible'});
  await next('feature-mail-conversation');
  await next('feature-mail-tasks');
  await next('feature-mail-summaries');
  await next('feature-mail-general');
  await next('feature-skins-intro');
  await assertLauncher();
  await next('feature-skins-preview');
  const dialog=page.locator('.mascot-wardrobe-dialog[data-guided-wardrobe]');
  await dialog.waitFor({state:'visible'});
  await next('feature-skins-space');
  await next('feature-skins-practice');
  await page.waitForFunction(()=>{
    const dialog=document.querySelector('.mascot-wardrobe-dialog[data-guided-wardrobe]');
    const spot=document.querySelector('.basic-planik-spotlight');
    if(!dialog||!spot)return false;
    const a=dialog.getBoundingClientRect(),b=spot.getBoundingClientRect();
    return b.left<=a.left+2 && b.right>=a.right-2 && b.top<=a.top+2 && b.bottom>=a.bottom-2;
  });
  await dialog.getByRole('button',{name:/Астролог/}).click();
  await dialog.locator('.mascot-wardrobe-character.phase-idle [data-skin="wizard"]').waitFor({state:'visible'});
  await dialog.getByRole('button',{name:'Наведение курсора'}).click();
  await dialog.locator('[data-skin="wizard"][data-mode="hover"]').waitFor({state:'visible'});
  await next('feature-done');
  await overlay.getByRole('button',{name:'Закончить обучение'}).click();
  await overlay.waitFor({state:'hidden'});
  // Verify the normal wardrobe, separately from the tutorial, for every
  // catalogue entry, including locked outfits and both mascots.
  const launcher = page.locator('.planik-launcher-button').first();
  await launcher.locator('.planik-body-surface').hover();
  await page.locator('.mascot-wardrobe-anchor').filter({has:launcher}).getByRole('button',{name:'Аксессуары и скины'}).click();
  const normalWardrobe = page.getByRole('dialog',{name:'Аксессуары и скины'});
  const markers = { wizard: '.wizard-deck', pirate: '.pirate-map-scene', ninja: '.ninja-notebook-scene', space: '.space-signal-scene', cat: '.cat-ear-left' };
  for (const variant of ['planner','economic']) {
    await normalWardrobe.getByRole('group',{name:'Маскот'}).getByRole('button',{name:variant==='planner'?'Планик':'Экономыч',exact:true}).click();
    for (const outfit of wardrobe.catalog.filter(item=>item.variant===variant)) {
      await normalWardrobe.getByRole('button',{name:new RegExp(outfit.name)}).click();
      const avatar=normalWardrobe.locator('[data-skin="'+outfit.id+'"]');
      await normalWardrobe.locator('.mascot-wardrobe-character.phase-idle').waitFor({state:'visible'});
      await avatar.waitFor({state:'visible'});
      await normalWardrobe.getByRole('button',{name:'Думает',exact:true}).click();
      await normalWardrobe.locator('[data-skin="'+outfit.id+'"][data-mode="thinking"]').waitFor({state:'visible'});
      if(markers[outfit.id]) await avatar.locator(markers[outfit.id]).waitFor({state:'visible'});
      if(outfit.id==='cat') assert.equal(await avatar.locator('.cat-ear-left').evaluate(el=>getComputedStyle(el).animationName),'cat-ear-left-think');
      await normalWardrobe.getByRole('button',{name:'Ожидание',exact:true}).click();
      await normalWardrobe.locator('[data-skin="'+outfit.id+'"][data-mode="idle"]').waitFor({state:'visible'});
      console.log('[Wardrobe thinking] '+variant+'/'+outfit.id+' PASS');
    }
  }
  await page.keyboard.press('Escape');
  await normalWardrobe.waitFor({state:'hidden'});
  // The modal and split chat use the same live composer anchor.
  await launcher.locator('.planik-body-surface').click();
  await page.locator('.ai-chat-expanded-backdrop:not(.ai-chat-expanded-embedded)').waitFor({state:'visible'});
  await page.waitForFunction(()=>{
    const avatar=document.querySelector('[data-managed-mascot-launcher=planner][data-mascot-chat-embedded=true]');
    const main=document.querySelector('.ai-chat-expanded-main');
    const composer=document.querySelector('.ai-chat-expanded-composer-wrap');
    if(!avatar||!main||!composer)return false;
    const a=avatar.getBoundingClientRect(),m=main.getBoundingClientRect(),c=composer.getBoundingClientRect();
    return a.right<=m.right+2 && a.right>=m.right-10 && a.bottom<=c.top+2 && a.bottom>=c.top-10;
  });
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('planirovych:confirmed-send',{detail:'telegram-send'})));
  await launcher.locator('[data-mode="telegram-send"] .planik-paper-plane').waitFor({state:'visible'});
  assert.equal(wardrobeWrites,0);
  assert.deepEqual(failures,[],'Browser runtime errors: '+failures.join('\n'));
  console.log('[Guided browser] PASS: launcher, countdown, assistant navigation, scrolling, full wardrobe');
}catch(error){
  console.error('[Guided browser] FAIL '+(error.stack??error));
  if(failures.length) console.error(failures.slice(0,8).join('\n'));
  console.error(previewOutput.slice(-1500));
  process.exitCode=1;
}finally{
  await browser?.close();
  preview.kill('SIGTERM');
  process.exit(process.exitCode ?? 0);
}
