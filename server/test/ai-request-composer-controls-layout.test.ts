import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

test('Mini App and mobile website show attachment, input, dictation, live, send in this order', async () => {
  const [mini, composer, voice, main] = await Promise.all([
    read('../../client/src/MiniApp.tsx'),
    read('../../client/src/components/MiniAiChatComposer.tsx'),
    read('../../client/src/components/VoiceInputButton.tsx'),
    read('../../client/src/main.tsx')
  ]);
  assert.match(main, /<MiniApp runtime="telegram"/);
  assert.match(main, /<MiniApp runtime="web"/);
  assert.match(mini, /<MiniAiChatComposer/);
  const sequence = ['aria-label="Прикрепить файл"', '<AutoGrowingTextarea', 'activationMode="transcription"', 'activationMode="live"', 'aria-label="Отправить сообщение"'];
  const positions = sequence.map(item => composer.indexOf(item));
  assert.ok(positions.every(item => item >= 0), 'all five composer parts must be present');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'the DOM/tab order must match visual order');
  assert.match(voice, /activationMode\?: 'menu' \| 'transcription' \| 'live'/);
  assert.match(voice, /if \(activationMode === 'transcription'\) void start\(\); else if \(activationMode === 'live'\) startLive\(\)/);
  assert.match(voice, /activationMode === 'live' \? <Radio/);
});

test('website task chats and expanded chat keep independent direct dictation and live actions', async () => {
  const [app, expanded, css] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/components/ExpandedAiChat.tsx'),
    read('../../client/src/styles.css')
  ]);
  assert.equal((app.match(/<VoiceInputButton activationMode="transcription"/g) ?? []).length, 5);
  assert.equal((app.match(/<VoiceInputButton activationMode="live"/g) ?? []).length, 5);
  assert.equal((expanded.match(/<VoiceInputButton activationMode="transcription"/g) ?? []).length, 1);
  assert.equal((expanded.match(/<VoiceInputButton activationMode="live"/g) ?? []).length, 1);
  assert.match(app, /ref=\{quickAiFileInputRef\}/);
  assert.match(app, /ai-request-composer-quick/);
  assert.match(css, /\.miniapp-shell \.miniapp-ai-chat-composer-card > \.miniapp-ai-chat-input/);
  assert.match(css, /@media \(max-width: 380px\)/);
  for (const source of [app, expanded]) {
    const sections = source.split('className="ai-request-composer ai-chat-composer ').slice(1);
    assert.ok(sections.length > 0);
    for (const section of sections) {
      const attachment = section.indexOf('<Paperclip');
      const input = section.indexOf('<AutoGrowingTextarea');
      const transcription = section.indexOf('<VoiceInputButton activationMode="transcription"');
      const live = section.indexOf('<VoiceInputButton activationMode="live"');
      assert.ok(attachment >= 0 && attachment < input && input < transcription && transcription < live,
        'attachment must be before the field, both voice actions after the field');
    }
  }
});
