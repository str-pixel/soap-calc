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

  it('suggests oil grams from bar count with zero waste factor', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
    });
    expect(grams).toBe(650);
  });

  it('applies waste factor when set', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
      wasteFactorPercent: '5',
    });
    expect(grams).toBeCloseTo(682.5, 1);
  });

  it('suggests base oil grams when waste factor is explicitly zero', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      mode: 'bars',
      barCount: '10',
      barWeight: '100',
      wasteFactorPercent: '0',
    });
    expect(grams).toBe(650);
  });

  it('suggests oil grams from a cylinder mold in cm', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      moldShape: 'cylinder',
      radius: '4',
      height: '10',
    });
    const expectedVolume = Math.PI * 16 * 10;
    expect(grams).toBeCloseTo(expectedVolume * 0.92 * 0.65, 5);
  });

  it('returns null for a cylinder mold missing a dimension', () => {
    const grams = suggestOilGramsFromMoldSizer({
      ...DEFAULT_MOLD_SIZER_INPUT,
      moldShape: 'cylinder',
      radius: '4',
      height: '',
    });
    expect(grams).toBeNull();
  });
});
