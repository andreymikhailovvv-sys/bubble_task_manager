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
  const wardrobe={userId:user.id,rank:2,expiresAt:'2099-01-01T00:00:00.000Z',selected:{planner:'classic',economic:'classic'},catalog:[{id:'classic',variant:'planner',name:'Классический',description:'Базовый',rank:0},{id:'aviator',variant:'planner',name:'Авиатор',description:'Шлем и очки',rank:2},{id:'wizard',variant:'planner',name:'Астролог',description:'Шляпа',rank:3}]};
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const method=request.method();
    let payload={};
    if(path==='/api/auth/me')payload={user};
    else if(path==='/api/mascot-wardrobe'){
      if(method==='PUT'){const body=request.postDataJSON();assert.equal(body.variant,'planner');assert.equal(body.skinId,'aviator');wardrobe.selected.planner=body.skinId;wardrobeWrites++;}
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
  await wardrobeDialog.getByRole('button',{name:/Астролог/}).click();
  await wardrobeDialog.locator('[data-skin="wizard"]').waitFor({state:'visible'});
  assert.equal(await wardrobeDialog.getByRole('button',{name:/Тариф «Максимум»/}).isDisabled(),true);
  assert.equal(wardrobeWrites,0);
  await wardrobeDialog.getByRole('button',{name:/Авиатор/}).click();
  await wardrobeDialog.locator('[data-skin="aviator"][data-mode="showcase"]').waitFor({state:'visible'});
  await wardrobeDialog.getByRole('button',{name:'Применить образ'}).click();
  await wardrobeDialog.getByRole('button',{name:'Уже выбран'}).waitFor({state:'visible'});
  assert.equal(wardrobeWrites,1);
  await page.keyboard.press('Escape');
  await wardrobeDialog.waitFor({state:'hidden'});
  await launcher.locator('[data-skin="aviator"]').waitFor({state:'visible'});
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
