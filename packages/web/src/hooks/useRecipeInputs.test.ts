import { expect, test } from 'vitest';
import { makeInputIds, shouldCommitDraft } from './useRecipeInputs';

test('input id helpers are stable and namespaced', () => {
  const ids = makeInputIds();
  expect(ids.weightInputId('abc')).toBe('weight-abc');
  expect(ids.percentInputId('abc')).toBe('percent-abc');
  expect(ids.batchInputId).toBe('batch-total');
});

test('shouldCommitDraft is false when the field was never drafted', () => {
  expect(shouldCommitDraft({ 'weight-abc': '10' }, 'weight-abc')).toBe(true);
  expect(shouldCommitDraft({}, 'weight-abc')).toBe(false);
});
