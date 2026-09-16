import { describe, expect, it } from 'vitest';
import { calculateRecipeFattyAcids } from './fatty-acids.js';
import {
  formatCoveragePercent,
  isLowCoverage,
  isPartialCoverage,
  LOW_COVERAGE_PERCENT,
} from './properties.js';

// Every panel prints coverage as a whole number ("based on fatty-acid data for 80% of recipe oil
// weight") and decided
// low coverage on that printed figure, while the insights compared the raw one. So between
// 79.5% and 80% a panel judged its readings under an "80%" caption while the insights treated
// the same recipe as an estimate. One helper now decides for every caller, on the printed
// figure.
describe('isLowCoverage', () => {
  it('decides on the whole-number percentage the panels print', () => {
    expect(isLowCoverage(79.4)).toBe(true); // prints "79%"
    expect(isLowCoverage(79.5)).toBe(false); // prints "80%"
    expect(isLowCoverage(79.9)).toBe(false);
    expect(isLowCoverage(LOW_COVERAGE_PERCENT)).toBe(false);
    expect(isLowCoverage(100)).toBe(false);
    expect(isLowCoverage(0)).toBe(true);
  });
});

// Every caption decided "partial" on the raw figure (< 99.9) and printed Math.round, so coverage
// of 99.5–99.9 read "based on 100%", and an oil with no data went unnamed once coverage reached
// 99.9. Measured on the lite catalog: macadamia and roasted coffee alone printed "100%"; a 4 g
// no-data oil beside 47 of 118 oils printed "100% (no data: …)"; a 0.5 g one went unnamed
// beside 44.
describe('coverage captions', () => {
  it('counts 99.9 or more as complete, whatever float error the batch weights add', () => {
    expect(isPartialCoverage(99.89999999999999, 0)).toBe(false); // macadamia alone
    expect(isPartialCoverage(99.9, 0)).toBe(false);
    expect(isPartialCoverage(100, 0)).toBe(false);
    expect(isPartialCoverage(99.85, 0)).toBe(true);
  });

  it('is partial while any oil has no data, however little it weighs', () => {
    expect(isPartialCoverage(99.95, 1)).toBe(true);
    // A 1e-14 g line, reachable only by importing a file, computes as exactly 100.
    expect(isPartialCoverage(100, 1)).toBe(true);
  });

  it('never prints 100 for coverage it is asked to print', () => {
    expect(formatCoveragePercent(79.45)).toBe('79');
    expect(formatCoveragePercent(79.5)).toBe('80');
    expect(formatCoveragePercent(99.45)).toBe('99');
    expect(formatCoveragePercent(99.5)).toBe('99.5');
    expect(formatCoveragePercent(99.55)).toBe('99.5');
    expect(formatCoveragePercent(99.85)).toBe('99.8');
    expect(formatCoveragePercent(99.89999999999999)).toBe('99.9');
    expect(formatCoveragePercent(99.95)).toBe('99.9');
    expect(formatCoveragePercent(100)).toBe('99.9');
  });

  it('prints the whole number isLowCoverage judges, everywhere below 99.5', () => {
    for (let tenths = 0; tenths < 995; tenths++) {
      const pct = tenths / 10;
      expect(Number(formatCoveragePercent(pct)) < LOW_COVERAGE_PERCENT, `${pct}`).toBe(isLowCoverage(pct));
    }
  });

  it('treats a non-finite coverage as no data: partial, low, printed as 0', () => {
    // Two imported lines of 1e308 g overflow the total and give NaN coverage.
    expect(isPartialCoverage(Number.NaN, 0)).toBe(true);
    expect(isLowCoverage(Number.NaN)).toBe(true);
    expect(formatCoveragePercent(Number.NaN)).toBe('0');
  });
});

// The profile is renormalized over COVERED weight, so every percentage in it is inflated by
// 1 ÷ covered share when an oil has no data: 90% grapeseed beside 10% beeswax reads its
// linoleic as if the beeswax were grapeseed too. That is right for the 0–100 scores, which are
// relative, and wrong for an absolute threshold like cure's PUFA 15/25 — which is what raised
// 16.3% false rancidity warnings across 53,100 measured cases. `coveredWeightShare` is the
// factor that converts a renormalized percentage back into a CERTAIN LOWER BOUND on the whole
// recipe: unprofiled weight contributes zero.
describe('coveredWeightShare', () => {
  const grapeseed = { id: 'g', propertiesAvailable: true, fattyAcids: { linoleic: 70, oleic: 16, palmitic: 7, stearic: 4 } };
  const beeswax = { id: 'b', propertiesAvailable: false };
  const lookup = { g: grapeseed, b: beeswax };

  it('is 1 when every oil carries a profile, so the bound equals the reading', () => {
    const r = calculateRecipeFattyAcids([{ oilId: 'g', weightGrams: 500 }], lookup);
    expect(r.coveredWeightShare).toBe(1);
  });

  it('is the covered share of TOTAL oil weight, not of the characterized weight', () => {
    const r = calculateRecipeFattyAcids(
      [{ oilId: 'g', weightGrams: 900 }, { oilId: 'b', weightGrams: 100 }],
      lookup,
    );
    // 900 g of 1000 g carry a profile. Coverage is completeness-weighted (900 × 97/100 = 87.3%),
    // but the BOUND divides by covered weight alone — the two must not be conflated.
    expect(r.coveredWeightShare).toBeCloseTo(0.9, 10);
    expect(r.coveragePercent).toBeCloseTo(87.3, 10);
  });

  it('turns the renormalized profile into a lower bound that never overstates', () => {
    const r = calculateRecipeFattyAcids(
      [{ oilId: 'g', weightGrams: 900 }, { oilId: 'b', weightGrams: 100 }],
      lookup,
    );
    // The profile still reads 70% linoleic — unchanged, so no score moves.
    expect(r.profile?.linoleic).toBeCloseTo(70, 10);
    // The whole recipe is certainly at least 63% linoleic (70 × 0.9); it is exactly 63% if the
    // beeswax carries none, and more only if it carries some. Never less.
    expect((r.profile?.linoleic ?? 0) * r.coveredWeightShare).toBeCloseTo(63, 10);
  });

  it('is 0 when nothing carries a profile', () => {
    const r = calculateRecipeFattyAcids([{ oilId: 'b', weightGrams: 500 }], lookup);
    expect(r.coveredWeightShare).toBe(0);
  });

  it('ignores zero-weight lines, which are not part of the recipe', () => {
    const r = calculateRecipeFattyAcids(
      [{ oilId: 'g', weightGrams: 500 }, { oilId: 'b', weightGrams: 0 }],
      lookup,
    );
    expect(r.coveredWeightShare).toBe(1);
  });
});
