// packages/core/src/fragrance.test.ts
import { describe, expect, it } from 'vitest';
import {
  ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT,
  allergenBreakEvenPercentOfFragrance,
  allergensToLabel,
  essentialOilCaution,
  fragranceGrams,
  ceilingDigits,
  EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT,
  formatPercentToward,
  formatShareAgainstCeiling,
  fragranceDoseAtCeiling,
  fragranceOverUsualRange,
  usualDoseClause,
  usualDosePastClause,
  ifraCategoryNinePercent,
  fragranceShareOfProduct,
  polysorbate20Grams,
  vanillaStabilizerGrams,
  vanillinBrowning,
} from './fragrance';

describe('fragranceGrams — total oil weight × % (CP:9612-9614), or the finished solution for LS', () => {
  it('1000 g × 3% = 30 g', () => expect(fragranceGrams(3, 1000)).toBe(30));
  it('is 0 for a blank, negative or non-finite percent and for a zero basis', () => {
    expect(fragranceGrams(null, 1000)).toBe(0);
    expect(fragranceGrams(-1, 1000)).toBe(0);
    expect(fragranceGrams(NaN, 1000)).toBe(0);
    expect(fragranceGrams(3, 0)).toBe(0);
  });
});

describe('fragranceShareOfProduct — the IFRA basis is the FINISHED product, not the oils', () => {
  it('5% of 1000 g oils is 3.85% of a 1299.5 g finished bar (1470 g batch, 15% cure loss, fragrance kept)', () => {
    const base = 1000 + 140 + 330;
    const product = base * (1 - 0.15) + 50;
    expect(fragranceShareOfProduct(50, product)).toBeCloseTo(3.85, 2);
  });
  it('is 0 when the product weight is unknown or zero', () => {
    expect(fragranceShareOfProduct(50, 0)).toBe(0);
  });
});

describe('fragranceOverUsualRange — the top of the books\' range, in the dose basis', () => {
  it('bars: past 6% of oil weight (CP:9612-9614); liquid soap: past 3% of the solution (LS:2950-2953)', () => {
    expect(fragranceOverUsualRange(6, 'cp')).toBe(false);
    expect(fragranceOverUsualRange(6.1, 'cp')).toBe(true);
    expect(fragranceOverUsualRange(6.1, 'hp')).toBe(true);
    expect(fragranceOverUsualRange(3, 'ls')).toBe(false);
    expect(fragranceOverUsualRange(3.1, 'ls')).toBe(true);
    expect(fragranceOverUsualRange(null, 'cp')).toBe(false);
  });
});

describe('the usual range, in words, from the one record', () => {
  it('reads the same numbers the verdict uses', () => {
    expect(usualDoseClause('cp')).toBe('bars usually carry 2–6% of oil weight');
    expect(usualDoseClause('hp')).toBe('bars usually carry 2–6% of oil weight');
    expect(usualDoseClause('ls')).toBe('liquid soap usually carries 0.5–3% of the finished solution, 3% at most');
    expect(usualDosePastClause('cp')).toBe('the 2–6% of oil weight bars usually carry');
    expect(usualDosePastClause('ls')).toBe('the 3% of the finished solution liquid soap carries at most');
  });
});

describe('formatPercentToward — one figure, rounded the way the sentence needs', () => {
  it('drops trailing zeros and rounds down, up or nearest', () => {
    expect(formatPercentToward(1.0, 1, 'down')).toBe('1');
    expect(formatPercentToward(1.6438, 1, 'down')).toBe('1.6');
    expect(formatPercentToward(1.6438, 1, 'up')).toBe('1.7');
    expect(formatPercentToward(0.65333, 2, 'down')).toBe('0.65');
    expect(formatPercentToward(15.819, 1, 'nearest')).toBe('15.8');
    // float noise must not push a figure over: 1.1 × 10 is 11.000000000000002
    expect(formatPercentToward(1.1, 1, 'up')).toBe('1.1');
    expect(formatPercentToward(1.3, 1, 'down')).toBe('1.3');
  });
  it('ceilingDigits: one decimal from 1% up, two below', () => {
    expect(ceilingDigits(1)).toBe(1);
    expect(ceilingDigits(9.6)).toBe(1);
    expect(ceilingDigits(0.6533)).toBe(2);
  });
});

describe('formatShareAgainstCeiling — the printed figures never contradict the verdict', () => {
  it('a dose over its ceiling always prints above it', () => {
    expect(formatShareAgainstCeiling(1.04, 1, true)).toEqual({ share: '1.1', ceiling: '1' });
    expect(formatShareAgainstCeiling(1.44, 1.4, true)).toEqual({ share: '1.5', ceiling: '1.4' });
    expect(formatShareAgainstCeiling(0.654, 0.6533, true)).toEqual({ share: '0.66', ceiling: '0.65' });
    expect(formatShareAgainstCeiling(2.345, 1, true)).toEqual({ share: '2.4', ceiling: '1' });
  });
  it('a dose under its ceiling prints to the nearest, and never above the printed ceiling', () => {
    expect(formatShareAgainstCeiling(0.794, 1, false)).toEqual({ share: '0.8', ceiling: '1' });
    expect(formatShareAgainstCeiling(0.652, 0.6533, false)).toEqual({ share: '0.65', ceiling: '0.65' });
    // nearest would say 1.7 above a ceiling printed as 1.6 — rounded down instead
    expect(formatShareAgainstCeiling(1.65, 1.66, false)).toEqual({ share: '1.6', ceiling: '1.6' });
  });
});

describe('fragranceDoseAtCeiling — the ceiling in the basis the maker types in', () => {
  it('solves for the oil inside the product it is part of', () => {
    // 1% ceiling; a 1300 g bar holding 10 g of the oil: 0.01 × 1290 ÷ 0.99 = 13.03 g → 1.303% of 1000 g oils
    expect(fragranceDoseAtCeiling(1, 1300, 10, 0, 1000)).toBeCloseTo(1.303, 3);
    // and typing that lands exactly on the ceiling
    const g = 13.0303;
    expect((100 * g) / (1290 + g)).toBeCloseTo(1, 4);
  });
  it('counts what rides with the dose — polysorbate at 1:1 halves the room', () => {
    // 1% ceiling, 1000 g bottle with 30 g of oil and 30 g of polysorbate: rest 940,
    // g = 0.01 × 940 ÷ (1 − 0.02) = 9.59 g → 0.959% of a 1000 g solution
    const d = fragranceDoseAtCeiling(1, 1000, 30, 30, 1000)!;
    expect(d).toBeCloseTo(0.959, 3);
    const g = 9.5918;
    expect((100 * g) / (940 + 2 * g)).toBeCloseTo(1, 4);
  });
  it('is null without a product weight, a ceiling, or a basis', () => {
    expect(fragranceDoseAtCeiling(1, null, 10, 0, 1000)).toBeNull();
    expect(fragranceDoseAtCeiling(null, 1300, 10, 0, 1000)).toBeNull();
    expect(fragranceDoseAtCeiling(1, 1300, 10, 0, 0)).toBeNull();
    expect(fragranceDoseAtCeiling(100, 1300, 10, 0, 1000)).toBeNull();
  });
});


describe('essentialOilCaution — clove and cinnamon EOs accelerate and irritate (CP:9531-9537, 9589-9592)', () => {
  it('fires for an oil named clove or cinnamon, case-insensitively', () => {
    expect(essentialOilCaution('Clove bud')).toBe(true);
    expect(essentialOilCaution('CINNAMON leaf')).toBe(true);
    expect(essentialOilCaution('Lavender')).toBe(false);
    expect(essentialOilCaution('')).toBe(false);
  });
});

describe('vanillin — browning (CP:9740) and the stabilizer ratio (CP:9789-9792)', () => {
  it('browning: none without vanillin, light at ≤1%, deep above', () => {
    expect(vanillinBrowning(null)).toBe('none');
    expect(vanillinBrowning(0)).toBe('none');
    expect(vanillinBrowning(1)).toBe('light');
    expect(vanillinBrowning(1.1)).toBe('deep');
  });
  it('stabilizer: 1:2 up to and including 10% vanillin, 1:1 above', () => {
    expect(vanillaStabilizerGrams(30, 5)).toBe(15);
    expect(vanillaStabilizerGrams(30, 10)).toBe(15);
    expect(vanillaStabilizerGrams(30, 12)).toBe(30);
    expect(vanillaStabilizerGrams(30, 0)).toBe(0);
    expect(vanillaStabilizerGrams(30, null)).toBe(0);
  });
});

describe('allergensToLabel — Annex III names an allergen above 0.01% of a rinse-off product', () => {
  // 30 g fragrance in a 1279.5 g bar = 2.34% share.
  const product = 1279.5;
  it('flags 12% and 0.5% of the fragrance, not 0.4%', () => {
    const rows = [
      { name: 'Linalool', percentOfFragrance: 12, fragranceGrams: 30 },
      { name: 'Limonene', percentOfFragrance: 0.5, fragranceGrams: 30 },
      { name: 'Coumarin', percentOfFragrance: 0.4, fragranceGrams: 30 },
    ];
    const out = allergensToLabel(rows, product);
    expect(out.map((a) => a.name)).toEqual(['Linalool', 'Limonene']);
    expect(out[1].percentOfProduct).toBeCloseTo(0.0117, 4);
  });
  it('is strict: exactly 0.01% is not "exceeds"', () => {
    const exact = (ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT / 100) * product; // grams of allergen at the threshold
    const pct = (exact / 30) * 100; // as % of a 30 g fragrance
    expect(allergensToLabel([{ name: 'Geraniol', percentOfFragrance: pct, fragranceGrams: 30 }], product)).toEqual([]);
  });
  it('sums the same allergen across two rows, matching the name trimmed and case-insensitively', () => {
    const rows = [
      { name: 'Limonene', percentOfFragrance: 0.3, fragranceGrams: 30 },
      { name: ' limonene ', percentOfFragrance: 0.3, fragranceGrams: 30 },
    ];
    const out = allergensToLabel(rows, product);
    expect(out).toHaveLength(1);
    expect(out[0].percentOfProduct).toBeCloseTo(0.0141, 4);
  });
  it('returns nothing when the product weight is unknown', () => {
    expect(allergensToLabel([{ name: 'Linalool', percentOfFragrance: 12, fragranceGrams: 30 }], 0)).toEqual([]);
  });
});

describe('polysorbate20Grams — equal parts to the fragrance when LS carries a superfat (LS:16987-16989)', () => {
  it('matches the fragrance grams above 0% superfat, and is 0 otherwise', () => {
    expect(polysorbate20Grams(30, 2)).toBe(30);
    expect(polysorbate20Grams(30, 0)).toBe(0);
    expect(polysorbate20Grams(30, null)).toBe(0);
  });
});

describe('how much of the oil an allergen must be before it is named', () => {
  it('is the threshold divided by the dose, so a heavier dose catches more', () => {
    // 2% of the bar → anything over 0.5% of the oil clears 0.01% of the product.
    expect(allergenBreakEvenPercentOfFragrance(2)).toBeCloseTo(0.5, 9);
    expect(allergenBreakEvenPercentOfFragrance(1)).toBeCloseTo(1, 9);
    expect(allergenBreakEvenPercentOfFragrance(5)).toBeCloseTo(0.2, 9);
  });

  it('agrees with the declaration it is derived from', () => {
    const share = 2;
    const breakEven = allergenBreakEvenPercentOfFragrance(share)!;
    const productGrams = 1000;
    const fragranceGrams = (share / 100) * productGrams;
    // Just over the line is named; just under it is not.
    const over = allergensToLabel([{ name: 'Linalool', percentOfFragrance: breakEven * 1.01, fragranceGrams }], productGrams);
    const under = allergensToLabel([{ name: 'Linalool', percentOfFragrance: breakEven * 0.99, fragranceGrams }], productGrams);
    expect(over).toHaveLength(1);
    expect(under).toHaveLength(0);
  });

  it('has no answer without a dose', () => {
    expect(allergenBreakEvenPercentOfFragrance(0)).toBeNull();
    expect(allergenBreakEvenPercentOfFragrance(NaN)).toBeNull();
    expect(allergenBreakEvenPercentOfFragrance(-2)).toBeNull();
  });
});

describe('IFRA Category 9, which is the category soap sits in', () => {
  it('answers for the substances that carry a ceiling, and stays silent for the rest', () => {
    expect(ifraCategoryNinePercent('Eugenol')).toBe(4.9);
    expect(ifraCategoryNinePercent('Cinnamal')).toBe(0.49);
    expect(ifraCategoryNinePercent('Citral')).toBe(1.2);
    // The 51st Amendment's own figures for the two that bring cedarwood and clove into scope.
    expect(ifraCategoryNinePercent('Cedrene')).toBe(2.9);
    expect(ifraCategoryNinePercent('Methyl eugenol')).toBe(0.0017);
    // No Category 9 concentration limit exists for these: IFRA restricts the first two by
    // peroxide value instead, and inventing a number would be worse than saying nothing.
    expect(ifraCategoryNinePercent('Limonene')).toBeNull();
    expect(ifraCategoryNinePercent('Linalool')).toBeNull();
    expect(ifraCategoryNinePercent('Benzyl benzoate')).toBeNull();
    expect(ifraCategoryNinePercent('Nonsense')).toBeNull();
  });

  it('keeps the standard\'s own figure for cinnamal, not the one that circulates', () => {
    // Soapmaking guides quote 0.05%; IFRA's standard for this category says 0.49%.
    expect(ifraCategoryNinePercent('Cinnamal')).toBeGreaterThan(0.05);
  });
});

describe('EU Annex III — the one constituent limit the law itself sets on a catalog oil', () => {
  it('methyl eugenol: 0.001% of a rinse-off product (Annex III/102, as quoted in SCCS/1681/25)', () => {
    expect(EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT['Methyl eugenol']).toBe(0.001);
    // Lower than IFRA's own 0.0017% — the law is what binds clove.
    expect(EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT['Methyl eugenol']).toBeLessThan(ifraCategoryNinePercent('Methyl eugenol')!);
    // Labelling allergens are thresholds, not limits: the law names no rinse-off limit on them.
    expect(EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT.Eugenol).toBeUndefined();
    expect(EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT.Linalool).toBeUndefined();
  });
});

