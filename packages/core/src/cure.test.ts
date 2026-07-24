import { describe, expect, it } from 'vitest';
import { estimateCureModel, CURE_TUNING, type CureModelInput } from './cure';

const OLIVE = { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 };
const COCONUT = { oleic: 8, lauric: 48, stearic: 3, linoleic: 2, myristic: 19, palmitic: 9 };
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
  it('full coverage adds no coverage caveat', () => {
    const e = estimateCureModel(input({ faCoverage: 100 }))!;
    expect(e.caveats.join(' ')).not.toMatch(/covers only/);
  });
});
