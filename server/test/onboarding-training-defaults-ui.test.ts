import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('new-account sectors use supported palette colors and icon keys', async () => {
  const [onboarding, editor, icons] = await Promise.all([
    read('../src/services/onboarding.service.ts'),
    read('../../client/src/components/SectorEditor.tsx'),
    read('../../client/src/lib/sphereIcons.ts')
  ]);
  const expected = [
    { key: 'personal', name: 'Личное', color: '#22c55e', icon: 'home' },
    { key: 'work', name: 'Работа', color: '#ec4899', icon: 'briefcase' },
    { key: 'projects', name: 'Проекты', color: '#f97316', icon: 'laptop' }
  ];
  for (const sector of expected) {
    assert.ok(onboarding.includes(`key: '${sector.key}', name: '${sector.name}', color: '${sector.color}', icon: '${sector.icon}'`));
    assert.ok(editor.includes(sector.color), `${sector.name} color must exist in the sector editor palette`);
    assert.ok(icons.includes(`key: '${sector.icon}'`), `${sector.name} icon must be rendered by the sector icon resolver`);
  }
  assert.match(onboarding, /if \(existingTasksCount > 0\) return;/);
});

test('new-account starter tasks include requested importance, sectors and capitalization', async () => {
  const source = await read('../src/services/onboarding.service.ts');
  const block = (title: string) => {
    const start = source.indexOf(`title: '${title}'`);
    assert.ok(start > -1, `missing task: ${title}`);
    const end = source.indexOf('    });', start);
    assert.ok(end > start);
    return source.slice(start, end);
  };
  assert.match(block('Добавить первую задачу'), /importance: 4/);
  assert.match(block('Расписать свои проекты'), /importance: 5/);
  assert.match(block('Добавь системный промпт к сектору «Работа»'), /sphereKey: 'work',[\s\S]*?importance: 2/);
  assert.match(block('Создать заметку'), /sphereKey: 'personal',[\s\S]*?importance: 3/);
  assert.match(block('Добавь системный промпт к сектору «Работа»'), /Нажмите на сектор «работа» и укажите общий промпт в поле снизу/);
  assert.match(block('Создать заметку'), /Нажмите в правом меню кнопку добавления заметки/);

  const descriptions = [...source.matchAll(/description:\s*'([^'\n]+)'/g)].map(match => match[1]);
  assert.ok(descriptions.length >= 7);
  for (const description of descriptions) {
    assert.match(description, /^[А-ЯЁ]/, `starter description should start with a capital letter: ${description}`);
  }
});

test('first-visit training invitation is persistent, anchored above the oval and dismissible only with X', async () => {
  const [desktop, bubble, menu] = await Promise.all([
    read('../../client/src/App.tsx'),
    read('../../client/src/components/BubbleField.tsx'),
    read('../../client/src/components/UpdatesMenu.tsx')
  ]);
  assert.match(desktop, /showTrainingInvitation=\{isOnboardingOfferOpen\}/);
  assert.match(desktop, /onOpenTraining=\{\(\) => \{/);
  assert.match(desktop, /setTrainingOpenSignal\(signal => signal \+ 1\)/);
  assert.match(desktop, /onDismissTraining=\{\(\) => \{/);
  assert.match(desktop, /localStorage\.setItem\(getOnboardingOfferStorageKey\(currentUser\.id\), '1'\)/);
  assert.doesNotMatch(desktop, /onboarding-offer-title|Нет, спасибо/);
  assert.match(bubble, /x=\{BUBBLE_FIELD_CENTER_X - 335\}/);
  assert.match(bubble, /y=\{VIEWBOX_TOP \+ 8\}/);
  assert.match(bubble, /showTrainingInvitation && \(/);
  assert.match(bubble, /Пройти обучение/);
  assert.match(bubble, /aria-label="Закрыть приглашение пройти обучение"/);
  assert.match(bubble, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onOpenTraining\?\.\(\); \}\}/);
  assert.match(bubble, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onDismissTraining\?\.\(\); \}\}/);
  assert.match(bubble, /y=\{VIEWBOX_TOP \+ \(showTrainingInvitation \? 82 : 8\)\}/);
  assert.match(menu, /if \(trainingOpenSignal > 0\) setTab\('training'\)/);
});
