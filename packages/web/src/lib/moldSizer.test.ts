import { describe, expect, it } from 'vitest';
import { DEFAULT_MOLD_SIZER_INPUT, suggestOilGramsFromMoldSizer } from './moldSizer';

describe('moldSizer', () => {
  it('suggests oil grams from rectangular mold in cm', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      length: '20',
      width: '10',
      height: '5',
    });
    expect(grams).toBeCloseTo(598, 0);
  });

  it('suggests oil grams from bar count', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
    });
    expect(grams).toBe(650);
  });
});
