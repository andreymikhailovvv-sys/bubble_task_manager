#!/usr/bin/env node
/**
 * Real Chromium smoke test of the production desktop App, with mock API
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
  browserNotificationsEnabled:false,completedLessonIds:[]
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
  page.on('pageerror',error=>failures.push(error.stack??error.message));
  page.on('console',message=>{
    if(message.type()==='error'&&/react|render|hook|TypeError|Ошибка рендера/i.test(message.text()))
      failures.push(message.text().slice(0,600));
  });
  let writes=0;
  let wardrobeWrites=0;
  const wardrobe={userId:user.id,rank:2,expiresAt:'2099-01-01T00:00:00.000Z',selected:{planner:'classic',economic:'classic'},catalog:[{id:'classic',variant:'planner',name:'Верный помощник',description:'Базовый',rank:0},{id:'northern',variant:'planner',name:'Полярник фокуса',description:'Шарф и варежки',rank:2},{id:'maestro',variant:'planner',name:'Маэстро привычек',description:'Берет',rank:0},{id:'zoomer',variant:'planner',name:'Зумер рабочего потока',description:'Телефон',rank:2},{id:'pirate',variant:'planner',name:'Расхититель задач',description:'Карта сокровищ',rank:2},{id:'wizard',variant:'planner',name:'Астролог приоритетов',description:'Шляпа',rank:3},{id:'ninja',variant:'planner',name:'Ниндзя дедлайнов',description:'Дым',rank:3},{id:'space',variant:'planner',name:'Космонавт продуктивности',description:'Спутник',rank:3},{id:'classic',variant:'economic',name:'Верный казначей',description:'Базовый',rank:0},{id:'banker',variant:'economic',name:'Хранитель бюджета',description:'Портфель',rank:2}]};
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const method=request.method();
    let payload={};
    if(path==='/api/auth/me'||path==='/api/economic/session')payload={user};
    else if(path==='/api/economic/snapshot')payload={accounts:[],recent:[],debts:[],loans:[],categories:[],assistantMessages:[],totals:{balanceMinor:'0',monthIncomeMinor:'0',monthExpenseMinor:'0',operationCount:0,topExpenseCategory:null,topExpenseCategoryMinor:'0'}};
    else if(path==='/api/mascot-wardrobe'){
      if(method==='PUT'){const body=request.postDataJSON();assert.equal(body.variant,'planner');assert.equal(body.skinId,'northern');wardrobe.selected.planner=body.skinId;wardrobeWrites++;}
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
  const launcher=page.locator('.planik-launcher-button').first();
  await launcher.locator('.planik-body-surface').hover({timeout:12000});
  const trigger=page.locator('.mascot-wardrobe-anchor').filter({has:launcher}).getByRole('button',{name:'Аксессуары и скины'});
  await trigger.click({timeout:12000});
  const wardrobeDialog=page.getByRole('dialog',{name:'Аксессуары и скины'});
  const skinList=wardrobeDialog.getByRole('navigation',{name:'Скины'});
  const listWrap=wardrobeDialog.locator('.mascot-wardrobe-list-wrap');
  await skinList.getByRole('button',{name:/Маэстро/}).waitFor({state:'visible'});
  assert.equal(await skinList.getByRole('button').count(),8);
  const classicBody=await wardrobeDialog.locator('.planik-body-surface').boundingBox();
  assert.ok(classicBody);
  assert.equal(await skinList.evaluate(el=>getComputedStyle(el).scrollbarWidth),'none');
  await skinList.evaluate(el=>{el.style.height='110px';});
  await wardrobeDialog.locator('.mascot-wardrobe-list-wrap[data-more-below="true"]').waitFor({state:'visible'});
  await skinList.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await wardrobeDialog.locator('.mascot-wardrobe-list-wrap[data-more-below="false"]').waitFor({state:'visible'});
  await skinList.evaluate(el=>{el.style.height='';el.scrollTop=0;});
  assert.equal(await listWrap.count(),1);
  await wardrobeDialog.getByRole('button',{name:/Астролог/}).click();
  await wardrobeDialog.locator('[data-skin="wizard"]').waitFor({state:'visible'});
  assert.equal(await wardrobeDialog.getByRole('button',{name:/Тариф «Максимум»/}).isDisabled(),true);
  await wardrobeDialog.getByRole('button',{name:'Думает',exact:true}).click();
  await wardrobeDialog.locator('[data-skin="wizard"][data-mode="thinking"] .wizard-deck').waitFor({state:'visible'});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.mascot-wardrobe-dialog .wizard-deck [data-part^="face"]')).length===4&&Array.from(document.querySelectorAll('.mascot-wardrobe-dialog .wizard-deck [data-part^="face"]')).every(el=>el.getAttribute('opacity')==='1'),{},{timeout:12000});
  await wardrobeDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await wardrobeDialog.locator('[data-skin="wizard"][data-mode="hover"] .wizard-orb').waitFor({state:'visible'});
  assert.equal(wardrobeWrites,0);
  await wardrobeDialog.getByRole('button',{name:/Зумер/}).click();
  await wardrobeDialog.locator('[data-skin="zoomer"][data-mode="idle"] .zoomer-phone-back').waitFor({state:'visible'});
  await wardrobeDialog.locator('.mascot-wardrobe-character.phase-idle').waitFor({state:'visible'});
  const zoomerBody=await wardrobeDialog.locator('.planik-body-surface').boundingBox();
  assert.ok(zoomerBody&&Math.abs(zoomerBody.width-classicBody.width)<2&&Math.abs(zoomerBody.height-classicBody.height)<2);
  await wardrobeDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await wardrobeDialog.locator('[data-skin="zoomer"] .zoomer-phone-hide').waitFor({state:'hidden'});
  await wardrobeDialog.locator('[data-skin="zoomer"][data-mode="hover"] .planik-hover').waitFor({state:'visible'});
  assert.equal(wardrobeWrites,0);
  await wardrobeDialog.getByRole('button',{name:/Расхититель задач/}).click();
  await wardrobeDialog.locator('[data-skin="pirate"]').waitFor({state:'visible'});
  await wardrobeDialog.getByRole('button',{name:'Думает',exact:true}).click();
  await wardrobeDialog.locator('[data-skin="pirate"] .pirate-treasure-map').waitFor({state:'visible'});
  assert.equal(await wardrobeDialog.locator('[data-skin="pirate"] .planik-eye-right').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.equal(await wardrobeDialog.locator('[data-skin="pirate"] .pirate-eye-patch').evaluate(el=>getComputedStyle(el).transform),'none');
  await wardrobeDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await wardrobeDialog.locator('[data-skin="pirate"] .planik-eye-right').waitFor({state:'visible'});
  await wardrobeDialog.getByRole('button',{name:'Думает',exact:true}).click();
  assert.equal(await wardrobeDialog.locator('[data-skin="pirate"] .planik-eye-right').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await wardrobeDialog.getByRole('button',{name:/Ниндзя дедлайнов/}).click();
  await wardrobeDialog.locator('[data-skin="ninja"] .ninja-ready').waitFor({state:'visible'});
  assert.equal(await wardrobeDialog.getByRole('button',{name:/Тариф «Максимум»/}).isDisabled(),true);
  await wardrobeDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.mascot-wardrobe-dialog [data-skin="ninja"] .planik-character-rig')).opacity)<.05);
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.mascot-wardrobe-dialog [data-skin="ninja"] .planik-character-rig')).opacity)>.95);
  await wardrobeDialog.getByRole('button',{name:/Космонавт продуктивности/}).click();
  await wardrobeDialog.locator('[data-skin="space"] .space-helmet').waitFor({state:'visible'});
  await wardrobeDialog.getByRole('button',{name:'Думает',exact:true}).click();
  await wardrobeDialog.locator('[data-skin="space"] .space-satellite').waitFor({state:'visible'});
  await wardrobeDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await wardrobeDialog.locator('[data-skin="space"] .space-drift-arms').waitFor({state:'visible'});
  assert.equal(await wardrobeDialog.locator('[data-skin="space"] .planik-character-rig').evaluate(el=>getComputedStyle(el).animationName),'space-weightless');
  assert.equal(wardrobeWrites,0);
  await wardrobeDialog.getByRole('button',{name:/Полярник фокуса/}).click();
  await wardrobeDialog.locator('[data-skin="northern"][data-mode="idle"]').waitFor({state:'visible'});
  await wardrobeDialog.locator('.mascot-wardrobe-character.phase-idle').waitFor({state:'visible'});
  const northBody=await wardrobeDialog.locator('.planik-body-surface').boundingBox();
  assert.ok(northBody&&Math.abs(northBody.width-classicBody.width)<2&&Math.abs(northBody.height-classicBody.height)<2);
  await wardrobeDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await wardrobeDialog.locator('[data-skin="northern"][data-mode="hover"] .north-warm').waitFor({state:'visible'});
  await wardrobeDialog.getByRole('button',{name:'Применить образ'}).click();
  await wardrobeDialog.getByRole('button',{name:'Уже выбран'}).waitFor({state:'visible'});
  assert.equal(wardrobeWrites,1);
  await page.keyboard.press('Escape');
  await wardrobeDialog.waitFor({state:'hidden'});
  await page.mouse.move(35,35);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.mascot-wardrobe-trigger')).every(el=>Number(getComputedStyle(el).opacity)===0));
  await launcher.locator('[data-skin="northern"]').waitFor({state:'visible'});
  metrics.wardrobe='locked preview, animated outfit, save and Escape PASS';
  const openStart=Date.now();
  await primary.click();
  const focusedTitle=page.locator('textarea[title="Редактировать название"]').first();
  await focusedTitle.waitFor({state:'visible',timeout:12000});
  metrics.openTaskMs=Date.now()-openStart;
  await focusedTitle.fill('Проверка ввода нового названия');
  await focusedTitle.press('Tab');
  assert.equal(await focusedTitle.inputValue(),'Проверка ввода нового названия');

  const richInput=page.locator('.focused-task-description-input[contenteditable="true"]').first();
  await richInput.waitFor({state:'visible',timeout:12000});
  const typingStart=Date.now();
  await richInput.fill('Новый текст описания без задержек');
  await richInput.press('Tab');
  metrics.editDescriptionMs=Date.now()-typingStart;
  assert.match(await richInput.innerText(),/Новый текст описания/);
  await page.waitForTimeout(350);
  assert.ok(await page.locator('textarea[title="Редактировать название"]').count()>0,
    'Focus editor remains mounted after editing description');

  // This smoke covers opening and typing in the focused TASK editor.
  // EVENT cards are not available in the bubbles-only workspace. Their
  // editor is covered by the dedicated classic/timeline UI tests.

  assert.equal(await page.getByText('Не удалось отрисовать интерфейс').count(),0,
    'React error boundary must never replace the workspace');
  await page.goto(baseUrl+'/economic',{waitUntil:'domcontentloaded'});
  const economicMascot=page.locator('.econ-mascot .planik-mascot');
  await economicMascot.locator('.planik-body-surface').hover({timeout:12000});
  await page.locator('.econ-mascot-dressing').getByRole('button',{name:'Аксессуары и скины'}).click();
  const economicDialog=page.getByRole('dialog',{name:'Аксессуары и скины'});
  await economicDialog.getByRole('button',{name:/Хранитель бюджета/}).click();
  await economicDialog.locator('[data-skin="banker"][data-mode="idle"] .banker-counting').waitFor({state:'visible'});
  await economicDialog.getByRole('button',{name:'Формирует ответ'}).click();
  await economicDialog.locator('[data-skin="banker"][data-mode="typing"] .banker-briefcase').waitFor({state:'visible'});
  await economicDialog.getByRole('button',{name:'Наведение курсора'}).click();
  await economicDialog.locator('[data-skin="banker"][data-mode="hover"] .planik-hover').waitFor({state:'visible'});
  assert.equal(wardrobeWrites,1);
  metrics.economicWardrobe='counting, packing and standard hover PASS';
  assert.deepEqual(failures,[],'Browser runtime errors: '+failures.join('\n'));
  console.log('[Browser smoke] PASS '+JSON.stringify({...metrics,mockedApiWrites:writes}));
}catch(error){
  console.error('[Browser smoke] FAIL '+(error.stack??error));
  if(failures.length)console.error('[Browser smoke] runtime errors:\n'+failures.slice(0,8).join('\n'));
  // Report a bounded snippet of the failing production bundle so that a
  // minified stack can be located without uploading artifacts or private data.
  try {
    const first=failures.find(f=>/\/assets\/[^\s:)]+\.js:[0-9]+:[0-9]+/.test(f));
    const match=first?.match(/(http:\/\/127\.0\.0\.1:[0-9]+\/assets\/[^\s:)]+\.js):([0-9]+):([0-9]+)/);
    if(match){
      const bundled=await (await fetch(match[1])).text();
      const line=bundled.split('\n')[Number(match[2])-1]??'';
      const at=Number(match[3])-1;
      console.error('[Browser smoke] failing bundle context: '+line.slice(Math.max(0,at-360),at+210));
    }
  }catch{}

  console.error('[Browser smoke] preview log:\n'+previewOutput.slice(-1500));
  process.exitCode=1;
}finally{
  await browser?.close();
  preview.kill('SIGTERM');
  // npm run preview creates a child Vite process. A failed smoke must exit
  // promptly rather than hold GitHub Actions until the 15-minute job timeout.
  // The browser has already closed above and the test result is final.
  process.exit(process.exitCode ?? 0);
}
