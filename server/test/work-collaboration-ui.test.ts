import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=(name:string)=>readFile(new URL(name,import.meta.url),'utf8');

test('personal and Work share the exact focused subtask composer',async()=>{
 const [app,work,composer]=await Promise.all([
   read('../../client/src/App.tsx'),read('../../client/src/WorkTaskFocusDialog.tsx'),
   read('../../client/src/components/FocusedSubtaskComposer.tsx')]);
 assert.match(app,/FocusedSubtaskComposer/);
 assert.match(work,/FocusedSubtaskComposer/);
 assert.match(composer,/focused-task-inline-subtask-button/);
 assert.match(composer,/Название доп задачи/);
 assert.match(work,/WorkSubtaskDetailDialog/);
 assert.match(work,/work-subtask-author/);
 assert.doesNotMatch(work,/aria-label="Закрыть фокус задачи"/);
 assert.match(work,/aria-expanded=\{showParticipants\}/);
});

test('corporate subtask comments and human recipients cannot cross task/tenant scopes',async()=>{
 const [schema,migration,projects,ai,service]=await Promise.all([
   read('../prisma/schema.prisma'),
   read('../prisma/migrations/20261031233000_work_subtask_comments_chat_recipients/migration.sql'),
   read('../src/routes/business-projects.ts'),read('../src/routes/business-ai.ts'),
   read('../src/services/work-ai-assistant.service.ts')
 ]);
 assert.match(schema,/model OrganizationWorkSubtaskComment/);
 assert.match(schema,/parentCommentId String\?/);
 assert.match(migration,/CREATE TABLE "OrganizationWorkSubtaskComment"/);
 assert.doesNotMatch(migration,/ALTER TABLE "Task"/);
 assert.match(projects,/subtaskAccess\(req,res,true\)/);
 assert.match(projects,/authorMemberId:access\.member\.id/);
 assert.match(projects,/parentCommentId:parentId/);
 assert.match(projects,/where:\{id:parentId,subtaskId:subtask\.id\}/);
 assert.match(ai,/human-messages/);
 assert.match(ai,/\[task\.assignedMemberId,task\.createdByMemberId\]\.includes\(recipientId\)/);
 assert.match(ai,/organizationId:req\.params\.organizationId/);
 assert.match(ai,/senderMemberId:member\.id,recipientMemberId:recipient\.id/);
 assert.match(service,/senderMemberId:true,recipientMemberId:true/);
});

test('Work rich chat shares personal markdown and dispatcher stays fixed height',async()=>{
 const [panel,body,quick,css,api]=await Promise.all([
   read('../../client/src/WorkAiPanel.tsx'),read('../../client/src/components/WorkAiMessageBody.tsx'),
   read('../../client/src/WorkQuickAi.tsx'),read('../../client/src/BusinessApp.css'),
   read('../../client/src/lib/api.ts')
 ]);
 assert.match(body,/renderAiContentBlocks/);
 assert.match(body,/AiInlineMarkup/);
 assert.match(body,/AiReplyMessageBody/);
 assert.match(panel,/Math\.floor\(credits\.aiCreditsMilli\/1000\)/);
 assert.match(panel,/work-ai-dispatcher-composer/);
 assert.match(panel,/work-ai-dispatcher-wallet/);
 assert.match(panel,/workSendParticipantMessage/);
 assert.match(panel,/recipientControl/);
 assert.match(quick,/WorkAiMessageBody/);
 assert.match(css,/work-ai-dispatcher\{/);
 assert.match(css,/overflow-y:auto;overscroll-behavior:contain/);
 assert.match(api,/workPostSubtaskComment/);
 assert.match(api,/workSendParticipantMessage/);
});
