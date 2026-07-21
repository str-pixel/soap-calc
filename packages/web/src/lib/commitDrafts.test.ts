import { describe, expect, it } from 'vitest';
import { commitDrafts, previewRecipeState } from './commitDrafts';
import type { RecipeLine } from './recipe';

const lines: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
  { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
];

describe('commitDrafts', () => {
  it('applies pending weight and percent drafts together', () => {
    const result = commitDrafts(lines, '1000', { 'weight-a': '750', 'percent-b': '25' }, 'g', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '250', weightPercent: '25' });
  });

  it('ignores incomplete drafts', () => {
    const result = commitDrafts(lines, '1000', { 'weight-a': '16.' }, 'oz', true);
    expect(result.lines[0].weightGrams).toBe('600');
  });

  it('applies batch draft before line weight drafts and reports the batch user-set', () => {
    const result = commitDrafts(
      lines,
      '1000',
      { 'batch-total': '2000', 'weight-a': '1200' },
      'g',
      false,
    );
    expect(result.batchOilGrams).toBe('2000');
    // Finding 2 regression: a committed batch draft makes the result user-set, so an
    // export built from the returned SyncedRecipe carries the lock (not a stale flag).
    expect(result.batchSetByUser).toBe(true);
    expect(result.lines[0]).toMatchObject({ weightGrams: '1200', weightPercent: '60' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '800', weightPercent: '40' });
  });

  it('resyncs from weights and reports the batch derived when the batch draft is cleared', () => {
    const result = commitDrafts(lines, '1000', { 'batch-total': '' }, 'g', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.batchSetByUser).toBe(false);
    expect(result.lines).toEqual(lines);
  });

  it('a weight/percent commit leaves the batch anchor (and its provenance) untouched', () => {
    const result = commitDrafts(lines, '1000', { 'weight-a': '750' }, 'g', true);
    expect(result.batchSetByUser).toBe(true);
    expect(result.batchOilGrams).toBe('1000');
    // Independent entry: the anchor no longer follows the weights, so a single-line weight
    // edit past the total just reads as >100 % (warned), it does not grow the batch.
    const derived = commitDrafts(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' }],
      '300',
      { 'weight-a': '400' },
      'g',
      false,
    );
    expect(derived.batchSetByUser).toBe(false);
    expect(derived.batchOilGrams).toBe('300');
    expect(derived.lines[0]).toMatchObject({ weightGrams: '400', weightPercent: '133.3' });
  });

  it('committing a weight on a new line sets only that line; the others stay put', () => {
    const sequential: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '300', weightPercent: '100' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '', weightPercent: '' },
    ];
    const result = commitDrafts(sequential, '1000', { 'weight-b': '200' }, 'g', true);
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toBe(sequential[0]); // untouched
    expect(result.lines[1]).toMatchObject({ weightGrams: '200', weightPercent: '20' });
  });

  it('a batch draft resizes weights from percents, then a later weight draft is independent', () => {
    const sequential: RecipeLine[] = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
    ];
    const result = commitDrafts(
      sequential,
      '1000',
      { 'batch-total': '2000', 'weight-b': '500' },
      'g',
      false,
    );
    expect(result.batchOilGrams).toBe('2000');
    expect(result.batchSetByUser).toBe(true);
    // batch → a rescales to 60 % of 2000 = 1200; then weight-b sets b to 500 (25 %) alone.
    expect(result.lines[0]).toMatchObject({ weightGrams: '1200', weightPercent: '60' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '500', weightPercent: '25' });
  });
});

describe('previewRecipeState', () => {
  it('syncs percents when previewing a weight draft', () => {
    const preview = previewRecipeState(lines, '1000', { 'weight-a': '750' }, 'g', true);
    expect(preview.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(lines[0].weightPercent).toBe('60');
  });

  it('returns committed state when there are no drafts', () => {
    const preview = previewRecipeState(lines, '1000', {}, 'g', false);
    expect(preview.lines).toBe(lines);
    expect(preview.batchOilGrams).toBe('1000');
  });
});
