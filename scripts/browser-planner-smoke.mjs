#!/usr/bin/env node
/**
 * Real Chromium smoke test of the production desktop App, with mock API
 * responses isolated to this browser. No user or server data is touched.
 * Requires an existing client build, playwright and Chromium.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMapConsumer } from 'source-map-js';
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
const unhandledGetPaths=new Set();
function describeBrowserStack(stack) {
  const originalLines=String(stack ?? '').split('\n');
  const mapped=[];
  const expression=/\/assets\/([^/:?#]+\.js):(\d+):(\d+)/;
  for(const item of originalLines){
    const match=item.match(expression);
    if(!match)continue;
    const mapPath=join(process.cwd(),'client','dist','assets',match[1]+'.map');
    if(!existsSync(mapPath))continue;
    try{
      const sourceMap=JSON.parse(readFileSync(mapPath,'utf8'));
      const consumer=new SourceMapConsumer(sourceMap);
      const original=consumer.originalPositionFor({line:Number(match[2]),column:Number(match[3])-1});
      if(!original.source)continue;
      const originalCode=consumer.sourceContentFor(original.source,true);
      const sourceLine=originalCode?.split('\n')[original.line-1]?.trim() ?? '';
      mapped.push(original.source+':'+original.line+':'+original.column+' '+sourceLine.slice(0,180));
    }catch(error){mapped.push('Failed to map '+mapPath+': '+String(error));}
    if(mapped.length>=12)break;
  }
  return mapped.join('\n');
}
let previewOutput='';
// Spawn Vite directly, not through npm -> shell -> vite. Killing npm may
// orphan Vite with inherited stdio pipes and keep Node/CI alive indefinitely.
const preview=spawn(join(process.cwd(),'node_modules','.bin','vite'),[
  'preview','--host','127.0.0.1','--port',String(port),'--strictPort'
],{cwd:join(process.cwd(),'client'),stdio:['ignore','pipe','pipe']});
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
  page.on('pageerror',error=>{
    const stack=error.stack??error.message;
    failures.push(stack+'\n[Mapped source]\n'+describeBrowserStack(stack));
  });
  page.on('console',message=>{
    if(message.type()==='error'&&/react|render|hook|TypeError|Ошибка рендера/i.test(message.text()))
      failures.push(message.text().slice(0,600));
  });
  let writes=0;
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const method=request.method();
    let payload={};
    if(path==='/api/auth/me')payload={user};
    else if(path==='/api/tasks')payload=tasks;
    else if(path==='/api/spheres')payload=spheres;
    else if(path==='/api/habits'||path==='/api/notes'||path==='/api/note-groups')payload=[];
    else if(path==='/api/ai-chat/projects')payload={projects:[]};
    else if(path==='/api/ai-general-chat')payload={messages:[]};
    // All authenticated chat feeds start empty, but the real API still returns
    // fully shaped envelopes. Returning {} crashed mergeTelegramAiInbox during
    // React rendering before the task UI could even mount.
    else if(path==='/api/telegram-user-client/assistant/inbox')
      payload={projectId:'telegram-ai-assistant-project',projectTitle:'Телеграм ассистент',
        projectIcon:'telegram',chats:[],messages:[]};
    else if(path==='/api/mail-assistant/inbox')
      payload={projectId:'mail-ai-assistant-project',projectTitle:'Почта',
        projectIcon:'@',chats:[],messages:[]};
    else if(path==='/api/subscription-links')
      payload={links:{start:'',pro:'',max:''}};
    else if(path==='/api/credit-packs')
      payload={packs:[],paymentProvider:null,purchaseAvailable:false};
    else if(path==='/api/system-notifications')
      payload={notifications:[],unreadCount:0};
    // The focus editor immediately loads the selected task's attachments.
    // This endpoint returns a bare array, never an object wrapper.
    else if(method==='GET' && /^\/api\/tasks\/[^/]+\/attachments$/.test(path))
      payload=[];
    else if(/\/api\/tasks\/[^/]+\/ai-chat$/.test(path))payload={messages:[]};
    // These are THREE separate API contracts, not one envelope.
    // Triggers and statuses return bare arrays; unread returns an object.
    else if(method==='GET' && /^\/api\/tasks\/[^/]+\/monitoring\/triggers$/.test(path))
      payload=[];
    else if(method==='GET' && /^\/api\/tasks\/[^/]+\/monitoring\/statuses$/.test(path))
      payload=[];
    else if(method==='GET' && /^\/api\/tasks\/[^/]+\/monitoring\/statuses\/unread$/.test(path))
      payload={unreadCount:0};
    else if(path==='/api/client-performance'||path==='/api/client-error')payload={ok:true};
    else if(method!=='GET'){
      writes++;
      payload={task:tasks[0],success:true,notifications:[],user};
    }else if(path.includes('/inbox'))payload={messages:[],items:[],events:[]};
    else unhandledGetPaths.add(path);
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'cache-control':'no-store'},body:JSON.stringify(payload)});
  });

  const metrics={taskCount:tasks.length,browser:'headless Chromium'};
  await page.goto(baseUrl+'/?enter=1',{waitUntil:'domcontentloaded'});
  const primary=page.locator('[data-bubble-task-id="smoke-primary-task"]').first();
  await primary.waitFor({state:'visible',timeout:30000});
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

  // The bubble/list views intentionally exclude EVENT/REMINDER tasks, so
  // an event bubble cannot exist. Test the classic TaskEditor through the
  // actual "New task -> New event" menu that users use.
  // Reload to close Focus and verify the edited session can boot again.
  await page.reload({waitUntil:'domcontentloaded'});
  // This user experience starts in fullscreen by default, with the classic
  // "New task" toolbar deliberately hidden. Exit fullscreen using the actual
  // UI before accessing the event creation menu.
  await page.locator('[data-tour="bubbles-fullscreen-exit"]').waitFor({state:'visible',timeout:12000});
  await page.locator('[data-tour="bubbles-fullscreen-exit"]').click();
  await page.locator('[data-tour="create-task"]').waitFor({state:'visible',timeout:12000});
  await page.locator('[data-tour="create-task"]').click();
  await page.locator('[data-tour="create-event"]').click();
  const eventTitle=page.locator('textarea.task-edit-title-input').first();
  await eventTitle.waitFor({state:'visible',timeout:12000});
  await eventTitle.fill('Проверка события без ошибок рендера');
  assert.equal(await eventTitle.inputValue(),'Проверка события без ошибок рендера');
  metrics.classicEditorOpened=true;

  assert.equal(await page.getByText('Не удалось отрисовать интерфейс').count(),0,
    'React error boundary must never replace the workspace');
  assert.deepEqual(failures,[],'Browser runtime errors: '+failures.join('\n'));
  assert.deepEqual([...unhandledGetPaths],[],
    'Missing API fixture(s): '+[...unhandledGetPaths].join(', '));
  console.log('[Browser smoke] PASS '+JSON.stringify({...metrics,mockedApiWrites:writes}));
}catch(error){
  console.error('[Browser smoke] FAIL '+(error.stack??error));
  if(failures.length)console.error('[Browser smoke] runtime errors:\n'+failures.slice(0,8).join('\n'));
  console.error('[Browser smoke] unmapped GET paths: '+JSON.stringify([...unhandledGetPaths].slice(0,80)));
  console.error('[Browser smoke] preview log:\n'+previewOutput.slice(-1500));
  process.exitCode=1;
}finally{
  await browser?.close();
  preview.kill('SIGTERM');
}
