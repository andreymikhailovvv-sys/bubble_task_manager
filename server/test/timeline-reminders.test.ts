import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLANNER_OPERATIONS, validatePlannerActionResolution } from '../src/services/planner-tools.service.js';
import { AI_CHAT_OPENAI_TOOLS } from '../src/services/ai-chat-tools.service.js';

const src=(path: string)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('reminders are a separate scheduled enum with database migration',()=>{
  assert.match(src('../prisma/schema.prisma'),/enum TaskType\s*\{\s*TASK\s*EVENT\s*REMINDER\s*\}/);
  assert.match(src('../prisma/migrations/20261016230000_reminder_task_type/migration.sql'),/ADD VALUE IF NOT EXISTS 'REMINDER'/);
  const task=src('../src/services/task.service.ts');
  assert.match(task,/taskType: isReminder \? 'REMINDER'/);
  assert.match(task,/Для напоминания нужны дата и время/);
});
test('AI exposes a dedicated create_reminder with non-null time',()=>{
  assert.ok(PLANNER_OPERATIONS.includes('create_reminder'));
  const operation=AI_CHAT_OPENAI_TOOLS.find((x)=>x.name==='task_action');
  assert.ok(operation);
  const enumValues=(operation.parameters.properties.operation as {enum:string[]}).enum;
  assert.ok(enumValues.includes('create_reminder'));
  const action={operation:'create_reminder' as const,itemId:null,parentTaskId:null,title:'Позвонить',description:null,dueDate:null,importance:null,urgency:null,notifyBeforeMinutes:0,sphereId:null,location:null};
  const failure=validatePlannerActionResolution(action,new Set(),new Set());
  assert.equal(failure?.code,'DUE_DATE_REQUIRED');
  assert.equal(validatePlannerActionResolution({...action,dueDate:'2026-10-19T12:30:00Z'},new Set(),new Set()),null);
  const assistant=src('../src/services/ai-assistant.service.ts');
  assert.match(assistant,/Если пользователь просит «напомни»/);
  assert.match(assistant,/operation=create_reminder/);
  assert.match(assistant,/action\.type=create_reminder/);
  assert.match(assistant,/taskType: 'REMINDER'/);
});
test('reminders only appear in timeline with distinct light/dark styles and inert clicks',()=>{
  const web=src('../../client/src/App.tsx');
  const mini=src('../../client/src/MiniApp.tsx');
  const css=src('../../client/src/styles.css');
  assert.match(web,/timeline-reminder-chip/);
  assert.match(web,/if \(options\?\.disableOpenOnClick \|\| isReminderChip\) return/);
  assert.match(web,/draggable=\{canDragTask\}/);
  assert.match(web,/task\.taskType !== 'EVENT' && task\.taskType !== 'REMINDER'/);
  assert.match(mini,/miniapp-timeline-reminder-card/);
  assert.match(mini,/miniapp-calendar-reminder-entry/);
  assert.match(mini,/if \(isReminder\) return/);
  assert.match(mini,/task\.taskType !== 'EVENT' && task\.taskType !== 'REMINDER'/);
  assert.match(css,/\.timeline-reminder-chip/);
  assert.match(css,/\.miniapp-timeline-reminder-card/);
  assert.match(css,/body\[data-theme='light'\] .*miniapp-timeline-reminder-card/);
});
test('Telegram and in-app reminder notifications dedupe by reminder ID and scheduled instant',()=>{
  const telegram=src('../src/services/telegram.service.ts');
  assert.match(telegram,/taskType: 'REMINDER', status: \{ not: 'DONE' \}/);
  assert.match(telegram,/const content = `Напоминание: \$\{reminder\.title\}`/);
  assert.match(telegram,/eventKey = `reminder:\$\{reminder\.id\}:\$\{reminder\.dueDate\.toISOString\(\)\}`/);
  assert.match(telegram,/systemNotification\.create/);
  assert.match(telegram,/telegramNotifiedAt: null/);
  assert.match(telegram,/escapeHtml\(content\)/);
  assert.match(telegram,/taskType: \{ not: 'REMINDER' \}/);
  assert.match(telegram,/↩️ Отменить/);
  assert.match(telegram,/📱 Открыть в приложении/);
});
