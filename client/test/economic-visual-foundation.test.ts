import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const economic = read('../src/EconomicApp.tsx');
const economicCss = read('../src/EconomicApp.css');
const rail = read('../src/components/ModuleRail.tsx');
const railCss = read('../src/components/ModuleRail.css');
const mascot = read('../src/components/PlanikMascot.tsx');
const mascotCss = read('../src/components/PlanikMascot.css');

test('module switcher is one connected picker and centers the arrow in both themes', () => {
  assert.match(rail, /className="module-rail-handle"/);
  assert.match(railCss, /\.module-rail-handle\s*\{[\s\S]*?align-items:center;justify-content:center/);
  assert.match(railCss, /\.module-rail:hover \.module-rail-handle,[\s\S]*?border-right:0;border-radius:0/);
  assert.match(railCss, /\.module-rail-panel\s*\{[\s\S]*?border-radius:0 16px 16px 0/);
  assert.match(railCss, /\.app-shell\[data-theme="light"\] \.module-rail/);
  assert.match(railCss, /\.econ-light \.module-rail/);
  assert.match(railCss, /\.module-rail-economic\{color:#ffd18b/);
  assert.match(railCss, /\.module-rail-economic\.is-active/);
});

test('operations section only has the shared New Operation button', () => {
  assert.match(economic, /className="econ-add-global"[\s\S]*?Добавить/);
  assert.match(economic, /Добавить операцию/);
  assert.match(economic, /Добавить счёт/);
  assert.match(economic, /Добавить кредит/);
  assert.match(economic, /Добавить долг/);
  assert.match(economic, /section !== 'operations' && actions\[section\]/);
  assert.doesNotMatch(economic, /section === 'operations' \? 'Операция'/);
});

test('Economic mascot reuses the real Planik SVG and animations with its own palette', () => {
  assert.match(economic, /<PlanikMascot variant="economic" size="launcher" busy=\{busy\} progress=\{progress\}/);
  assert.doesNotMatch(economic, /econ-robot-metal/);
  assert.match(mascot, /variant\?: 'planner' \| 'economic'/);
  assert.match(mascot, /variant = 'planner'/);
  assert.match(mascotCss, /\.planik-mascot--economic \.planik-body-stop-start/);
  assert.match(mascotCss, /\.planik-eye \{/);
  assert.match(mascotCss, /animation: planik-blink/);
  assert.match(economic, /aria-expanded=\{active\}/);
  assert.match(economicCss, /\.econ-mascot \.planik-body-surface\{pointer-events:visiblePainted\}/);
});

test('visible Economic statuses reflect real async request stages and animate', () => {
  assert.match(economic, /setAssistantStage\(files\.length \? 'reading_files' : 'reading_finances'\)/);
  assert.match(economic, /await askEconomicStream\(question, files, stage => setAssistantStage\(stage\)\)/);
  assert.match(economic, /setAssistantStage\('refreshing_finances'\)/);
  assert.match(economic, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(economicCss, /@keyframes econ-status-beat/);
  assert.match(economicCss, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(economic, /Брюс Хуй/);
});
