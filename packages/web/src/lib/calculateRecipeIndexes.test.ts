import { describe, expect, it } from 'vitest';
import { calculateRecipeIndexes } from './calculateRecipeIndexes';
import { isTarOil, OILS } from './oils';
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

  it('returns the populated missingOilIds when every oil lacks index data (finding R2)', () => {
    const lines = [
      { key: 'a', oilId: 'ghost-oil', weightGrams: '500' },
      { key: 'b', oilId: 'ghost-oil-2', weightGrams: '500' },
    ];
    const result = calculateRecipeIndexes(lines, DEFAULT_SETTINGS);
    expect(result.iodine).toBeNull();
    expect(result.ins).toBeNull();
    expect(result.coveragePercent).toBe(0);
    expect(result.missingOilIds.sort()).toEqual(['ghost-oil', 'ghost-oil-2']);
  });
});

// Pine tar and birch tar store iodine 0 and INS 0, placeholders beside "No fatty acids; soap
// property predictions N/A". Averaged in, 50 g of pine tar in 950 g of olive oil lowered iodine
// from 85 to 81 and INS from 105 to 100, and no "no data" note appeared.
describe('tar oils carry no iodine or INS', () => {
  it('leaves a tar out of the average and names it as missing', () => {
    const olive = calculateRecipeIndexes([{ key: 'a', oilId: 'olive-oil', weightGrams: '950' }], DEFAULT_SETTINGS);
    const withTar = calculateRecipeIndexes(
      [
        { key: 'a', oilId: 'olive-oil', weightGrams: '950' },
        { key: 'b', oilId: 'pine-tar', weightGrams: '50' },
      ],
      DEFAULT_SETTINGS,
    );
    expect(withTar.iodine).toBeCloseTo(olive.iodine!, 10);
    expect(withTar.ins).toBeCloseTo(olive.ins!, 10);
    expect(withTar.coveragePercent).toBeCloseTo(95, 10);
    expect(withTar.missingOilIds).toEqual(['pine-tar']);
  });

  it('changes only the tars across the whole catalog; a genuine 0 (lauric acid) still counts', () => {
    const excluded = OILS.filter((oil) => {
      if (oil.iodine === undefined || oil.ins === undefined) return false;
      const r = calculateRecipeIndexes(
        [
          { key: 'a', oilId: 'olive-oil', weightGrams: '700' },
          { key: 'b', oilId: oil.id, weightGrams: '300' },
        ],
        DEFAULT_SETTINGS,
      );
      return r.missingOilIds.includes(oil.id);
    }).map((oil) => oil.id);
    expect(excluded.sort()).toEqual(OILS.filter((oil) => isTarOil(oil)).map((oil) => oil.id).sort());
    expect(excluded.sort()).toEqual(['birch-tar', 'pine-tar']);
    const lauric = calculateRecipeIndexes([{ key: 'a', oilId: 'lauric-acid', weightGrams: '100' }], DEFAULT_SETTINGS);
    expect(lauric.iodine).toBe(0);
    expect(lauric.coveragePercent).toBe(100);
  });
});
