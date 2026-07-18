import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_CATALOG,
  ADDITIVE_STAGE_LABELS,
  catalogEntryById,
  catalogEntriesForProcess,
  gramsFromDose,
  gramsFromPercentOfOil,
  LATHER_SUPPORT_PACK,
  MAX_ADDITIVE_NAME_LENGTH,
  MAX_RECIPE_ADDITIVES,
  parsePercentOfOil,
  parseDoseAmount,
  type AdditiveStage,
} from './additives.js';

describe('additives', () => {
  it('computes grams from percent of oil weight', () => {
    expect(gramsFromPercentOfOil(1000, 1)).toBe(10);
    expect(gramsFromPercentOfOil(500, 2.5)).toBe(12.5);
  });

  it('rejects invalid percent input', () => {
    expect(parsePercentOfOil('')).toBeNull();
    expect(parsePercentOfOil('abc')).toBeNull();
    expect(parsePercentOfOil('101')).toBeNull();
    expect(parsePercentOfOil('1.5')).toBe(1.5);
  });

  it('ships lather support pack at 1% each', () => {
    expect(LATHER_SUPPORT_PACK).toHaveLength(3);
    expect(LATHER_SUPPORT_PACK.every((item) => item.percentOfOil === 1)).toBe(true);
    expect(ADDITIVE_CATALOG.some((e) => e.id === 'chelator')).toBe(true);
  });

  it('has unique catalog ids and coherent dose ranges', () => {
    const ids = ADDITIVE_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of ADDITIVE_CATALOG) {
      expect(entry.typicalLow).toBeGreaterThanOrEqual(0);
      expect(entry.typicalHigh).toBeLessThanOrEqual(100);
      expect(entry.typicalLow).toBeLessThanOrEqual(entry.typicalHigh);
    }
  });

  it('offers sodium lactate as a lye-water hardener at 1–3%', () => {
    const sl = ADDITIVE_CATALOG.find((e) => e.id === 'sodium-lactate');
    expect(sl).toBeDefined();
    expect(sl?.defaultStage).toBe('lye');
    expect(sl?.typicalLow).toBe(1);
    expect(sl?.typicalHigh).toBe(3);
  });

  it('keeps table salt (id "salt") tightened to a hardener dose', () => {
    const salt = ADDITIVE_CATALOG.find((e) => e.id === 'salt');
    expect(salt).toBeDefined();
    // Above ~1% of oil weight table salt thickens the batch rather than hardening it.
    expect(salt?.typicalHigh).toBeLessThanOrEqual(1);
    expect(salt?.defaultStage).toBe('lye');
  });

  it('exports import limits', () => {
    expect(MAX_RECIPE_ADDITIVES).toBeGreaterThan(0);
    expect(MAX_ADDITIVE_NAME_LENGTH).toBeGreaterThan(0);
  });

  it('includes an after_cook stage labeled "After cook"', () => {
    const stage: AdditiveStage = 'after_cook';
    expect(ADDITIVE_STAGE_LABELS[stage]).toBe('After cook');
  });
});

describe('additive catalog process scoping', () => {
  it('sugar range is corrected to 0.5–2%', () => {
    const sugar = catalogEntryById('sugar-sorbitol');
    expect(sugar?.typicalLow).toBe(0.5);
    expect(sugar?.typicalHigh).toBe(2);
  });
  it('unscoped entries appear for every process', () => {
    const cp = catalogEntriesForProcess('cp');
    expect(cp.some((e) => e.id === 'sugar-sorbitol')).toBe(true);
  });

  it('offers stearic, lauric, and yogurt only for HP', () => {
    const hp = catalogEntriesForProcess('hp').map((e) => e.id);
    expect(hp).toEqual(expect.arrayContaining(['stearic', 'lauric', 'yogurt']));

    const cp = catalogEntriesForProcess('cp').map((e) => e.id);
    expect(cp).not.toEqual(expect.arrayContaining(['stearic', 'lauric', 'yogurt']));
    const ls = catalogEntriesForProcess('ls').map((e) => e.id);
    expect(ls).not.toEqual(expect.arrayContaining(['stearic', 'lauric', 'yogurt']));
  });

  it('doses stearic and lauric as oils at 5–8%', () => {
    const stearic = catalogEntryById('stearic');
    const lauric = catalogEntryById('lauric');
    for (const entry of [stearic, lauric]) {
      expect(entry).toBeDefined();
      expect(entry?.defaultStage).toBe('oils');
      expect(entry?.typicalLow).toBe(5);
      expect(entry?.typicalHigh).toBe(8);
    }
  });

  it('doses yogurt after cook at 2–5%', () => {
    const yogurt = catalogEntryById('yogurt');
    expect(yogurt).toBeDefined();
    expect(yogurt?.defaultStage).toBe('after_cook');
    expect(yogurt?.typicalLow).toBe(2);
    expect(yogurt?.typicalHigh).toBe(5);
  });

  it('guar and hec are LS-only thickeners at 0.5–1% added after dilution', () => {
    for (const id of ['guar', 'hec']) {
      const e = catalogEntryById(id)!;
      expect(e).toBeDefined();
      expect(e.typicalLow).toBe(0.5);
      expect(e.typicalHigh).toBe(1);
      expect(e.defaultStage).toBe('after_cook');
      expect(e.processes).toEqual(['ls']);
    }
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'guar')).toBe(false);
    expect(catalogEntriesForProcess('cp').some((e) => e.id === 'hec')).toBe(false);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'guar')).toBe(true);
    expect(catalogEntriesForProcess('ls').some((e) => e.id === 'hec')).toBe(true);
  });

  it('keeps salt, sodium-lactate, sugar, and eugenol unscoped (reused across processes)', () => {
    for (const id of ['salt', 'sodium-lactate', 'sugar-sorbitol', 'eugenol']) {
      const entry = catalogEntryById(id);
      expect(entry?.processes).toBeUndefined();
    }
  });
});

describe('additive hazard tags (behavior-only)', () => {
  it('flags eugenol as able to seize', () => {
    const entry = catalogEntryById('eugenol');
    expect(entry?.hazards).toContain('can seize');
  });

  it('flags sugar/sorbitol as able to tunnel/overheat', () => {
    const entry = catalogEntryById('sugar-sorbitol');
    expect(entry?.hazards).toContain('can tunnel/overheat');
  });

  it('flags salt as able to make the bar crumbly', () => {
    const entry = catalogEntryById('salt');
    expect(entry?.hazards).toContain('can make the bar crumbly');
  });

  it('flags titanium dioxide as able to glycerin-river at high water', () => {
    const entry = catalogEntryById('titanium-dioxide');
    expect(entry?.hazards).toContain('can glycerin-river at high water');
  });

  it('leaves untagged entries without a hazards field', () => {
    const entry = catalogEntryById('chelator');
    expect(entry?.hazards).toBeUndefined();
  });
});

describe('parseDoseAmount', () => {
  it('accepts percent up to 100 and rejects above', () => {
    expect(parseDoseAmount('5', 'percent')).toBe(5);
    expect(parseDoseAmount('100', 'percent')).toBe(100);
    expect(parseDoseAmount('100.1', 'percent')).toBeNull();
  });
  it('accepts ppt up to 1000 and rejects above', () => {
    expect(parseDoseAmount('3', 'ppt')).toBe(3);
    expect(parseDoseAmount('1000', 'ppt')).toBe(1000);
    expect(parseDoseAmount('1001', 'ppt')).toBeNull();
  });
  it('rejects empty, negative, and non-numeric', () => {
    expect(parseDoseAmount('', 'percent')).toBeNull();
    expect(parseDoseAmount('-1', 'ppt')).toBeNull();
    expect(parseDoseAmount('abc', 'percent')).toBeNull();
  });
});

describe('gramsFromDose', () => {
  it('percent divides by 100, ppt divides by 1000', () => {
    expect(gramsFromDose(1000, 5, 'percent')).toBe(50);
    expect(gramsFromDose(1000, 3, 'ppt')).toBe(3);
  });
  it('returns null for negative basis or amount', () => {
    expect(gramsFromDose(-1, 5, 'percent')).toBeNull();
    expect(gramsFromDose(1000, -5, 'ppt')).toBeNull();
  });
});
