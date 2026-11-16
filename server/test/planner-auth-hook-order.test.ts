import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../client/src/App.tsx', import.meta.url), 'utf8');

test('all top-level Planner hooks run before the authLoading / logged-out early returns', () => {
  const component = source.indexOf('export default function App()');
  const guard = source.indexOf('  if (authLoading) {', component);
  const noUser = source.indexOf('  if (!currentUser) return null;', guard);
  assert.ok(component >= 0 && guard > component && noUser > guard);
  // A conditional return before a hook violates the React hook order invariant
  // and causes "Rendered more hooks than during the previous render" on login.
  const afterGuard = source.slice(guard);
  assert.doesNotMatch(afterGuard,
    /^  (?:useEffect|useLayoutEffect|useRef|useState|useMemo|useCallback|useReducer|useId|useTransition|useDeferredValue)\s*\(/m);
});

test('Economic Telegram integration hook is above the auth guards', () => {
  const callback = source.indexOf('  const openTelegramLinkModal = async () => {');
  const effect = source.indexOf('  // Direct link from Экономыч AI');
  const guard = source.indexOf('  if (authLoading) {', source.indexOf('export default function App()'));
  assert.ok(callback >= 0 && effect > callback && effect < guard,
    'The integration effect must run on every render, including the first auth-loading render');
  assert.match(source.slice(effect, guard), /useEffect\(\(\) => \{/);
  assert.match(source.slice(effect, guard), /connectTelegram/);
});
