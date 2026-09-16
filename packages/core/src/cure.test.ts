import { describe, expect, it } from 'vitest';
import { estimateCureModel, CURE_TUNING, type CureModelInput } from './cure';

const OLIVE = { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 };
const COCONUT = { lauric: 47.6, myristic: 18.3, palmitic: 8.6, caprylic: 7.1, capric: 6.3, stearic: 2.9, oleic: 7.3, linoleic: 1.7, linolenic: 0.1, arachidic: 0.1, eicosenoic: 0.1 };
const SUNFLOWER = { oleic: 16, stearic: 4, linoleic: 70, palmitic: 7, linolenic: 1 };

const input = (over: Partial<CureModelInput>): CureModelInput => ({
  fa: OLIVE,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  process: 'cp',
  ...over,
});

describe('guards', () => {
  it('returns null for LS (sequester is not an oil-driven cure)', () => {
    expect(estimateCureModel(input({ process: 'ls' }))).toBeNull();
  });
  it('returns null for non-finite lye concentration', () => {
    expect(estimateCureModel(input({ lyeConcentrationPercent: Number.NaN }))).toBeNull();
  });
  it('returns null when FA coverage is zero', () => {
    expect(estimateCureModel(input({ faCoverage: 0 }))).toBeNull();
  });
  it('treats missing FA keys as 0 and still yields a finite floor estimate', () => {
    const e = estimateCureModel(input({ fa: {} }));
    expect(e).not.toBeNull();
    expect(e!.usable.minWeeks).toBe(CURE_TUNING.usableFloorWeeks);
    expect(Number.isFinite(e!.second.maxWeeks)).toBe(true);
  });
  it('returns null when a present FA value is non-finite (corrupted input, not zero)', () => {
    expect(estimateCureModel(input({ fa: { oleic: Number.NaN } }))).toBeNull();
  });
});

describe('milestones', () => {
  it('100% coconut hits the usable floor and best is clamped >= usable', () => {
    const e = estimateCureModel(input({ fa: COCONUT }))!;
    expect(e.usable.minWeeks).toBe(2); // floor
    expect(e.usable.maxWeeks).toBeCloseTo(3, 5);
    expect(e.second.kind).toBe('best');
    expect(e.second.minWeeks).toBeGreaterThanOrEqual(e.usable.minWeeks);
  });
  it('castile: usable ≈7.5 wk, best ≈24.8 wk (spec anchor values)', () => {
    const e = estimateCureModel(input({ fa: OLIVE }))!;
    expect(e.usable.minWeeks).toBeCloseTo(7.52, 1);
    expect(e.usable.maxWeeks).toBeCloseTo(11.28, 1);
    expect(e.second.kind).toBe('best');
    expect(e.second.minWeeks).toBeCloseTo(24.8, 1);
  });
  it('more water (lower lye concentration) lengthens usable-from only', () => {
    const wet = estimateCureModel(input({ lyeConcentrationPercent: 25 }))!;
    const dry = estimateCureModel(input({ lyeConcentrationPercent: 40 }))!;
    expect(wet.usable.minWeeks).toBeGreaterThan(dry.usable.minWeeks);
    expect(wet.second.minWeeks).toBeCloseTo(dry.second.minWeeks, 5);
  });
});

describe('PUFA rules', () => {
  it('PUFA in (15, 25] gets a DOS caveat but keeps the best milestone', () => {
    const e = estimateCureModel(input({ fa: { oleic: 50, linoleic: 20 } }))!;
    expect(e.second.kind).toBe('best');
    expect(e.caveats.join(' ')).toMatch(/rancid|DOS/i);
  });
  it('PUFA > 25 flips the second milestone to use-within (point window)', () => {
    const e = estimateCureModel(input({ fa: SUNFLOWER }))!;
    expect(e.second.kind).toBe('useWithin');
    expect(e.second.minWeeks).toBe(e.second.maxWeeks);
    expect(e.second.minWeeks).toBeCloseTo(13, 5);
    expect(e.caveats.join(' ')).toMatch(/use.*within/i);
  });
});

describe('confidence and coverage', () => {
  it('is low-confidence at launch', () => {
    expect(estimateCureModel(input({}))!.confidence).toBe('low');
  });
  it('low FA coverage adds a caveat naming the coverage percent', () => {
    const e = estimateCureModel(input({ faCoverage: 60 }))!;
    expect(e.caveats.join(' ')).toContain('60%');
  });
  // The caveat compared the raw figure against 80 and printed it rounded, so at 79.5–79.9 it said
  // "covers only 80%" while every panel printed "based on 80%" and treated the readings as
  // sound. It now decides with isLowCoverage, as the panels and insights do.
  it('decides low coverage on the figure it prints, and names what the figure covers', () => {
    expect(estimateCureModel(input({ faCoverage: 79.5 }))!.caveats.join(' ')).not.toMatch(/covers only/);
    expect(estimateCureModel(input({ faCoverage: 79.4 }))!.caveats).toContain(
      'Fatty-acid data covers only 79% of recipe oil weight — the cure drivers are partly estimated.',
    );
  });
  it('full coverage adds no coverage caveat', () => {
    const e = estimateCureModel(input({ faCoverage: 100 }))!;
    expect(e.caveats.join(' ')).not.toMatch(/covers only/);
  });
});

// Cure's 15/25 are ABSOLUTE percentages of the recipe, but `fa` is renormalized over the oils
// that have data — so an unprofiled oil inflated every reading by 1 ÷ covered share and cure
// warned on PUFA the recipe does not contain. Measured across 53,100 cases: 16.3% false alarms.
// The bound (missing oils contribute zero) cannot overstate, so it cannot over-warn.
describe('rancidity thresholds judge a lower bound, not the renormalized reading', () => {
  const base = { lyeConcentrationPercent: 33, process: 'cp' as const, faCoverage: 100 };
  // 28% renormalized PUFA is over the flip; at a 0.5 covered share the recipe is certainly
  // only 14% — under the caveat threshold too.
  const fa = { linoleic: 24, linolenic: 4, oleic: 40, palmitic: 20, stearic: 12 };

  it('does not flip to "use within" on PUFA the recipe cannot contain', () => {
    const r = estimateCureModel({ ...base, fa, faCoverage: 50, faCoveredWeightShare: 0.5 });
    expect(r?.second.kind).toBe('best');
    expect(r?.caveats.some((c) => c.includes('within the shown window'))).toBe(false);
  });

  it('still flips when the covered share supports it', () => {
    const r = estimateCureModel({ ...base, fa, faCoveredWeightShare: 1 });
    expect(r?.second.kind).toBe('useWithin');
  });

  it('drops the DOS caveat when the bound falls under 15 but keeps it when it does not', () => {
    // 28 × 0.5 = 14 -> silent; 28 × 0.8 = 22.4 -> caveat but no flip.
    expect(
      estimateCureModel({ ...base, fa, faCoverage: 50, faCoveredWeightShare: 0.5 })?.caveats.some((c) =>
        c.includes('rancid spots'),
      ),
    ).toBe(false);
    const eighty = estimateCureModel({ ...base, fa, faCoverage: 80, faCoveredWeightShare: 0.8 });
    expect(eighty?.caveats.some((c) => c.includes('rancid spots'))).toBe(true);
    expect(eighty?.second.kind).toBe('best');
  });

  // Decision D: the bound decides WHETHER to flip; the higher renormalized figure sizes the
  // window. Sizing from the bound would lengthen every window on partial data — the optimistic
  // direction on the one reading that is a safety claim.
  it('sizes the "use within" window from the renormalized reading, never the bound', () => {
    const hot = { linoleic: 50, linolenic: 10, oleic: 30, palmitic: 7, stearic: 3 };
    const full = estimateCureModel({ ...base, fa: hot, faCoveredWeightShare: 1 });
    const partial = estimateCureModel({ ...base, fa: hot, faCoverage: 90, faCoveredWeightShare: 0.9 });
    expect(full?.second.kind).toBe('useWithin');
    expect(partial?.second.kind).toBe('useWithin');
    // 60% PUFA either way once it flips: the window must not grow because data is thin.
    expect(partial?.second.minWeeks).toBe(full?.second.minWeeks);
  });

  it('treats a missing share as fully covered, so existing callers are unchanged', () => {
    const r = estimateCureModel({ ...base, fa });
    expect(r?.second.kind).toBe('useWithin');
  });
});
