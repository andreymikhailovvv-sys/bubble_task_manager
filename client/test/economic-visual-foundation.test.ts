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

test('module switcher has independent persistent edge icons and hover-only labels in both themes', () => {
  assert.doesNotMatch(rail, /module-rail-handle|module-rail-panel/);
  assert.match(rail, /<nav className="module-rail"/);
  assert.match(rail, /module-rail-link module-rail-planner/);
  assert.match(rail, /module-rail-link module-rail-economic/);
  assert.match(rail, /module-rail-label/);
  assert.match(railCss, /position: fixed;/);
  assert.match(railCss, /top: clamp\(105px, 17vh, 182px\)/);
  assert.match(railCss, /\.module-rail-link:hover \.module-rail-label/);
  assert.match(railCss, /\.module-rail-link:focus-visible \.module-rail-label/);
  assert.match(railCss, /\.app-shell\[data-theme="light"\] \.module-rail/);
  assert.match(railCss, /\.econ-light \.module-rail/);
  assert.match(railCss, /\.module-rail-link\.module-rail-economic\.is-active/);
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
  // Explicit props take priority over the managed mascot identity; only
  // an unconfigured mascot falls back to the planner palette.
  assert.match(mascot, /variant: variantOverride/);
  assert.match(mascot, /const identity = useMascotIdentity\(\)/);
  assert.match(mascot, /const variant = variantOverride \?\? identity\?\.variant \?\? 'planner'/);
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
