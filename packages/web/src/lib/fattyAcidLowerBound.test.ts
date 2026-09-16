import { describe, expect, it } from 'vitest';
import { calculateRecipeFattyAcids, estimateCureModel } from '@soap-calc/core';
import { OILS, PROPERTIES_LOOKUP } from './oils';

/**
 * The accuracy of the rancidity reading, measured over the catalog rather than asserted.
 *
 * WHY THIS IS A TEST AND NOT A NOTE IN THE SPEC. The before/after figures were first produced by
 * throwaway harnesses, and two of them were wrong in ways only a rerun could catch: one compared
 * the two systems over DIFFERENT case sets (the fix moves 7 ingredients from "missing" to
 * "ready", so measuring each system over its own population is not a comparison), and one derived
 * "truth" from a superseded profile, inventing 50 false alarms that did not exist. Both readings
 * are computed here from ONE case set, in one pass, so neither mistake can recur.
 */

/**
 * Published linoleic + linolenic for each ingredient the app has no profile for, as
 * (low, typical, high). These bound what the missing weight can actually carry, which is what
 * makes "false alarm" and "miss" decidable at all. The waxes and tars carry no polyunsaturates
 * in any published analysis; abyssinian and commercial oleic acid are the only two with
 * meaningful PUFA, which is why they dominate the misses below.
 */
const PUBLISHED_PUFA: Record<string, readonly [number, number, number]> = {
  'abyssinian-oil': [9, 13, 20],
  'oleic-acid': [3.5, 10, 22],
  'japan-wax': [0, 1, 10],
  'jojoba-oil': [0, 0, 3],
  'lanolin-liquid-wax': [0, 0, 2.1],
  'soybean-fully-hydrogenated': [0, 0.3, 1.2],
  'stearic-acid': [0, 0.5, 2.2],
  'lauric-acid': [0, 0.3, 1.66],
  'palmitic-acid': [0, 0.2, 1.1],
  'myristic-acid': [0, 0.1, 0.55],
  beeswax: [0, 0, 0],
  'candelilla-wax': [0, 0, 0],
  'carnauba-wax': [0, 0, 0],
  'pine-tar': [0, 0, 0],
  'birch-tar': [0, 0, 0],
};

const RATIOS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70] as const;
/** What cure actually shows: 0 quiet, 1 DOS caveat, 2 "use within". Read off the real estimate
 *  rather than recomputed from the thresholds, so this sweep guards the shipped code path — a
 *  version that recomputed 15/25 here would keep passing if cure stopped applying the share. */
const severityOf = (est: ReturnType<typeof estimateCureModel>): 0 | 1 | 2 =>
  est?.second.kind === 'useWithin' ? 2
    : est?.caveats.some((c) => c.includes('rancid spots')) ? 1
      : 0;
/** Truth needs no code path: it is what the recipe contains, judged at cure's own thresholds. */
const severity = (pufa: number): 0 | 1 | 2 => (pufa > 25 ? 2 : pufa > 15 ? 1 : 0);
const CURE_BASE = { lyeConcentrationPercent: 33, process: 'cp' as const };

type Case = {
  /** Severity the OLD reading gave: the renormalized profile, judged directly. */
  before: 0 | 1 | 2;
  /** Severity the shipped reading gives: the same profile times the covered-weight share. */
  after: 0 | 1 | 2;
  truth: 0 | 1 | 2;
  truthPufa: number;
  boundPufa: number;
  missingId: string;
};

/**
 * The seven ingredients the SAP-led category fix moved from "no data" to "has data". They matter
 * to this file because they CHANGE THE POPULATION: sweeping the catalog before and after the fix
 * measures two different sets of recipes, and comparing those two numbers is meaningless. Both
 * populations are swept below, each with both readings, so every quoted figure is like-for-like.
 */
const RECLASSIFIED = [
  'japan-wax', 'soybean-fully-hydrogenated', 'stearic-acid',
  'lauric-acid', 'oleic-acid', 'palmitic-acid', 'myristic-acid',
  // Abyssinian came back too, but by a different route: SAP reclassified it as the triglyceride
  // it is, and a cited PROFILE_BACKFILL then replaced the 38%-complete legacy row that had kept
  // it out. It was the single largest source of misses before that.
  'abyssinian-oil',
] as const;

/** The catalog as it was before the category fix: the seven put back out of reach. */
const PRE_CHANGE_LOOKUP = Object.fromEntries(
  Object.entries(PROPERTIES_LOOKUP).map(([id, oil]) => [
    id,
    (RECLASSIFIED as readonly string[]).includes(id) ? { ...oil, propertiesAvailable: false } : oil,
  ]),
);

function sweep(lookup: typeof PROPERTIES_LOOKUP = PROPERTIES_LOOKUP): Case[] {
  const ready = OILS.filter((o) => lookup[o.id]?.propertiesAvailable && o.fattyAcids);
  const unprofiled = OILS.filter((o) => !lookup[o.id]?.propertiesAvailable);
  const cases: Case[] = [];
  for (const tri of ready) {
    for (const nd of unprofiled) {
      const published = PUBLISHED_PUFA[nd.id];
      if (!published) continue;
      for (const r of RATIOS) {
        const lines = [
          { oilId: tri.id, weightGrams: 100 - r },
          { oilId: nd.id, weightGrams: r },
        ];
        const fa = calculateRecipeFattyAcids(lines, lookup);
        if (!fa.profile) continue;
        const renormalized = (fa.profile.linoleic ?? 0) + (fa.profile.linolenic ?? 0);
        const boundPufa = renormalized * fa.coveredWeightShare;
        // BEFORE = the shipped model with no share passed; for the two readings this sweep
        // scores — the "use within" flip and the DOS caveat — that is exactly what it did before
        // this change. AFTER = the same model with the share. One code path, two inputs.
        const before = severityOf(
          estimateCureModel({ ...CURE_BASE, fa: fa.profile, faCoverage: fa.coveragePercent }),
        );
        const after = severityOf(
          estimateCureModel({
            ...CURE_BASE, fa: fa.profile, faCoverage: fa.coveragePercent,
            faCoveredWeightShare: fa.coveredWeightShare,
          }),
        );
        // The truth uses the CURRENT profile of the charted oil — the same numbers the system
        // reads. Taking it from anywhere else measures the difference between two catalogs
        // rather than between two readings.
        const triPufa =
          (lookup[tri.id]?.fattyAcids?.linoleic ?? 0) +
          (lookup[tri.id]?.fattyAcids?.linolenic ?? 0);
        for (const carried of published) {
          const truthPufa = (triPufa * (100 - r) + carried * r) / 100;
          cases.push({
            before,
            after,
            truth: severity(truthPufa),
            truthPufa,
            boundPufa,
            missingId: nd.id,
          });
        }
      }
    }
  }
  return cases;
}

const CASES = sweep();
const PRE_CHANGE_CASES = sweep(PRE_CHANGE_LOOKUP);

const rate = (cases: Case[], pick: (c: Case) => number, cmp: 'eq' | 'over' | 'under') => {
  const n = cases.filter((c) =>
    cmp === 'eq' ? pick(c) === c.truth : cmp === 'over' ? pick(c) > c.truth : pick(c) < c.truth,
  ).length;
  return (100 * n) / cases.length;
};
const near = (actual: number, expected: number) => Math.abs(actual - expected) < 0.35;

describe('the rancidity reading, measured over the catalog', () => {
  it('sweeps a case set big enough to be worth quoting', () => {
    expect(CASES.length).toBeGreaterThan(20_000);
  });

  // THE invariant, and the reason the reading is safe. It is structural, not statistical:
  // bound = Σ(covered pct × weight) / total weight, and truth adds only non-negative terms for
  // the unprofiled weight, so truth ≥ bound for ANY composition of the missing oils. A false
  // alarm is therefore impossible by construction rather than rare in a sample. This test spot-
  // checks that guarantee at each ingredient's published low/typical/high, which is evidence
  // for it and not a proof of it — the proof is the line of algebra above.
  it('never exceeds the true whole-recipe PUFA, whatever the unprofiled oils turn out to carry', () => {
    const over = CASES.filter((c) => c.boundPufa > c.truthPufa + 1e-9);
    expect(over).toEqual([]);
  });

  it('raises no false alarm anywhere, where the old reading raised thousands', () => {
    expect(CASES.filter((c) => c.after > c.truth).length).toBe(0);
    // Same cases, same pass — the comparison, not a number carried in from another population.
    expect(rate(CASES, (c) => c.before, 'over')).toBeGreaterThan(10);
  });

  it('is right more often than the reading it replaced', () => {
    const exact = (pick: (c: Case) => number) => CASES.filter((c) => pick(c) === c.truth).length;
    expect(exact((c) => c.after)).toBeGreaterThan(exact((c) => c.before));
  });

  // The bound's only cost is silence where a warning was warranted, and that cost is now tiny:
  // every ingredient still lacking a profile is a true wax, wax ester or tar, none of which
  // carries more than trace polyunsaturates in any published analysis. What remains cannot be
  // fixed with data — it is the price of refusing to count unmeasured weight as PUFA.
  it('misses only where an unprofiled ingredient carries trace PUFA, and rarely', () => {
    const misses = CASES.filter((c) => c.after < c.truth);
    const sources = new Set(misses.map((m) => m.missingId));
    // Nothing with real polyunsaturates is unprofiled any more: what is left are the waxes whose
    // published high-end figures are 2–3%.
    for (const id of sources) {
      const high = PUBLISHED_PUFA[id][2];
      expect(high, `${id} should not be a miss source unless it carries some PUFA`).toBeGreaterThan(0);
      expect(high, `${id} carries more than trace PUFA — it deserves a profile, not a miss`).toBeLessThan(5);
    }
    // A miss is a warning we cannot prove is warranted, so it is the safe failure; it must still
    // stay a small minority of the sweep.
    expect(misses.length / CASES.length).toBeLessThan(0.01);
  });
});

/**
 * The headline before/after figures, pinned so they can be quoted without being re-derived.
 *
 * This sweep uses the PRE-CHANGE population — the 15 ingredients that had no profile before the
 * category fix — so both readings answer for the same recipes. Sweeping the shipped catalog
 * instead gives a smaller, differently-shaped population (8 unprofiled ingredients) on which the
 * old reading raises 4,673 false alarms rather than 8,667: a perfectly good number about a
 * different question. Quoting one against the other is the mistake this file exists to stop.
 */
describe('before and after, over one identical case set', () => {
  it('sweeps the pre-change population', () => {
    expect(PRE_CHANGE_CASES.length).toBe(53_100);
  });

  it('reproduces the figures the design doc quotes', () => {
    expect(near(rate(PRE_CHANGE_CASES, (c) => c.before, 'eq'), 83.2)).toBe(true);
    expect(near(rate(PRE_CHANGE_CASES, (c) => c.before, 'over'), 16.3)).toBe(true);
    expect(near(rate(PRE_CHANGE_CASES, (c) => c.before, 'under'), 0.5)).toBe(true);

    expect(near(rate(PRE_CHANGE_CASES, (c) => c.after, 'eq'), 97.6)).toBe(true);
    expect(rate(PRE_CHANGE_CASES, (c) => c.after, 'over')).toBe(0);
    expect(near(rate(PRE_CHANGE_CASES, (c) => c.after, 'under'), 2.4)).toBe(true);
  });

  it('holds the invariant on this population too', () => {
    expect(PRE_CHANGE_CASES.filter((c) => c.boundPufa > c.truthPufa + 1e-9)).toEqual([]);
  });
});
