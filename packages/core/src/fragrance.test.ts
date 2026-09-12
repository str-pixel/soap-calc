// packages/core/src/fragrance.test.ts
import { describe, expect, it } from 'vitest';
import {
  essentialOilCaution,
  EU_LAW_RINSE_OFF_LIMIT_PERCENT,
  formatDosePastUsualRange,
  formatPercentToward,
  formatShareAgainstCeiling,
  fragranceDoseAtCeiling,
  fragranceOverCeiling,
  fragranceOverUsualRange,
  IFRA_CATEGORY_NINE_PERCENT,
  lsPotentDoseClause,
  USUAL_DOSE_RANGE_PERCENT,
  usualDoseClause,
  usualDosePastClause,
  fragranceGrams,
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
  it('bars: past 6% of oil weight, the top of the recipes (CP:17084); liquid soap: past 3% of the solution (LS:13214)', () => {
    expect(fragranceOverUsualRange(6, 'cp')).toBe(false);
    expect(fragranceOverUsualRange(6.1, 'cp')).toBe(true);
    expect(fragranceOverUsualRange(6.1, 'hp')).toBe(true);
    expect(fragranceOverUsualRange(3, 'ls')).toBe(false);
    expect(fragranceOverUsualRange(3.1, 'ls')).toBe(true);
    expect(fragranceOverUsualRange(null, 'cp')).toBe(false);
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
    // nor pull a half down: 1.45 × 10 is 14.499999999999998, and rounds to 1.5 as on paper
    expect(formatPercentToward(1.45, 1, 'nearest')).toBe('1.5');
    expect(formatPercentToward(0.285, 2, 'nearest')).toBe('0.29');
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


describe('polysorbate20Grams — equal parts to the fragrance when LS carries a superfat (LS:16987-16989)', () => {
  it('matches the fragrance grams above 0% superfat, and is 0 otherwise', () => {
    expect(polysorbate20Grams(30, 2)).toBe(30);
    expect(polysorbate20Grams(30, 0)).toBe(0);
    expect(polysorbate20Grams(30, null)).toBe(0);
  });
});


describe('IFRA Category 9, which is the category soap sits in', () => {
  it('answers for the substances that carry a ceiling, and stays silent for the rest', () => {
    expect(IFRA_CATEGORY_NINE_PERCENT.Eugenol).toBe(4.9);
    expect(IFRA_CATEGORY_NINE_PERCENT.Cinnamal).toBe(0.49);
    expect(IFRA_CATEGORY_NINE_PERCENT.Citral).toBe(1.2);
    // The 51st Amendment's own figures for the two that bring cedarwood and clove into scope.
    expect(IFRA_CATEGORY_NINE_PERCENT.Cedrene).toBe(2.9);
    expect(IFRA_CATEGORY_NINE_PERCENT['Methyl eugenol']).toBe(0.0017);
    // No Category 9 concentration limit exists for these: IFRA restricts them by peroxide
    // value instead, and inventing a number would be worse than saying nothing.
    expect(IFRA_CATEGORY_NINE_PERCENT.Limonene).toBeUndefined();
    expect(IFRA_CATEGORY_NINE_PERCENT.Linalool).toBeUndefined();
    // Benzyl benzoate DOES carry one (Amendment 49, dermal sensitisation) — an earlier note
    // here said it had no standard, which the 51st-amendment text does not bear out.
    expect(IFRA_CATEGORY_NINE_PERCENT['Benzyl benzoate']).toBe(1.9);
    // The three prohibited-as-such constituents sit at their notebox figure for natural presence.
    expect(IFRA_CATEGORY_NINE_PERCENT.Safrole).toBe(0.01);
    expect(IFRA_CATEGORY_NINE_PERCENT['7-Methoxycoumarin']).toBe(0.01);
    expect(IFRA_CATEGORY_NINE_PERCENT['Benzyl cyanide']).toBe(0.01);
  });

  it('keeps the standard\'s own figure for cinnamal, not the one that circulates', () => {
    // Soapmaking guides quote 0.05%; IFRA's standard for this category says 0.49%.
    expect(IFRA_CATEGORY_NINE_PERCENT.Cinnamal).toBeGreaterThan(0.05);
  });
});



describe('the usual range, in words, from the one record', () => {
  it('reads the same numbers the verdict and the start use', () => {
    expect(USUAL_DOSE_RANGE_PERCENT.cp).toEqual({ low: 3, high: 6, start: 3 });
    expect(USUAL_DOSE_RANGE_PERCENT.ls).toEqual({ low: 0.5, high: 3, start: 1 });
    expect(usualDoseClause('cp')).toBe('the bar recipes in the cold-process text run 3–6% of oil weight');
    expect(usualDoseClause('hp')).toBe(usualDoseClause('cp'));
    expect(usualDoseClause('ls')).toBe('liquid soap takes 0.5–3% of the finished solution, 3% at most, and most oils need only 0.5–1%');
    expect(usualDosePastClause('cp')).toBe("the 3–6% of oil weight the cold-process text's bar recipes run to");
    expect(usualDosePastClause('ls')).toBe('the 3% of the finished solution liquid soap takes at most');
    expect(lsPotentDoseClause()).toBe('most oils need only 0.5–1% of a liquid soap for a potent scent');
  });
  it('a dose printed as past the range is rounded up, so it never prints as equal to the top', () => {
    expect(formatDosePastUsualRange(6.004)).toBe('6.01');
    expect(formatDosePastUsualRange(3.001)).toBe('3.01');
    expect(formatDosePastUsualRange(8)).toBe('8');
  });
});

describe('fragranceOverCeiling — the one verdict', () => {
  it('is strict, with a hair of tolerance for a share that lands on the ceiling', () => {
    expect(fragranceOverCeiling(1.0000000001, 1)).toBe(false);
    expect(fragranceOverCeiling(1.00001, 1)).toBe(true);
    expect(fragranceOverCeiling(0, 1)).toBe(false);
    expect(fragranceOverCeiling(5, null)).toBe(false);
  });
});

describe('formatShareAgainstCeiling — the printed figures never contradict the verdict, nor overstate the dose', () => {
  it('a dose over its ceiling prints above it — at one more decimal where that is what it takes', () => {
    expect(formatShareAgainstCeiling(1.04, 1)).toMatchObject({ share: '1.04', ceiling: '1', over: true });
    expect(formatShareAgainstCeiling(1.44, 1.4)).toMatchObject({ share: '1.44', ceiling: '1.4', over: true });
    expect(formatShareAgainstCeiling(0.654, 0.6533)).toMatchObject({ share: '0.654', ceiling: '0.65', over: true });
    // well over: the nearest figure already reads above, and is not rounded up
    expect(formatShareAgainstCeiling(2.345, 1)).toMatchObject({ share: '2.3', over: true });
    expect(formatShareAgainstCeiling(1.02, 1)).toMatchObject({ share: '1.02', over: true });
    // a hair over: rounded up at the finer decimal only as a last resort
    expect(formatShareAgainstCeiling(1.0000000024, 1)).toMatchObject({ share: '1.01', over: true });
  });
  it('a dose under its ceiling prints to the nearest, and never above the printed ceiling', () => {
    expect(formatShareAgainstCeiling(0.794, 1)).toMatchObject({ share: '0.8', ceiling: '1', over: false });
    expect(formatShareAgainstCeiling(0.652, 0.6533)).toMatchObject({ share: '0.65', ceiling: '0.65', over: false });
    // nearest would say 1.7 above a ceiling printed as 1.6 — rounded down instead
    expect(formatShareAgainstCeiling(1.65, 1.66)).toMatchObject({ share: '1.6', ceiling: '1.6', over: false });
  });
  it('carries the ceiling in the dose basis, rounded down, and no share when there is no dose', () => {
    expect(formatShareAgainstCeiling(null, 1.6438, 2.156)).toEqual({ share: null, ceiling: '1.6', basis: '2.1', over: false });
    expect(formatShareAgainstCeiling(0, 1, null)).toEqual({ share: null, ceiling: '1', basis: null, over: false });
  });
});

describe('fragranceDoseAtCeiling — the ceiling in the basis the maker types in', () => {
  it('solves for the oil inside the product it is part of', () => {
    // 1% ceiling; a 1300 g bar holding 10 g of the oil: 0.01 × 1290 ÷ 0.99 = 13.03 g → 1.303% of 1000 g oils
    expect(fragranceDoseAtCeiling(1, 1300, 10, 1, 1000)).toBeCloseTo(1.303, 3);
    const g = 13.0303;
    expect((100 * g) / (1290 + g)).toBeCloseTo(1, 4);
  });
  it('counts what grows with the dose — polysorbate at 1:1 doubles every gram put in', () => {
    // 1% ceiling, 1000 g bottle with 30 g of oil and 30 g of polysorbate (m = 2): rest 940,
    // g = 0.01 × 940 ÷ (1 − 0.02) = 9.59 g → 0.959% of a 1000 g solution
    const d = fragranceDoseAtCeiling(1, 1000, 30, 2, 1000)!;
    expect(d).toBeCloseTo(0.959, 3);
    const g = 9.5918;
    expect((100 * g) / (940 + 2 * g)).toBeCloseTo(1, 4);
  });
  it('and a preservative dosed on the whole pot — the same m, known before any dose is typed', () => {
    // 1% w/w preservative: the pot is the basis ÷ 0.99, so m = 2 ÷ 0.99 with polysorbate.
    const m = 2 / 0.99;
    const d = fragranceDoseAtCeiling(1, 1000, 30, m, 1000)!;
    const g = (d / 100) * 1000;
    const rest = 1000 - 30 * m;
    expect((100 * g) / (rest + g * m)).toBeCloseTo(1.0, 6);
    // the figure with no dose typed is the same one — m does not depend on the grams
    const empty = fragranceDoseAtCeiling(1, rest, 0, m, 1000)!;
    expect(empty).toBeCloseTo(d, 9);
  });
  it('is null without a product weight, a ceiling, or a basis, and where no dose fits', () => {
    expect(fragranceDoseAtCeiling(1, null, 10, 1, 1000)).toBeNull();
    expect(fragranceDoseAtCeiling(1, Number.NaN, 10, 1, 1000)).toBeNull();
    expect(fragranceDoseAtCeiling(null, 1300, 10, 1, 1000)).toBeNull();
    expect(fragranceDoseAtCeiling(1, 1300, 10, 1, 0)).toBeNull();
    expect(fragranceDoseAtCeiling(100, 1300, 10, 1, 1000)).toBeNull();
    // c·m at or past 1: a 60% ceiling with the product doubling per gram
    expect(fragranceDoseAtCeiling(60, 1000, 0, 2, 1000)).toBeNull();
  });
  it('treats a factor under 1 as 1 — the product cannot grow by less than what is put in', () => {
    expect(fragranceDoseAtCeiling(1, 1300, 10, 0.5, 1000)).toBe(fragranceDoseAtCeiling(1, 1300, 10, 1, 1000));
  });
});

describe('EU law — the constituent limits the law itself sets on a catalog oil, each with its annex', () => {
  it('methyl eugenol: 0.001% of a rinse-off product (Annex III/102, as quoted in SCCS/1681/25)', () => {
    expect(EU_LAW_RINSE_OFF_LIMIT_PERCENT['Methyl eugenol']).toEqual({ percent: 0.001, where: 'Annex III' });
    // Lower than IFRA's own 0.0017% — the law is what binds clove.
    expect(EU_LAW_RINSE_OFF_LIMIT_PERCENT['Methyl eugenol'].percent).toBeLessThan(IFRA_CATEGORY_NINE_PERCENT['Methyl eugenol']);
    // Labelling allergens are thresholds, not limits: the law names no rinse-off limit on them.
    expect(EU_LAW_RINSE_OFF_LIMIT_PERCENT.Eugenol).toBeUndefined();
    expect(EU_LAW_RINSE_OFF_LIMIT_PERCENT.Linalool).toBeUndefined();
  });
  it('safrole: Annex II/360, 100 ppm of the finished product for its natural content — not Annex III', () => {
    expect(EU_LAW_RINSE_OFF_LIMIT_PERCENT.Safrole).toEqual({ percent: 0.01, where: 'Annex II' });
  });
});
