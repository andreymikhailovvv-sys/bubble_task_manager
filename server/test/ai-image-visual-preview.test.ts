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
  assert.match(web, /imageGenerating=\{aiChatLoading && \(aiChatProgress === 'generating_image' \|\| aiChatProgress === 'editing_image'\)\}/);
  assert.match(mini, /aiChatLoading, aiChatProgress, isAiChatOpen/);
  for (const source of [web, mini]) {
    assert.match(source, /AiGeneratedDocumentButton/);
    assert.match(source, /TaskAiProgress/);
    assert.match(source, /AiProgress/);
  }
});

test('generated image bubble has no footer or filename, and download is an image-corner icon', async () => {
  const [card, styles] = await Promise.all([
    get('../../client/src/components/AiGeneratedImageCard.tsx'),
    get('../../client/src/styles.css')
  ]);
  assert.doesNotMatch(card, /<figcaption/);
  assert.doesNotMatch(card, /ai-generated-image-name/);
  assert.match(card, /<Download size=\{18\} aria-hidden="true" \/>/);
  assert.match(card, /aria-label=\{\`Скачать \$\{document\.fileName\}\`\}/);
  assert.match(styles, /\.ai-generated-image-preview img \{\s*display: block;\s*width: 100%;\s*height: auto;/);
  assert.match(styles, /\.ai-generated-image-preview \.ai-generated-image-download \{\s*position: absolute;\s*bottom:/);
  assert.match(styles, /\.ai-generated-image-card \{\s*display: block;[\s\S]*?border: 0;/);
});

test('general chat file drag clears when files leave main or window, without tinting task drop frame', async () => {
  const [expanded, css] = await Promise.all([
    get('../../client/src/components/ExpandedAiChat.tsx'),
    get('../../client/src/styles.css')
  ]);
  assert.match(expanded, /onWindowDragOver/);
  assert.match(expanded, /window\.addEventListener\('drop', clearDropState, true\)/);
  assert.match(expanded, /window\.addEventListener\('dragend', clearDropState, true\)/);
  assert.match(expanded, /window\.removeEventListener\('dragleave', onWindowDragLeave, true\)/);
  assert.match(expanded, /event\.dataTransfer\.types/);
  assert.match(css, /\.ai-chat-expanded-main \.ai-chat-drop-overlay \{/);
  assert.match(css, /backdrop-filter: blur\(12px\)/);
  assert.match(css, /body\[data-theme='light'\] \.focused-task-ai-drop-overlay \{\s*color: var\(--text-primary\)/);
});

test('light-user-message attachment icons and filenames are white, miniapp expander stays transparent on touch', async () => {
  const [css, collapse] = await Promise.all([
    get('../../client/src/styles.css'),
    get('../../client/src/components/CollapsibleUserMessage.tsx')
  ]);
  const styles = css.slice(css.lastIndexOf('/* A light-theme user message has a saturated blue bubble.'));
  assert.match(styles, /\.ai-attachment-tiles-history \.ai-attachment-tile-file-icon,[\s\S]*?color: #fff !important;/);
  assert.match(styles, /\.ai-attachment-tiles-history \.ai-attachment-tile-name,[\s\S]*?color: #fff !important;/);
  assert.match(styles, /\.miniapp-ai-chat-message \.collapsible-user-message-toggle:active/);
  assert.match(styles, /-webkit-tap-highlight-color: transparent !important;/);
  assert.match(collapse, /setExpanded\(\(value\) => !value\)/);
});

test('website AI composers accept clipboard images in focus, task and expanded chat without blocking text', async () => {
  const [app, expanded, clipboard] = await Promise.all([
    get('../../client/src/App.tsx'),
    get('../../client/src/components/ExpandedAiChat.tsx'),
    get('../../client/src/lib/aiClipboard.ts')
  ]);
  assert.match(clipboard, /item\.kind !== 'file'/);
  assert.match(clipboard, /new File\(\[file\], filename/);
  assert.match(clipboard, /png\|jpeg\|webp\|gif/);
  assert.match(expanded, /onPaste=\{\(event\) => \{/);
  assert.match(expanded, /onAddFiles\(files\)/);
  assert.match(app, /addFocusedAiFiles\(files\)/);
  assert.match(app, /addFocusAiClipboardImages\(files\)/);
  assert.match(app, /quickAiPendingFiles/);
  assert.match(app, /setQuickAiPendingFiles\(\[\]\)/);
});

test('web-search citations render numbered links only in a wrapping inline row', async () => {
  const component = await get('../../client/src/components/WebCitations.tsx');
  assert.match(component, /Поиск в интернете/);
  assert.match(component, /flex flex-wrap items-center gap-x-2 gap-y-1/);
  assert.match(component, /\[\{index \+ 1\}\]/);
  assert.match(component, /href=\{source\.url\}/);
  assert.match(component, /aria-label=\{/);
  assert.doesNotMatch(component, /\{source\.title\}<\/a>/);
  assert.doesNotMatch(component, /space-y-1/);
});
