import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync(new URL('../economic.html', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../src/economic-main.tsx', import.meta.url), 'utf8');

test('Economic uses isolated HTML and does not load planner entry or Telegram SDK', () => {
  assert.match(entry, /src="\/src\/economic-main.tsx"/);
  assert.doesNotMatch(entry, /src="\/src\/main.tsx"|telegram-web-app.js|workspace-boot-splash/);
  assert.match(entry, /Экономыч AI/);
});
test('independent bootstrap does not import planner API or global application styles', () => {
  assert.doesNotMatch(bootstrap, /'\.\/App'|'\.\/MiniApp'|'\.\/lib\/api'|'\.\/styles.css'/);
  assert.match(bootstrap, /import\('\.\/EconomicApp'\)/);
});
