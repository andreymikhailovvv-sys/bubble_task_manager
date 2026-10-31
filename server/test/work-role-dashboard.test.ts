import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('overview selects first organization and keeps navigation scoped across work sections',async()=>{
  const app=await read('../../client/src/BusinessApp.tsx');
  assert.match(app,/list\[0\]\?\.id\|\|null/);
  assert.match(app,/work-active-org/);
  assert.match(app,/setActiveOrganizationId\(id\)/);
  assert.match(app,/onOpenCompanyCard=\{\(\)=>setCompanyCardOpen\(true\)\}/);
  assert.match(app,/key=\{activeOrganizationId\}/);
  assert.doesNotMatch(app,/Бизнес-процессы/);
  assert.doesNotMatch(app,/НАПРАВЛЕНИЯ РАЗРАБОТКИ/);
});

test('company overview uses role-scoped dashboard, live task data and shared focus',async()=>{
  const [router,overview,focus,company]=await Promise.all([
    read('../src/routes/business-projects.ts'),
    read('../../client/src/WorkOverviewDashboard.tsx'),
    read('../../client/src/WorkTaskFocusDialog.tsx'),
    read('../../client/src/WorkCompanyView.tsx')
  ]);
  assert.match(router,/get\('\/:organizationId\/dashboard'/);
  assert.match(router,/assignedMemberId:member\.id/);
  assert.match(router,/createdByMemberId:member\.id/);
  assert.match(router,/organizationId,isArchived:false/);
  assert.match(overview,/dashboard\.stats\.overdue/);
  assert.match(overview,/WorkTaskFocusDialog/);
  assert.match(overview,/WorkQuickAi/);
  assert.match(overview,/Мои активные задачи/);
  assert.match(overview,/Контроль работы компании/);
  assert.match(focus,/WorkAiPanel/);
  assert.match(focus,/createdByMemberId/);
  assert.match(focus,/assignedMemberId/);
  assert.match(company,/WorkOverviewDashboard/);
  assert.match(company,/showCompanyCard/);
});
test('corporate tasks have one row with creator and assignee, not personal Task proxies',async()=>{
  const [schema,migration,router]=await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261101010000_work_dashboard_collaboration/migration.sql'),
    read('../src/routes/business-projects.ts')
  ]);
  assert.match(schema,/createdByMemberId\s+String\?/);
  assert.match(schema,/@relation\("WorkTaskCreator"/);
  assert.match(schema,/@relation\("WorkTaskAssignee"/);
  assert.match(migration,/ALTER TABLE "OrganizationWorkTask" ADD COLUMN "createdByMemberId"/);
  assert.doesNotMatch(migration,/ALTER TABLE "Task"/);
  assert.doesNotMatch(migration,/ALTER TABLE "User"/);
  assert.match(router,/createdByMemberId:actor\.id/);
  assert.match(router,/OR:\[\{assignedMemberId:actor\.id\},\{createdByMemberId:actor\.id\}\]/);
  assert.doesNotMatch(router,/prisma\.task\./);
});

test('employee quick chat segregates messages and AI context by membership and task',async()=>{
  const [ai,route,quick,workProject]=await Promise.all([
    read('../src/services/work-ai-assistant.service.ts'),
    read('../src/routes/business-ai.ts'),
    read('../../client/src/WorkQuickAi.tsx'),
    read('../../client/src/WorkProjectsView.tsx')
  ]);
  assert.match(ai,/quickMemberId/);
  assert.match(ai,/memberId:quickMemberId/);
  assert.match(ai,/personalScope/);
  assert.match(ai,/tasks:\{where:ownTasksWhere/);
  assert.match(route,/role==='VIEWER'/);
  assert.match(route,/\/ai\/quick\/chat/);
  assert.match(route,/workAiHistory\(req\.params\.organizationId,null,member\.id\)/);
  assert.match(quick,/workQuickAiAsk/);
  assert.match(quick,/dashboard\.projects\.map/);
  assert.match(quick,/taskId=\{activeTask\}/);
  assert.match(workProject,/WorkTaskFocusDialog/);
});
