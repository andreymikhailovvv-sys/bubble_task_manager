import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const client=(file:string)=>readFile(new URL('../../client/src/'+file,import.meta.url),'utf8');
test('workspace training highlights the settings modal and splits sectors from notes into individual steps',async()=>{
 const [tour,app]=await Promise.all([client('components/TourOverlay.tsx'),client('App.tsx')]);
 assert.match(tour,/id: 'workspace-settings'.*selector: '\[data-tour="settings-panel"\]'/);
 assert.match(tour,/id: 'workspace-side-rail'.*selector: '\[data-tour="workspace-sectors"\]'/);
 assert.match(tour,/id: 'workspace-notes'.*selector: '\[data-tour="workspace-notes"\]'/);
 assert.ok(tour.indexOf("id: 'workspace-side-rail'") < tour.indexOf("id: 'workspace-notes'"));
 assert.match(app,/data-tour="workspace-sectors"/);
 assert.match(app,/data-tour="workspace-notes"/);
 assert.match(app,/isSettingsOpen \? createPortal/);
 assert.match(tour,/z-\[1200\]/);
 assert.match(tour,/cardLeft/);
});
test('AI tutorial includes real monitoring control, expanded model choice, checkup and no obsolete AI notifications step',async()=>{
 const [tour,app,status,controls]=await Promise.all([
   client('components/TourOverlay.tsx'),client('App.tsx'),
   client('components/TaskMonitoringStatuses.tsx'),client('components/TaskMonitoringControls.tsx')
 ]);
 const ai=tour.slice(tour.indexOf('export const AI_TOUR_STEPS'),tour.indexOf('export const FEATURE_TOUR_STEPS'));
 const order=['ai-quick-chat','ai-full-chat','ai-task-help','ai-monitor-button','ai-monitor-model','ai-recurrence','ai-optimize','ai-checkup'];
 const seen=[...ai.matchAll(/id: '(ai-[^']+)'/g)].map(x=>x[1]);
 assert.deepEqual(seen,order);
 assert.doesNotMatch(ai,/ai-notifications/);
 assert.match(app,/tourStage=\{activeTourStep === 'ai-monitor-model'/);
 assert.match(status,/data-tour="ai-monitor-button"/);
 assert.match(status,/data-tour="ai-monitor-window"/);
 assert.match(controls,/data-tour="ai-monitor-model"/);
 assert.match(controls,/if \(tourExpanded\) setDetailsOpen\(true\)/);
 assert.match(app,/activeTourStep === 'ai-checkup'/);
});
test('integration tutorial opens the actual dropdown and highlights one provider section at each step',async()=>{
 const [tour,app,integrations]=await Promise.all([
   client('components/TourOverlay.tsx'),client('App.tsx'),client('components/TelegramIntegrationsMenu.tsx')
 ]);
 assert.deepEqual([...tour.matchAll(/id: '(feature-integration-[^']+)'/g)].map(x=>x[1]),
   ['feature-integration-send','feature-integration-telegram-ai','feature-integration-mail']);
 for(const selector of ['integration-messages','integration-assistant','integration-email']) assert.ok(integrations.includes(selector));
 assert.match(app,/tourIntegration=\{integrationTourKind\}/);
 assert.match(integrations,/if \(tourIntegration\) return;/);
});
test('retired AI notifications do not turn off unrelated browser alerts, checkup or task monitoring',async()=>{
 const [app,mini,service,route]=await Promise.all([client('App.tsx'),client('MiniApp.tsx'),
   readFile(new URL('../src/services/task.service.ts',import.meta.url),'utf8'),
   readFile(new URL('../src/routes/api.ts',import.meta.url),'utf8')]);
 assert.doesNotMatch(app,/Уведомления от ИИ|уведомления от ИИ/);
 assert.doesNotMatch(mini,/Уведомления от ИИ|уведомления от ИИ/);
 assert.match(app,/browser-notification-settings/);
 assert.match(app,/<AiCheckupScheduleSettings/);
 assert.match(app,/TaskMonitoringStatuses/);
 assert.match(service,/aiNotificationsEnabled: false/);
 assert.match(route,/ai-overdue-nudge'.*410/);
});
