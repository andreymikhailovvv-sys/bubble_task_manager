import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('one five-minute Realtime duration applies to web, Mini App and Android', async () => {
  const service = await read('../src/services/ai-live-voice.service.ts');
  assert.match(service, /const MAX_SECONDS = 5 \* 60/);
  assert.match(service, /maxSeconds: MAX_SECONDS/);
  assert.match(service, /Лимит голосового диалога: 5 минут/);
  assert.match(service, /48_000 \* \(MAX_SECONDS \+ 2\)/);
  assert.match(service, /audio_end_ms: Math\.min\(MAX_SECONDS \* 1000/);
  assert.doesNotMatch(service, /Лимит голосового диалога: 2 минуты/);
});

test('reserved and provisional credits never reach the visible live meter', async () => {
  const [service, client] = await Promise.all([
    read('../src/services/ai-live-voice.service.ts'),
    read('../../client/src/components/LiveVoiceDialog.tsx')
  ]);
  assert.doesNotMatch(service, /send\(\{ type: 'usage'/);
  assert.match(service, /const result = await settleAiCreditReservation\(reservation, spent\)/);
  assert.match(service, /spent = result\.chargedMilli/);
  assert.match(service, /peer\.send\(\{ type: 'finished', creditsSpentMilli: spent/);
  assert.match(client, /const \[creditsSpentMilli, setCreditsSpentMilli\] = useState<number \| null>\(null\)/);
  assert.doesNotMatch(client, /if \(payload\.type === 'usage'/);
  assert.match(client, /if \(payload\.type === 'finished'\)/);
  assert.match(client, /'Списание после завершения'/);
});

test('Android restores sector selection, explains empty filters and reconciles after Planik', async () => {
  const [workspace, vm, general, task] = await Promise.all([
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/ModernWorkspace.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/HomeViewModel.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeGeneralAiChat.kt'),
    read('../../android-app/app/src/main/java/ru/planirovych/app/feature/home/NativeTaskAiChat.kt')
  ]);
  assert.match(workspace, /var selectedSectors by rememberSaveable/);
  assert.match(workspace, /var sectorFilterEnabled by rememberSaveable/);
  assert.match(workspace, /selectedSectors\.isEmpty\(\) \|\|/);
  assert.match(workspace, /По текущим фильтрам задачи не найдены/);
  assert.match(workspace, /Показать все задачи/);
  assert.match(vm, /fun reconcileAfterPlanik\(\)/);
  assert.match(vm, /Suspicious empty task response after Realtime; retrying/);
  assert.match(vm, /Two empty responses; retaining last known tasks/);
  assert.match(general, /ActivityResultContracts\.StartActivityForResult\(\)/);
  assert.match(task, /ActivityResultContracts\.StartActivityForResult\(\)/);
  assert.match(general, /planikLauncher\.launch\(PlanikLiveActivity\.intent/);
  assert.match(task, /planikLauncher\.launch\(PlanikLiveActivity\.intent/);
});

test('task search provides a broader and explicitly bounded ranked view', async () => {
  const [planner, schema] = await Promise.all([
    read('../src/services/planner-tools.service.ts'),
    read('../src/services/ai-chat-tools.service.ts')
  ]);
  assert.match(planner, /Math\.min\(25, Math\.round\(input\.limit \|\| 12\)\)/);
  assert.match(planner, /truncated: ranked\.length > limit/);
  assert.match(schema, /name: 'search_tasks'[\s\S]*?maximum: 25/);
});
