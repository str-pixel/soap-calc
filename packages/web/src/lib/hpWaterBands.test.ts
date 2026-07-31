import { describe, expect, it } from 'vitest';
import { analyzeFormulation } from '@soap-calc/core';
import { processProfileById } from './process';

/**
 * Source-endorsed water points per HP variant (provenance on each row). The bands exist to
 * coach, so a point the source endorses must draw NO band message at all — this table is
 * the executable form of that contract, and the reason the per-variant bands replaced the
 * shared one (which mis-coached three of these points).
 */
const ENDORSED: Array<[('hp-lthp' | 'hp-hthp' | 'hp-fluid'), number[]]> = [
  // general discount 25-30 + high 32-40 + "full ... both LTHP and HTHP ... 36-38"
  ['hp-lthp', [25, 27, 30, 32, 36, 38, 40]],
  // + HTHP-context "average reduced water concentration ... 20-30%"
  ['hp-hthp', [20, 22, 25, 30, 32, 36, 38, 40]],
  // swirl compromise 29-31 + HTFHP 36-40, prefer 38
  ['hp-fluid', [29, 30, 31, 36, 38, 40]],
];

const run = (variant: 'hp-lthp' | 'hp-hthp' | 'hp-fluid', pct: number) =>
  analyzeFormulation({
    properties: null, fattyAcids: null, totalOilGrams: 1000, superfatPercent: 3,
    lyeConcentrationPercent: 30, waterLyeRatio: 2.5, lyeGrams: 140,
    waterGrams: pct * 10, process: 'hp',
    waterBand: processProfileById(variant).waterBand!,
  }).filter((i) => i.code.startsWith('water_band'));

describe('HP per-variant water bands honour the source', () => {
  it('no band message fires on any source-endorsed point', () => {
    for (const [variant, points] of ENDORSED) {
      for (const pct of points) {
        expect(run(variant, pct), `${variant}@${pct}%`).toEqual([]);
      }
    }
  });

  it('defect coverage holds: 42% trips the rivers warning on every variant', () => {
    for (const [variant] of ENDORSED) {
      expect(run(variant, 42).some((i) => i.code === 'water_band_rivers')).toBe(true);
    }
  });

  it('band boundaries survive float non-representability', () => {
    // 290/1000*100 = 28.999999999999996 — without the epsilon in waterBandBranch, a user
    // at exactly the fluid low bound was mis-coached as "very low water".
    expect(run('hp-fluid', 29)).toEqual([]);
  });
});
