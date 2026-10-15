import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/components/TelegramIntegrationsMenu.css', import.meta.url), 'utf8');

test('integrations popup is portaled to document.body instead of being clipped by header stacking context', () => {
  assert.match(component, /import \{ createPortal \} from 'react-dom'/);
  assert.match(component, /\{open && placement && createPortal\(/);
  assert.match(component, /integration-menu__popup fixed z-\[900\]/);
  assert.match(component, /<\/div>, document\.body\s*\)\}/);
  assert.doesNotMatch(component, /integration-menu__popup absolute/);
});

test('integration setup dialog also escapes header stacking and remains above the menu', () => {
  assert.match(component, /\{dialogOpen && createPortal\(/);
  assert.match(component, /telegram-integrations-modal fixed inset-0 z-\[1000\]/);
  assert.match(component, /<\/div>, document\.body\s*\)\}/);
});

test('floating popup uses viewport placement, repositioning and seamless hover corridor', () => {
  assert.match(component, /getBoundingClientRect\(\)/);
  assert.match(component, /window\.addEventListener\('scroll', reposition, true\)/);
  assert.match(component, /window\.addEventListener\('resize', reposition\)/);
  assert.match(component, /onMouseEnter=\{cancelClose\} onMouseLeave=\{scheduleClose\}/);
  assert.match(component, /floatingRef\.current\?\.contains\(target\)/);
  assert.match(component, /onFocus=\{openMenu\}/);
});

test('portal retains independent light and dark theme tokens, no mobile position override', () => {
  assert.match(css, /\.integration-menu,\s*\.integration-menu__popup,\s*\.telegram-integrations-modal/);
  assert.match(css, /body\[data-theme='light'\] \.integration-menu__popup/);
  assert.doesNotMatch(css, /\.integration-menu__popup \{ position: fixed; left: 12px;/);
});
