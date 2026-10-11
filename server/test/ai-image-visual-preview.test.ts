import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const get = (name: string) => readFile(new URL(name, import.meta.url), 'utf8');

test('AI chat streams expose the image generation status and clear it afterwards', async () => {
  const [general, task, generalStatus, taskStatus, clientStatus, progress] = await Promise.all([
    get('../src/services/ai-chat-tools.service.ts'),
    get('../src/services/ai-assistant.service.ts'),
    get('../src/services/ai-chat-progress.ts'),
    get('../src/services/task-ai-progress.ts'),
    get('../../client/src/lib/api.ts'),
    get('../../client/src/components/AiProgress.tsx')
  ]);
  assert.match(general, /generate_image: 'generating_image'/);
  assert.match(general, /finally \{\s*emitProgress\('forming_answer'\)/);
  assert.match(task, /input\.onProgress\?\.\('generating_image'\)/);
  assert.match(task, /finally \{\s*input\.onProgress\?\.\('forming_answer'\)/);
  for (const source of [generalStatus, taskStatus, clientStatus]) assert.match(source, /generating_image/);
  assert.match(progress, /Создаю изображение/);
  assert.match(progress, /ai-image-generating-card/);
  assert.match(progress, /status === 'generating_image'/);
});

test('image previews use short-lived signed links while downloads retain existing behavior', async () => {
  const [controller, card, button, styles, wordTests, web, mini] = await Promise.all([
    get('../src/controllers/ai-generated-document.controller.ts'),
    get('../../client/src/components/AiGeneratedImageCard.tsx'),
    get('../../client/src/components/AiGeneratedDocumentButton.tsx'),
    get('../../client/src/styles.css'),
    get('./ai-word-documents.test.ts'),
    get('../../client/src/App.tsx'),
    get('../../client/src/MiniApp.tsx')
  ]);
  assert.match(controller, /req\.query\.preview === '1' && document\.mimeType\.startsWith\('image\/'\)/);
  assert.match(controller, /inlineImage && document\.mimeType\.startsWith\('image\/'\)/);
  assert.match(controller, /'attachment'/);
  assert.match(card, /createAiGeneratedDocumentDownloadLink\(document\.id\)/);
  assert.match(card, /searchParams\.set\('preview', '1'\)/);
  assert.match(card, /referrerPolicy="no-referrer"/);
  assert.match(card, /IntersectionObserver/);
  assert.match(card, /onDownload\(document\)/);
  assert.match(card, /Скачать/);
  assert.match(button, /document\.mimeType\.startsWith\('image\/'\)/);
  assert.match(button, /AiGeneratedImageCard/);
  assert.match(button, /download=\{document\.fileName\}/);
  assert.match(styles, /ai-generated-image-card/);
  assert.match(styles, /ai-image-generation-sweep/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(wordTests, /download=/);
  assert.match(web, /imageGenerating=\{aiChatLoading && aiChatProgress === 'generating_image'\}/);
  assert.match(mini, /aiChatLoading, aiChatProgress, isAiChatOpen/);
  for (const source of [web, mini]) {
    assert.match(source, /AiGeneratedDocumentButton/);
    assert.match(source, /TaskAiProgress/);
    assert.match(source, /AiProgress/);
  }
});
