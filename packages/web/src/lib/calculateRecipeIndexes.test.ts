import { describe, expect, it } from 'vitest';
import { calculateRecipeIndexes } from './calculateRecipeIndexes';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';

describe('calculateRecipeIndexes', () => {
  it('returns weighted iodine and INS for starter recipe', () => {
    const result = calculateRecipeIndexes(createStarterLines(), DEFAULT_SETTINGS);
    expect(result.iodine).not.toBeNull();
    expect(result.ins).not.toBeNull();
    expect(result.iodine!).toBeGreaterThan(0);
    expect(result.ins!).toBeGreaterThan(0);
    expect(result.coveragePercent).toBe(100);
    expect(result.missingOilIds).toHaveLength(0);
  });

  it('returns null indexes when no oil weights entered', () => {
    const result = calculateRecipeIndexes(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '' }],
      DEFAULT_SETTINGS,
    );
    expect(result.iodine).toBeNull();
    expect(result.ins).toBeNull();
  });

  it('reports an unknown oil id as missing for indexes', () => {
    const lines = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '500' },
      { key: 'b', oilId: 'ghost-oil', weightGrams: '500' },
    ];
    const result = calculateRecipeIndexes(lines, DEFAULT_SETTINGS);
    expect(result.missingOilIds).toContain('ghost-oil');
  });

  it('renormalizes indexes over covered weight under partial coverage (not diluted)', () => {
    const soloOlive = calculateRecipeIndexes(
      [{ key: 'a', oilId: 'olive-oil', weightGrams: '500' }],
      DEFAULT_SETTINGS,
    );
    const partial = calculateRecipeIndexes(
      [
        { key: 'a', oilId: 'olive-oil', weightGrams: '500' },
        { key: 'b', oilId: 'ghost-oil', weightGrams: '500' },
      ],
      DEFAULT_SETTINGS,
    );
    // Covered oil is pure olive either way, so the index is olive's value, not halved.
    expect(partial.iodine!).toBeCloseTo(soloOlive.iodine!, 5);
    expect(partial.ins!).toBeCloseTo(soloOlive.ins!, 5);
    expect(partial.coveragePercent).toBeCloseTo(50, 5);
  });
});
