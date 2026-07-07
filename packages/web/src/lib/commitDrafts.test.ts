import { describe, expect, it } from 'vitest';
import { commitDrafts, previewRecipeState } from './commitDrafts';
import type { RecipeLine } from './recipe';

const lines: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
  { key: 'b', oilId: 'coconut-oil-76', weightGrams: '400', weightPercent: '40' },
];

describe('commitDrafts', () => {
  it('applies pending weight and percent drafts together', () => {
    const result = commitDrafts(lines, '1000', { 'weight-a': '750', 'percent-b': '25' }, 'g');
    expect(result.batchOilGrams).toBe('1000');
    expect(result.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(result.lines[1]).toMatchObject({ weightGrams: '250', weightPercent: '25' });
  });

  it('ignores incomplete drafts', () => {
    const result = commitDrafts(lines, '1000', { 'weight-a': '16.' }, 'oz');
    expect(result.lines[0].weightGrams).toBe('600');
  });
});

describe('previewRecipeState', () => {
  it('syncs percents when previewing a weight draft', () => {
    const preview = previewRecipeState(lines, '1000', { 'weight-a': '750' }, 'g');
    expect(preview.lines[0]).toMatchObject({ weightGrams: '750', weightPercent: '75' });
    expect(lines[0].weightPercent).toBe('60');
  });

  it('returns committed state when there are no drafts', () => {
    const preview = previewRecipeState(lines, '1000', {}, 'g');
    expect(preview.lines).toBe(lines);
    expect(preview.batchOilGrams).toBe('1000');
  });
});
