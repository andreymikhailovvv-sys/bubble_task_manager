import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=(p:string)=>readFile(new URL(p,import.meta.url),'utf8');

test('Work subtasks use a tenant-owned DB table and do not modify personal Task',async()=>{
 const [schema,migration,route,client]=await Promise.all([
  read('../prisma/schema.prisma'),
  read('../prisma/migrations/20261031225500_work_company_subtasks/migration.sql'),
  read('../src/routes/business-projects.ts'),
  read('../../client/src/WorkTaskFocusDialog.tsx')
 ]);
 assert.match(schema,/model OrganizationWorkSubtask \{/);
 assert.match(schema,/subtasks OrganizationWorkSubtask\[\]/);
 assert.match(migration,/CREATE TABLE "OrganizationWorkSubtask"/);
 assert.doesNotMatch(migration,/ALTER TABLE "Task"/);
 assert.doesNotMatch(migration,/ALTER TABLE "User"/);
 assert.match(route,/\/:organizationId\/projects\/:projectId\/tasks\/:taskId\/subtasks/);
 assert.match(route,/project:\{organizationId:req\.params\.organizationId\}/);
 assert.match(route,/task\.assignedMemberId===member\.id\|\|task\.createdByMemberId===member\.id/);
 assert.match(route,/current\.createdByMemberId!==access\.member\.id/);
 assert.match(route,/keys\.some\(key=>key!=='isDone'\)/);
 assert.match(route,/createdByMemberId:access\.member\.id/);
 assert.match(client,/workAddSubtask/);
 assert.match(client,/workUpdateSubtask/);
 assert.match(client,/workDeleteSubtask/);
 assert.match(client,/canCreateSubtask=mayComplete/);
 assert.match(client,/disabled=\{!manager\|\|busy\}/);
 assert.doesNotMatch(client,/Раздел пока не подключён в Work/);
});
test('Focus uses real personal-style controls with popup settings and foreground calendar',async()=>{
 const [focus,ai,date,css]=await Promise.all([
  read('../../client/src/WorkTaskFocusDialog.tsx'),
  read('../../client/src/WorkAiPanel.tsx'),
  read('../../client/src/components/DateTimePickerWithApply.tsx'),
  read('../../client/src/BusinessApp.css')
 ]);
 assert.match(focus,/<FocusedTaskWindowFrame>/);
 assert.match(focus,/work-focus-settings absolute right-5 top-16/);
 assert.match(focus,/popupZIndex=\{2600\}/);
 assert.match(focus,/Пересылка корпоративной задачи пока недоступна/);
 assert.match(focus,/onCloseFocus=\{onClose\}/);
 assert.match(ai,/work-focus-ai-toolbar/);
 assert.match(ai,/work-focus-monitor-pill/);
 assert.match(ai,/AiProgress status=\{progress\}/);
 assert.match(ai,/task-ai-fullscreen-header/);
 assert.match(date,/popupZIndex\?: number/);
 assert.match(date,/zIndex:popupZIndex/);
 assert.match(css,/work-personal-task-ai \.ai-chat-model-cap/);
 assert.match(css,/work-focus-subtasks-list/);
});
test('Quick AI owners see real company projects and Work overview avoids black personal background',async()=>{
 const [ai,quick,css]=await Promise.all([
  read('../src/services/work-ai-assistant.service.ts'),
  read('../../client/src/WorkQuickAi.tsx'),
  read('../../client/src/BusinessApp.css')
 ]);
 assert.match(ai,/const management=Boolean\(currentMember&&\['OWNER','ADMIN','MANAGER'\]/);
 assert.match(ai,/personalScope=!management\?currentMember\?\.id\?\?null:null/);
 assert.match(ai,/organizationId,isArchived:false/);
 assert.match(ai,/memberId:quickMemberId/);
 assert.match(quick,/AiProgress status=\{aiProgress\}/);
 assert.match(css,/body\[data-theme\] \.work-root main\.work-content\{background:transparent!important/);
});
