import { describe, expect, it } from 'vitest';
import {
  ALTERNATIVE_LIQUID_GUIDE,
  alternativeLiquidPreset,
  extraLyeForAcidLiquid,
  extraLyeForAcid,
  alternativeLiquidsForProcess,
  alternativeLiquidNoteFor,
  alternativeLiquidFatGrams,
  superfatShiftFromLiquidFat,
  isAlternativeLiquidOfferedFor,
} from './alternative-liquids.js';
import { catalogEntryById } from './additives.js';

describe('ALTERNATIVE_LIQUID_GUIDE', () => {
  it('has unique keys and water fractions in (0, 1]', () => {
    const keys = ALTERNATIVE_LIQUID_GUIDE.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preset of ALTERNATIVE_LIQUID_GUIDE) {
      // Zero water is legal ONLY for solvent presets (glycerin dissolves lye hot but
      // brings no water); every real liquid must carry a positive fraction.
      if (preset.flags.includes('solvent')) {
        expect(preset.waterFraction).toBeGreaterThanOrEqual(0);
      } else {
        expect(preset.waterFraction).toBeGreaterThan(0);
      }
      expect(preset.waterFraction).toBeLessThanOrEqual(1);
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it('distinguishes regular yogurt from greek yogurt by water fraction', () => {
    // USDA-derived: plain whole-milk yogurt ~88% water; greek strains whey out (~81%).
    expect(alternativeLiquidPreset('yogurt')?.waterFraction).toBeCloseTo(0.88, 2);
    expect(alternativeLiquidPreset('yogurt-greek')?.waterFraction).toBeCloseTo(0.81, 2);
  });

  it('carries the low-water outlier for canned coconut milk', () => {
    // USDA by-difference (~21% fat): the preset most likely to starve a 1:1 lye solution.
    expect(alternativeLiquidPreset('coconut-milk-canned')?.waterFraction).toBeCloseTo(0.68, 2);
  });

  it('flags sugar-bearing liquids and the alcohol advisory for beer and wine', () => {
    expect(alternativeLiquidPreset('milk')?.flags).toContain('sugars');
    for (const key of ['beer', 'wine']) {
      const preset = alternativeLiquidPreset(key);
      expect(preset?.flags).toContain('alcohol');
      expect(preset?.note).toMatch(/alcohol/i);
    }
    expect(alternativeLiquidPreset('beer')?.waterFraction).toBeCloseTo(0.92, 2);
    expect(alternativeLiquidPreset('wine')?.waterFraction).toBeCloseTo(0.87, 2);
  });

  it('covers the common dairy and juice liquids from CP practice', () => {
    // USDA-derived: buttermilk ~90%, fruit juice ~88%, coconut water ~95%.
    expect(alternativeLiquidPreset('buttermilk')?.waterFraction).toBeCloseTo(0.9, 2);
    expect(alternativeLiquidPreset('fruit-juice')?.waterFraction).toBeCloseTo(0.88, 2);
    expect(alternativeLiquidPreset('coconut-water')?.waterFraction).toBeCloseTo(0.95, 2);
  });

  it('carries heavy cream as the deepest fat outlier', () => {
    // USDA heavy whipping cream: 58% water — even lower than canned coconut milk.
    const cream = alternativeLiquidPreset('heavy-cream');
    expect(cream?.waterFraction).toBeCloseTo(0.58, 2);
    expect(cream?.flags).toContain('sugars');
    expect(cream?.note).toMatch(/fat/i);
  });

  it('returns null for unknown keys', () => {
    expect(alternativeLiquidPreset('motor-oil')).toBeNull();
    expect(alternativeLiquidPreset('')).toBeNull();
  });
});

describe('vinegar (acid) preset and extra-lye compensation', () => {
  it('ships vinegar with the acid flag and its neutralization factors (pure basis)', () => {
    const vinegar = alternativeLiquidPreset('vinegar');
    expect(vinegar?.flags).toContain('acid');
    expect(vinegar?.waterFraction).toBeCloseTo(0.95, 2);
    // 5 g acetic acid per 100 g ÷ 60.05 g/mol × 40.00 (NaOH) / 56.11 (KOH)
    expect(vinegar?.lyeNeutralization?.naohPerGram).toBeCloseTo(0.0333, 4);
    expect(vinegar?.lyeNeutralization?.kohPerGram).toBeCloseTo(0.0467, 4);
  });

  it('computes as-weighed extra lye for NaOH at 99% purity', () => {
    const extra = extraLyeForAcidLiquid(alternativeLiquidPreset('vinegar')!, 330, {
      lyeType: 'naoh',
      kohBlendPercent: 0,
      naohPurityPercent: 99,
      kohPurityPercent: 90,
    });
    // 330 × 0.0333 = 10.99 pure → /0.99 = 11.10 as weighed
    expect(extra.naohGrams).toBeCloseTo(11.1, 1);
    expect(extra.kohGrams).toBe(0);
  });

  it('splits dual-lye compensation by the KOH blend share, each at its own purity', () => {
    const extra = extraLyeForAcidLiquid(alternativeLiquidPreset('vinegar')!, 100, {
      lyeType: 'dual',
      kohBlendPercent: 5,
      naohPurityPercent: 99,
      kohPurityPercent: 90,
    });
    // NaOH: 95 g share → 95×0.0333/0.99 ≈ 3.196; KOH: 5 g share → 5×0.0467/0.90 ≈ 0.2595
    expect(extra.naohGrams).toBeCloseTo(3.2, 1);
    expect(extra.kohGrams).toBeCloseTo(0.26, 2);
  });

  it('returns zero for non-acid presets', () => {
    const extra = extraLyeForAcidLiquid(alternativeLiquidPreset('milk')!, 330, {
      lyeType: 'naoh',
      kohBlendPercent: 0,
      naohPurityPercent: 99,
      kohPurityPercent: 90,
    });
    expect(extra.naohGrams).toBe(0);
    expect(extra.kohGrams).toBe(0);
  });
});

describe('extraLyeForAcid (shared acid math)', () => {
  const recipe = { lyeType: 'naoh' as const, kohBlendPercent: 0, naohPurityPercent: 100, kohPurityPercent: 100 };

  it('extraLyeForAcidLiquid delegates: vinegar result is identical through both paths', () => {
    const preset = alternativeLiquidPreset('vinegar')!;
    const viaPreset = extraLyeForAcidLiquid(preset, 330, recipe);
    const viaFactors = extraLyeForAcid(preset.lyeNeutralization!, 330, recipe);
    expect(viaFactors).toEqual(viaPreset);
  });

  it('splits dual lye by KOH blend share and grosses up by each purity', () => {
    const factors = catalogEntryById('citric-acid')!.lyeNeutralization!;
    const extra = extraLyeForAcid(factors, 10, {
      lyeType: 'dual',
      kohBlendPercent: 40,
      naohPurityPercent: 97,
      kohPurityPercent: 90,
    });
    expect(extra.naohGrams).toBeCloseTo((10 * 0.6 * 0.6246) / 0.97, 2);
    expect(extra.kohGrams).toBeCloseTo((10 * 0.4 * 0.8761) / 0.9, 2);
  });
});

describe('glycerin preset (LS audit 2026-07-27)', () => {
  it('is a zero-water solvent: full grams dissolve lye (hot), none count as water', () => {
    const g = alternativeLiquidPreset('glycerin');
    expect(g?.waterFraction).toBe(0);
    expect(g?.flags).toEqual(['solvent']);
    expect(g?.lyeNeutralization).toBeUndefined();
  });
});

describe('per-process availability (LS audit 2026-07-27)', () => {
  it('offers every preset under CP', () => {
    expect(alternativeLiquidsForProcess('cp')).toHaveLength(ALTERNATIVE_LIQUID_GUIDE.length);
  });

  it('withholds vinegar from LS — acetate hardens a bar, and LS has no bar', () => {
    const lsKeys = alternativeLiquidsForProcess('ls').map((p) => p.key);
    expect(lsKeys).not.toContain('vinegar');
    expect(alternativeLiquidsForProcess('cp').map((p) => p.key)).toContain('vinegar');
    expect(alternativeLiquidsForProcess('hp').map((p) => p.key)).toContain('vinegar');
  });

  it('keeps glycerin and the sugary liquids available in LS', () => {
    const lsKeys = alternativeLiquidsForProcess('ls').map((p) => p.key);
    for (const key of ['glycerin', 'milk', 'coconut-milk-canned', 'beer', 'coffee-tea']) {
      expect(lsKeys).toContain(key);
    }
  });

  it('appends the process note to the base note, and never duplicates it', () => {
    const milk = alternativeLiquidPreset('milk')!;
    const cp = alternativeLiquidNoteFor(milk, 'cp');
    const ls = alternativeLiquidNoteFor(milk, 'ls');
    expect(cp).toBe(milk.note);
    expect(ls).toContain(milk.note!);
    expect(ls!.length).toBeGreaterThan(cp!.length);
    // The LS-specific half must name the two LS-only consequences.
    expect(ls).toMatch(/dilut/i);
  });

  it('leaves presets without a process note untouched', () => {
    // Vinegar carries a base note and no per-process ones — it must read identically
    // everywhere it is offered.
    const vinegar = alternativeLiquidPreset('vinegar')!;
    expect(alternativeLiquidNoteFor(vinegar, 'cp')).toBe(vinegar.note);
    expect(alternativeLiquidNoteFor(vinegar, 'hp')).toBe(vinegar.note);
  });

  it('returns null for a preset with no note at all under any process', () => {
    const bare: Parameters<typeof alternativeLiquidNoteFor>[0] = {
      key: 'bare',
      label: 'Bare',
      waterFraction: 1,
      flags: [],
    };
    expect(alternativeLiquidNoteFor(bare, 'ls')).toBeNull();
  });
});

describe('fat fraction and the LS superfat shift', () => {
  it('carries fat fractions for the fatty liquids, and none for the lean ones', () => {
    expect(alternativeLiquidPreset('heavy-cream')?.fatFraction).toBeCloseTo(0.37, 2);
    expect(alternativeLiquidPreset('coconut-milk-canned')?.fatFraction).toBeCloseTo(0.21, 2);
    expect(alternativeLiquidPreset('milk')?.fatFraction).toBeCloseTo(0.03, 2);
    expect(alternativeLiquidPreset('aloe-juice')?.fatFraction ?? 0).toBe(0);
    expect(alternativeLiquidPreset('glycerin')?.fatFraction ?? 0).toBe(0);
  });

  it('water and fat fractions never exceed the whole liquid', () => {
    for (const preset of ALTERNATIVE_LIQUID_GUIDE) {
      expect(preset.waterFraction + (preset.fatFraction ?? 0)).toBeLessThanOrEqual(1);
    }
  });

  it('sums the unsaponified fat an alternative liquid brings to the batch', () => {
    // 200 g canned coconut milk at 21% fat = 42 g of fat no lye was calculated for.
    expect(
      alternativeLiquidFatGrams([{ presetKey: 'coconut-milk-canned', grams: 200 }]),
    ).toBeCloseTo(42, 3);
  });

  it('ignores rows with no preset, no grams, or a fat-free liquid', () => {
    expect(
      alternativeLiquidFatGrams([
        { presetKey: '', grams: 500 },
        { presetKey: 'milk', grams: null },
        { presetKey: 'aloe-juice', grams: 300 },
      ]),
    ).toBe(0);
  });

  it('expresses the fat as the superfat percentage points it silently adds', () => {
    // 42 g of fat against 1,000 g of oils = 4.2 points on top of the stated superfat.
    expect(superfatShiftFromLiquidFat(42, 1000)).toBeCloseTo(4.2, 3);
    expect(superfatShiftFromLiquidFat(42, 0)).toBe(0);
    expect(superfatShiftFromLiquidFat(0, 1000)).toBe(0);
  });
});

describe('isAlternativeLiquidOfferedFor (stray-row guard)', () => {
  it('is the single predicate behind the picker list', () => {
    // alternativeLiquidsForProcess must be exactly "the presets this says yes to" — if the
    // two ever disagree, a liquid is offered but treated as stray, or vice versa.
    for (const process of ['cp', 'hp', 'ls'] as const) {
      expect(alternativeLiquidsForProcess(process)).toEqual(
        ALTERNATIVE_LIQUID_GUIDE.filter((p) => isAlternativeLiquidOfferedFor(p, process)),
      );
    }
  });

  it('says no to vinegar under LS and yes everywhere it is offered', () => {
    const vinegar = alternativeLiquidPreset('vinegar')!;
    expect(isAlternativeLiquidOfferedFor(vinegar, 'ls')).toBe(false);
    expect(isAlternativeLiquidOfferedFor(vinegar, 'cp')).toBe(true);
    expect(isAlternativeLiquidOfferedFor(vinegar, 'hp')).toBe(true);
  });

  it('says yes to an unrestricted preset under every process', () => {
    const milk = alternativeLiquidPreset('milk')!;
    for (const process of ['cp', 'hp', 'ls'] as const) {
      expect(isAlternativeLiquidOfferedFor(milk, process)).toBe(true);
    }
  });
});

describe('vinegar note names no specific salt', () => {
  it('does not claim sodium acetate — KOH and dual-lye recipes make potassium acetate too', () => {
    const note = alternativeLiquidPreset('vinegar')!.note!;
    expect(note).not.toMatch(/sodium acetate/i);
    expect(note).toMatch(/acetate/i);
  });
});
