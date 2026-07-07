import { describe, expect, it } from 'vitest';
import { previewRecipeState } from './commitDrafts';
import type { RecipeLine } from './recipe';

const lines: RecipeLine[] = [
  { key: 'a', oilId: 'olive-oil', weightGrams: '600', weightPercent: '60' },
];

describe('recipePreview', () => {
  it('uses in-progress weight drafts for preview without mutating committed lines', () => {
    const preview = previewRecipeState(lines, '1000', { 'weight-a': '16' }, 'oz');
    expect(preview.lines[0].weightGrams).toBe('454');
    expect(lines[0].weightGrams).toBe('600');
  });

  it('ignores incomplete weight drafts', () => {
    const preview = previewRecipeState(lines, '1000', { 'weight-a': '16.' }, 'oz');
    expect(preview.lines[0].weightGrams).toBe('600');
  });

  it('uses in-progress batch drafts for preview', () => {
    const preview = previewRecipeState(lines, '1000', { 'batch-total': '2' }, 'lb');
    expect(preview.batchOilGrams).toBe('907.2');
  });
});
