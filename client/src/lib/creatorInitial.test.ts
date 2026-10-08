import assert from 'node:assert/strict';
import test from 'node:test';
import { getCreatorInitial } from './creatorInitial';

test('collaborative subtask author badge uses a single initial', () => {
  assert.equal(getCreatorInitial('Брюс'), 'Б');
  assert.equal(getCreatorInitial(' мария '), 'М');
  assert.equal(getCreatorInitial('alice'), 'A');
  assert.equal(getCreatorInitial(''), '');
  assert.equal(getCreatorInitial('  '), '');
});
