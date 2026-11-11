import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('miniapp exposes a separate realtime action without replacing dictation', async () => {
  const [composer, input] = await Promise.all([
    read('../../client/src/components/MiniAiChatComposer.tsx'),
    read('../../client/src/components/VoiceInputButton.tsx')
  ]);
  assert.match(composer, /activationMode="transcription"/);
  assert.match(input, /activationMode === 'transcription' && liveContext/);
  assert.match(input, /aria-label="Начать живое общение с Плаником"/);
  assert.match(input, /onClick=\{startLive\}/);
  assert.match(input, /onLiveSessionChangeRef\.current\?\.\(active, activeLiveContextRef\.current\)/);
});

test('realtime presentation persists a single live session through collapse', async () => {
  const [voice, styles] = await Promise.all([
    read('../../client/src/components/LiveVoiceDialog.tsx'),
    read('../../client/src/components/PlanikLiveVoice.css')
  ]);
  assert.match(voice, /const \[collapsed, setCollapsed\] = useState\(false\)/);
  assert.match(voice, /return createPortal\(collapsed \? \(/);
  assert.match(voice, /<PlanikMascot size="sidekick"/);
  assert.match(voice, /className="planik-live-fullscreen"/);
  assert.match(voice, /className="planik-live-compact"/);
  assert.match(voice, /onClick=\{\(\) => setCollapsed\(false\)\}/);
  assert.match(styles, /\.planik-live-fullscreen\s*\{\s*position: fixed/);
  assert.match(styles, /\.planik-live-compact\s*\{\s*position: fixed/);
});

test('delegated cards collapse the presentation without ending the microphone or WebSocket', async () => {
  const voice = await read('../../client/src/components/LiveVoiceDialog.tsx');
  const toolBegin = voice.slice(voice.indexOf('const handleToolRequest'), voice.indexOf('useEffect(() => {', voice.indexOf('const handleToolRequest')));
  assert.match(toolBegin, /processingToolRef\.current = true;/);
  assert.doesNotMatch(toolBegin.split("const result = scope.type")[0], /setCollapsed\(true\)/);
  assert.match(toolBegin, /const actionVisibleInChat = hasPlanikActionSurface\(result\)/);
  assert.match(toolBegin, /if \(actionVisibleInChat\) \{/);
  assert.match(toolBegin, /onLiveActionRevealRef\.current\?\.\(\)/);
  assert.match(toolBegin, /onLiveToolResultRef\.current\?\.\(/);
  assert.doesNotMatch(toolBegin, /stopResourcesRef\.current\(\)/);
  assert.match(voice, /const finish = \(\) => \{/);
  assert.match(voice, /stopResourcesRef\.current\(\);\s*onClose\(\)/);
});

test('Planik keeps existing billing, VAD, and realtime model while adopting an optional friendly delivery', async () => {
  const server = await read('../src/services/ai-live-voice.service.ts');
  assert.match(server, /model: 'gpt-realtime-2\.1-mini'/);
  assert.match(server, /const DEFAULT_PLANIK_VOICE: PlanikRealtimeVoice = 'echo'/);
  assert.match(server, /voice: resolvePlanikVoice\(voice\)/);
  assert.match(server, /voice \}/);
  assert.match(server, /Ты Планик, небольшой дружелюбный робот-помощник/);
  assert.match(server, /Не имитируй голос настоящего ребёнка/);
});

test('voice stays fullscreen for informational tool results and shows cards only on actual actions', async () => {
  const { hasPlanikActionSurface } =
    await import('../../client/src/lib/planikLiveVoicePresentation.js');
  const plain = { answer: 'Завтра тепло.', taskDataChanged: false, model: 'gpt', webSearchUsed: false };
  assert.equal(hasPlanikActionSurface(plain), false);
  assert.equal(hasPlanikActionSurface({ ...plain, taskDataChanged: true }), false);
  assert.equal(hasPlanikActionSurface({ ...plain, answer: 'Откройте [[task_ref:123|Задача]]' }), true);
  assert.equal(hasPlanikActionSurface({ ...plain, telegramSendDraft: { id: 'draft' } as never }), true);
  assert.equal(hasPlanikActionSurface({ ...plain, mailSendDraft: { id: 'draft' } as never }), true);
  assert.equal(hasPlanikActionSurface({ ...plain, taskProposal: { id: 'proposal' } as never }), true);
  assert.equal(hasPlanikActionSurface({ ...plain, generatedDocument: { id: 'doc' } as never }), true);
});

test('Telegram safe area, visible live transcript, and fixed Echo voice', async () => {
  const [voice, styles, api] = await Promise.all([
    read('../../client/src/components/LiveVoiceDialog.tsx'),
    read('../../client/src/components/PlanikLiveVoice.css'),
    read('../../client/src/lib/api.ts')
  ]);
  assert.match(styles, /\.planik-live-fullscreen\[data-telegram="true"\] \.planik-live-stage/);
  assert.match(styles, /--tg-content-safe-area-inset-top/);
  assert.match(voice, /data-telegram=\{telegramChrome \? 'true' : 'false'\}/);
  assert.match(voice, /className="planik-live-transcript"/);
  assert.match(voice, /AiStreamingMessageBody content=\{message.text\}/);
  assert.match(voice, /AiStreamingMessageBody content=\{caption\}/);
  assert.match(voice, /setLiveMessages\(previous =>/);
  assert.match(voice, /'echo'/);
  assert.doesNotMatch(voice, /planik-live-voice-preference|PLANIK_VOICE_STORAGE_KEY|PLANIK_VOICE_OPTIONS/);
  assert.match(voice, /<strong>Планик<\/strong>/);
  assert.doesNotMatch(voice, /Живое общение · Realtime|ИИ думает|ИИ говорит/);
  assert.match(api, /body: JSON.stringify\(\{ context, voice \}\)/);
});

test('Planik reveals only action cards and scrolls the matching chat after rendering', async () => {
  const [voice, input, composer, expanded, mini] = await Promise.all([
    read('../../client/src/components/LiveVoiceDialog.tsx'),
    read('../../client/src/components/VoiceInputButton.tsx'),
    read('../../client/src/components/MiniAiChatComposer.tsx'),
    read('../../client/src/components/ExpandedAiChat.tsx'),
    read('../../client/src/MiniApp.tsx')
  ]);
  assert.match(voice, /onLiveActionRevealRef\.current\?\.\(\)/);
  assert.match(input, /onLiveActionReveal=\{onLiveActionReveal\}/);
  assert.match(composer, /onLiveActionReveal=\{onLiveActionReveal\}/);
  assert.match(expanded, /onLiveActionReveal=\{\(\) => \{/);
  assert.match(expanded, /nearBottomRef\.current = true/);
  assert.match(mini, /const scrollLiveActionIntoView = \(scope: 'task' \| 'chat'\)/);
  assert.match(mini, /scope === 'task' \? fullscreenAiDialogContainerRef\.current : aiChatDialogContainerRef\.current/);
  assert.match(mini, /onLiveActionReveal=\{\(\) => scrollLiveActionIntoView\('task'\)\}/);
  assert.match(mini, /onLiveActionReveal=\{\(\) => scrollLiveActionIntoView\('chat'\)\}/);
});

test('Planik name and progress status are readable without redundant AI labels', async () => {
  const [voice, css] = await Promise.all([
    read('../../client/src/components/LiveVoiceDialog.tsx'),
    read('../../client/src/components/PlanikLiveVoice.css')
  ]);
  assert.match(voice, /searching_tasks: 'Ищу задачи/);
  assert.match(voice, /thinking: 'Думаю/);
  assert.match(voice, /<strong>\{phaseLabel\}<\/strong>/);
  assert.match(css, /\.planik-live-brand strong\s*\{/);
  assert.match(css, /color:\s*#f8faff !important/);
  assert.match(css, /font-size:\s*clamp\(23px/);
  assert.doesNotMatch(css, /\.planik-live-voice-preference/);
  const server = await read('../src/services/ai-live-voice.service.ts');
  assert.match(server, /PLANIK_REALTIME_VOICES = \['echo'\]/);
});
