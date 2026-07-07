import { describe, expect, it } from 'vitest';
import { convertEntryMode } from './entryMode';
import { DEFAULT_SETTINGS } from './recipe';

describe('resolveLineWeights', () => {
  it('derives grams from percent and batch size', async () => {
    const { resolveLineWeights } = await import('./resolveLineWeights');
    const result = resolveLineWeights(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '', weightPercent: '60' }],
      { ...DEFAULT_SETTINGS, entryMode: 'percent', batchOilGrams: '500' },
    );
    expect(result.lines[0].weightGrams).toBe(300);
    expect(result.recipeOilWeightGrams).toBe(500);
  });
});

describe('convertEntryMode', () => {
  it('converts grams to percent using total weight', () => {
    const lines = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '750' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '250' },
    ];
    const { lines: next, settings } = convertEntryMode(lines, DEFAULT_SETTINGS, 'percent');
    expect(settings.entryMode).toBe('percent');
    expect(settings.batchOilGrams).toBe('1000');
    expect(next[0].weightPercent).toBe('75');
    expect(next[1].weightPercent).toBe('25');
  });
});
