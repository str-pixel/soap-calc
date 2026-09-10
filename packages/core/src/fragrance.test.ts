// packages/core/src/fragrance.test.ts
import { describe, expect, it } from 'vitest';
import {
  ALLERGEN_LABEL_THRESHOLD_RINSE_OFF_PERCENT,
  allergenBreakEvenPercentOfFragrance,
  allergensToLabel,
  essentialOilCaution,
  fragranceGrams,
  fragranceOverSupplierMax,
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

describe('fragranceOverSupplierMax', () => {
  it('flags only above the supplier rate, and never when the rate is unknown', () => {
    expect(fragranceOverSupplierMax(5.1, 5)).toBe(true);
    expect(fragranceOverSupplierMax(5, 5)).toBe(false);
    expect(fragranceOverSupplierMax(9, null)).toBe(false);
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
