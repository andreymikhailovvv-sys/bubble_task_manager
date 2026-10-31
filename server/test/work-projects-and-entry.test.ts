import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=(path:string)=>readFile(new URL(path,import.meta.url),'utf8');

test('work homepage is served from a separate HTML entry and personal routes still use index.html',async()=>{
  const [server,vite,entry,html]=await Promise.all([
    read('../src/index.ts'),
    read('../../client/vite.config.ts'),
    read('../../client/src/work-entry.tsx'),
    read('../../client/work.html')
  ]);
  assert.match(server,/req\.hostname\.toLowerCase\(\) === 'work\.planirovych\.ru' \? 'work\.html' : 'index\.html'/);
  assert.match(vite,/work: fileURLToPath\(new URL\('\.\/work\.html'/);
  assert.match(html,/src\/work-entry\.tsx/);
  assert.match(html,/Планировыч\.Work/);
  assert.match(html,/Твоя компания под контролем/);
  assert.doesNotMatch(html,/src\/main\.tsx/);
  assert.doesNotMatch(entry,/from '\.\/App'/);
  assert.doesNotMatch(entry,/from '\.\/MiniApp'/);
  assert.match(entry,/React\.lazy\(\(\)=>import\('\.\/BusinessApp'\)\)/);
  assert.match(entry,/if\(user\)return/);
  assert.match(entry,/setUser\(response\.user\)/);
  assert.match(entry,/classList\.add\('work-workspace-preload'\)/);
  assert.match(entry,/classList\.remove\('work-workspace-preload'\)/);
});

test('Work projects and tasks are tenant-owned, separate from personal task tables',async()=>{
  const [schema,sql,api,client]=await Promise.all([
    read('../prisma/schema.prisma'),
    read('../prisma/migrations/20261031190000_work_projects_tasks/migration.sql'),
    read('../src/routes/business-projects.ts'),
    read('../../client/src/WorkProjectsView.tsx')
  ]);
  assert.match(schema,/model OrganizationProject \{/);
  assert.match(schema,/model OrganizationWorkTask \{/);
  assert.match(schema,/assignedMemberId\s+String\?/);
  assert.match(schema,/assignee\s+OrganizationMember\?/);
  assert.doesNotMatch(sql,/ALTER TABLE "Task"/);
  assert.doesNotMatch(sql,/ALTER TABLE "Sphere"/);
  assert.match(sql,/CREATE TABLE "OrganizationProject"/);
  assert.match(sql,/CREATE TABLE "OrganizationWorkTask"/);
  assert.match(api,/organizationId_userId: \{ organizationId, userId: req\.user!\.id \}/);
  assert.match(api,/project:\{organizationId:req\.params\.organizationId\}/);
  assert.match(api,/where:\{id:value,organizationId:req\.params\.organizationId\}/);
  assert.match(api,/assignedMemberId!==member\.id/);
  assert.match(api,/role!=='MEMBER'/);
  assert.match(api,/project\.isArchived/);
  assert.doesNotMatch(api,/prisma\.task\./);
  assert.match(client,/Проекты компании/);
  assert.match(client,/Новое поручение/);
  assert.match(client,/Исполнитель/);
  assert.match(client,/Срок/);
});

test('only Work controls show company projects and Work overlay has a dismissal',async()=>{
  const [company,business,personal,html]=await Promise.all([
    read('../../client/src/WorkCompanyView.tsx'),
    read('../../client/src/BusinessApp.tsx'),
    read('../../client/index.html'),
    read('../../client/work.html')
  ]);
  assert.match(company,/WorkProjectsView/);
  assert.match(company,/section === 'projects'/);
  assert.match(business,/initialUser/);
  assert.match(business,/classList\.remove\('work-workspace-preload'\)/);
  assert.match(personal,/Твой день под контролем/);
  assert.doesNotMatch(html,/Твой день под контролем/);
  assert.doesNotMatch(html,/Планировыч\.Бизнес/);
});
