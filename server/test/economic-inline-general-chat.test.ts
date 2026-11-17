import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('general AI returns Economic confirmation chips instead of redirecting to Overview',()=>{
  const tools=read('../src/services/ai-chat-tools.service.ts');
  const controller=read('../src/controllers/ai.controller.ts');
  assert.match(tools,/economicProposals=await Promise\.all\(saved\.map/);
  assert.match(tools,/getEconomicProposalView\(input\.userId,item\.id\)/);
  assert.match(tools,/\), economicProposals, telegramSendDraft/);
  assert.match(controller,/economicProposals: result\.economicProposals/);
  assert.doesNotMatch(tools,/Откройте вкладку «Экономыч» → «Обзор»/);
  assert.doesNotMatch(tools,/Предложение ожидает подтверждения в Экономыч → Обзор/);
});

test('quick general AI history stores finance chip IDs and rehydrates current owner-scoped status',()=>{
  const schema=read('../prisma/schema.prisma');
  const migration=read('../prisma/migrations/20261117210000_general_ai_economic_proposals/migration.sql');
  const service=read('../src/services/ai-assistant.service.ts');
  assert.match(schema,/economicProposalIds Json\?/);
  assert.match(migration,/ADD COLUMN "economicProposalIds" JSONB/);
  assert.match(service,/where: \{id:\{in:economicIds\},userId:input\.userId\}/);
  assert.match(service,/economicProposals: message\.economicProposalIds/);
  assert.match(service,/economicProposalIds: input\.economicProposals\.map\(item=>item\.id\)/);
});

test('desktop, Mini App, native Android and voice render actionable finance chips in the parent reply',()=>{
  const desktop=read('../../client/src/App.tsx');
  const mini=read('../../client/src/MiniApp.tsx');
  const wrapper=read('../../client/src/components/AiEconomicProposalCards.tsx');
  const android=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt');
  const androidUi=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicAiProposalCard.kt');
  const androidRepo=read('../../android-app/app/src/main/java/ru/planirovych/app/data/repository/WorkspaceRepository.kt');
  const voice=read('../../client/src/lib/voice-chat-messages.ts');
  assert.match(desktop,/AiEconomicProposalCards proposals=\{item\.message\.economicProposals\}/);
  assert.match(mini,/AiEconomicProposalCards proposals=\{message\.economicProposals\}/);
  assert.match(wrapper,/EconomicAiProposalCard key=\{item\.id\}/);
  assert.match(wrapper,/readJson<EconomicAiProposal>\('\/proposals\/'/);
  assert.match(android,/NativeEconomicAiProposalCard\(proposal,c,vm\)/);
  for(const action of ['approve','reject','undo']){
    assert.match(androidUi,new RegExp('action\\("'+action+'"\\)'));
    assert.match(androidRepo,new RegExp('"'+action+'"->api\\.'));
  }
  assert.match(voice,/economicProposals: 'economicProposals' in result/);
});

test('mobile finance proposal has a task-style header and a single tile with caption, summary, aligned fields',()=>{
  const web=read('../../client/src/components/EconomicAiProposalCard.tsx');
  const css=read('../../client/src/components/EconomicAiProposalCard.css');
  const native=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeEconomicAiProposalCard.kt');
  const taskNative=read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskChipFields.kt');
  const taskCss=read('../../client/src/components/AiTaskProposalCard.css');
  assert.match(web,/className="econ-finance-proposal-details econ-finance-proposal-inner"/);
  assert.match(web,/className="econ-finance-inner-label"\>\{innerLabel\}/);
  assert.match(web,/className="econ-finance-editable-fields"/);
  assert.match(css,/\.econ-finance-proposal \.econ-finance-proposal-inner\{/);
  assert.match(css,/background:#f2f4f9;border-color:#d7dce7/);
  assert.match(css,/\.econ-finance-proposal \.econ-finance-edit-row>input,[\s\S]*?height:31px/);
  assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(native,/Icons\.Default\.AssignmentTurnedIn/);
  assert.match(native,/if\(status=="APPLIED"\)Icon\(Icons\.Default\.CheckCircle/);
  assert.match(native,/Text\(innerTitle,color=muted/);
  assert.match(native,/val tile=if\(light\)Color\(0xFFF2F4F9\)/);
  assert.match(native,/Box\(Modifier\.weight\(\.62f\)\)/);
  assert.match(native,/Modifier\.fillMaxWidth\(\)\.height\(34\.dp\)/);
  assert.match(taskNative,/heightIn\(min=34\.dp\)/);
  assert.match(taskCss,/\.ai-task-proposal__field>textarea\{[\s\S]*?overflow-y:hidden;scrollbar-width:none;resize:vertical/);
});
