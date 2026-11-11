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
  assert.match(toolBegin, /processingToolRef\.current = true;[\s\S]*?setCollapsed\(true\);/);
  assert.match(toolBegin, /onLiveToolResultRef\.current\?\.\(/);
  assert.doesNotMatch(toolBegin, /stopResourcesRef\.current\(\)/);
  assert.match(voice, /const finish = \(\) => \{/);
  assert.match(voice, /stopResourcesRef\.current\(\);\s*onClose\(\)/);
});

test('Planik keeps existing billing, VAD, and realtime model while adopting an optional friendly delivery', async () => {
  const server = await read('../src/services/ai-live-voice.service.ts');
  assert.match(server, /model: 'gpt-realtime-2\.1-mini'/);
  assert.match(server, /voice: 'marin'/);
  assert.match(server, /Ты Планик, небольшой дружелюбный робот-помощник/);
  assert.match(server, /Не имитируй голос настоящего ребёнка/);
});
