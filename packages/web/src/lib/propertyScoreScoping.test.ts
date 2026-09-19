import { describe, expect, it } from 'vitest';
import { calculateRecipeProperties, SOAP_PROPERTY_GUIDE, isJudgedProperty } from '@soap-calc/core';
import type { SoapPropertyName } from '@soap-calc/core';
import { OILS, PROPERTIES_LOOKUP } from './oils';

/**
 * Exactly which readings the coverage work moves, and which it must not.
 *
 * Two changes landed together and they act on different things, which is easy to state loosely
 * and get wrong:
 *
 *   - the LOWER BOUND moves no score at all. It exists only for absolute thresholds.
 *   - the CATEGORY FIX moves scores deliberately, for recipes containing the seven ingredients
 *     it recovered — that is the whole point of it.
 *
 * Collapsing the two into "nothing moves" or "scores changed" is wrong either way, so both halves
 * are pinned here.
 */

// Six since 2026-09-19: japan wax was the seventh until it was removed from the catalog.
const SEVEN = [
  'soybean-fully-hydrogenated', 'stearic-acid',
  'lauric-acid', 'oleic-acid', 'palmitic-acid', 'myristic-acid',
] as const;

/** The catalog before the category fix: the seven back out of reach. */
const PRE_CHANGE = Object.fromEntries(
  Object.entries(PROPERTIES_LOOKUP).map(([id, oil]) => [
    id,
    (SEVEN as readonly string[]).includes(id) ? { ...oil, propertiesAvailable: false } : oil,
  ]),
);

const judged = (Object.keys(SOAP_PROPERTY_GUIDE) as SoapPropertyName[]).filter(isJudgedProperty);
const verdict = (v: number, p: SoapPropertyName) => {
  const g = SOAP_PROPERTY_GUIDE[p];
  const r = Math.round(v);
  return r < g.low ? 'low' : r > g.high ? 'high' : 'in';
};

describe('the lower bound moves no score', () => {
  // The tempting "fix" is to divide the profile by total weight instead of covered weight, which
  // IS the bound — and it deflates every score by the unprofiled share. Measured when this was
  // evaluated: 22% of property readings changed verdict, 8,460 of them from "in range" to
  // "Too low", for bars that are genuinely fine. A recipe that is half beeswax is not half as
  // hard; we simply cannot break beeswax into acids. So the scores read the renormalized profile
  // and nothing else.
  it('scores a half-unprofiled recipe exactly as it scores the profiled part alone', () => {
    const alone = calculateRecipeProperties([{ oilId: 'grapeseed-oil', weightGrams: 500 }], PROPERTIES_LOOKUP);
    const halved = calculateRecipeProperties(
      [{ oilId: 'grapeseed-oil', weightGrams: 500 }, { oilId: 'beeswax', weightGrams: 500 }],
      PROPERTIES_LOOKUP,
    );
    expect(alone.properties).not.toBeNull();
    for (const p of judged) {
      expect(halved.properties![p]).toBeCloseTo(alone.properties![p], 10);
    }
    // Coverage still tells the user the data is thin — that is the caption's job, not the score's.
    expect(halved.coveragePercent).toBeLessThan(alone.coveragePercent);
    expect(halved.missingOilIds).toEqual(['beeswax']);
  });

  it('holds across the catalog, at every proportion of unprofiled weight', () => {
    const moved: string[] = [];
    for (const tri of OILS.filter((o) => o.propertiesAvailable && o.fattyAcids).slice(0, 40)) {
      const alone = calculateRecipeProperties([{ oilId: tri.id, weightGrams: 100 }], PROPERTIES_LOOKUP);
      for (const r of [10, 30, 50, 70, 90]) {
        const mixed = calculateRecipeProperties(
          [{ oilId: tri.id, weightGrams: 100 - r }, { oilId: 'beeswax', weightGrams: r }],
          PROPERTIES_LOOKUP,
        );
        for (const p of judged) {
          if (Math.abs(mixed.properties![p] - alone.properties![p]) > 1e-9) {
            moved.push(`${tri.id} @${r}% ${p}`);
          }
        }
      }
    }
    expect(moved).toEqual([]);
  });
});

describe('the category fix moves scores, on purpose', () => {
  // Stearic acid is 99% stearic and neutralizes to sodium stearate exactly as the stearic in a
  // triglyceride saponifies to it. Dropping it from the scores made every recipe containing it
  // read softer than it is.
  it('counts a recovered ingredient that used to be dropped', () => {
    const lines = [{ oilId: 'olive-oil', weightGrams: 800 }, { oilId: 'stearic-acid', weightGrams: 200 }];
    const before = calculateRecipeProperties(lines, PRE_CHANGE);
    const after = calculateRecipeProperties(lines, PROPERTIES_LOOKUP);
    expect(before.missingOilIds).toEqual(['stearic-acid']);
    expect(after.missingOilIds).toEqual([]);
    expect(after.properties!.hardness).toBeGreaterThan(before.properties!.hardness + 5);
    // and it is the weighted blend, not a fudge: 0.8 x olive + 0.2 x (99% stearic).
    const olive = calculateRecipeProperties([{ oilId: 'olive-oil', weightGrams: 800 }], PROPERTIES_LOOKUP);
    const stearic = calculateRecipeProperties([{ oilId: 'stearic-acid', weightGrams: 200 }], PROPERTIES_LOOKUP);
    expect(after.properties!.hardness).toBeCloseTo(
      0.8 * olive.properties!.hardness + 0.2 * stearic.properties!.hardness, 8,
    );
  });

  it('corrects a quarter of the property verdicts for recipes that contain the seven', () => {
    let readings = 0, corrected = 0;
    for (const tri of OILS.filter((o) => o.propertiesAvailable && o.fattyAcids)) {
      for (const id of SEVEN) {
        for (const r of [5, 10, 15, 20, 25, 30]) {
          const lines = [{ oilId: tri.id, weightGrams: 100 - r }, { oilId: id, weightGrams: r }];
          const a = calculateRecipeProperties(lines, PRE_CHANGE).properties;
          const b = calculateRecipeProperties(lines, PROPERTIES_LOOKUP).properties;
          if (!a || !b) continue;
          for (const p of judged) {
            readings++;
            if (verdict(a[p], p) !== verdict(b[p], p)) corrected++;
          }
        }
      }
    }
    // Measured 2026-09-16: 6,845 of 24,780 = 27.6%. Pinned loosely so a catalog edit does not
    // fail the build, tightly enough that "the category fix changes little" could not survive.
    expect(readings).toBeGreaterThan(20_000);
    expect(corrected / readings).toBeGreaterThan(0.2);
    expect(corrected / readings).toBeLessThan(0.35);
  });

  it('leaves recipes without those ingredients completely alone', () => {
    const lines = [{ oilId: 'olive-oil', weightGrams: 600 }, { oilId: 'coconut-oil-76', weightGrams: 400 }];
    const before = calculateRecipeProperties(lines, PRE_CHANGE).properties!;
    const after = calculateRecipeProperties(lines, PROPERTIES_LOOKUP).properties!;
    for (const p of judged) expect(after[p]).toBeCloseTo(before[p], 10);
  });
});
