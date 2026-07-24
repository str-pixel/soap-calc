import { describe, expect, it } from 'vitest';
import { estimateCureModel, type CureModelInput } from './cure';
import type { FattyAcidProfile } from './properties.js';

/**
 * Anchor calibration suite: runs the REAL estimator against cure windows drawn from
 * community consensus (de-branded). The assertion is deliberately weak — the predicted
 * usable window must OVERLAP the field window — because field data is anecdotal.
 *
 * ── CALIBRATION PROTOCOL (usable-from is home-measurable) ──
 * 1. Make a batch; note oils/%, lye concentration %, process.
 * 2. Weigh one bar every few days; record the week its weight plateaus (<1% change/week)
 *    AND it lathers/feels ready — that's the observed usable week.
 * 3. Add a row to REAL_BATCHES below.
 * 4. Run `npm test --workspace @soap-calc/core -- cure-calibration`.
 * 5. When ≥5 real batches disagree in a consistent direction, retune CURE_TUNING
 *    (usableKnees first, then lyeConc/fastCredit) until REAL_BATCHES and the anchors
 *    below still overlap. Never tune to one batch. The at-its-best side has no home
 *    measurement — retune bestKnees only from usable-side evidence ratios.
 */

// Canonical FA breakdowns (packages/oils-data/data/canonical-oils.json — the data the live app consumes).
const OILS = {
  coconut76: { lauric: 47.6, myristic: 18.3, palmitic: 8.6, caprylic: 7.1, capric: 6.3, stearic: 2.9, oleic: 7.3, linoleic: 1.7, linolenic: 0.1, arachidic: 0.1, eicosenoic: 0.1 },
  olive: { oleic: 69, stearic: 3, linoleic: 12, palmitic: 14, linolenic: 1 },
  palm: { oleic: 39, stearic: 5, linoleic: 10, myristic: 1, palmitic: 44 },
  lard: { oleic: 46, stearic: 13, linoleic: 6, myristic: 1, palmitic: 28 },
  tallow: { oleic: 36, lauric: 2, stearic: 22, linoleic: 3, myristic: 6, palmitic: 28, linolenic: 1 },
  sunflower: { oleic: 16, stearic: 4, linoleic: 70, palmitic: 7, linolenic: 1 },
  castor: { oleic: 4, linoleic: 4, ricinoleic: 90 },
} satisfies Record<string, FattyAcidProfile>;

function mix(parts: ReadonlyArray<readonly [FattyAcidProfile, number]>): FattyAcidProfile {
  const out: FattyAcidProfile = {};
  for (const [profile, pct] of parts) {
    for (const [acid, v] of Object.entries(profile)) {
      out[acid] = (out[acid] ?? 0) + (v * pct) / 100;
    }
  }
  return out;
}

const cp = (fa: FattyAcidProfile): CureModelInput => ({
  fa,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  process: 'cp',
});

type Anchor = {
  name: string;
  source: string;
  input: CureModelInput;
  /** Usable-from window per community consensus, weeks. */
  fieldWeeks: [number, number];
};

const ANCHORS: Anchor[] = [
  {
    name: '100% coconut',
    source: 'community consensus: usable ~2-3 weeks (hard + soluble early)',
    input: cp(OILS.coconut76),
    fieldWeeks: [2, 4],
  },
  {
    name: 'balanced trinity 40/30/30',
    source: 'community consensus: the standard 4-6 week cure',
    input: cp(mix([[OILS.olive, 40], [OILS.coconut76, 30], [OILS.palm, 30]])),
    fieldWeeks: [4, 6],
  },
  {
    name: 'castile (100% olive)',
    source: 'community consensus: usable ~6-12 weeks (and best after months)',
    input: cp(OILS.olive),
    fieldWeeks: [6, 12],
  },
  {
    name: 'bastile 70/20/10',
    source: 'community consensus: ~5-9 weeks',
    input: cp(mix([[OILS.olive, 70], [OILS.coconut76, 20], [OILS.castor, 10]])),
    fieldWeeks: [5, 9],
  },
  {
    name: '100% lard',
    source: 'community consensus: 4-6 weeks',
    input: cp(OILS.lard),
    fieldWeeks: [4, 7],
  },
  {
    name: '100% tallow',
    source: 'community consensus: 4-6 weeks',
    input: cp(OILS.tallow),
    fieldWeeks: [3.5, 6],
  },
];

const overlap = (a: [number, number], b: [number, number]): number =>
  Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

/** Real batches recorded by the maker — the data that actually validates the model.
 * Same inputs plus the observed usable week. Empty until batches are logged. */
const REAL_BATCHES: Array<Anchor & { observedUsableWeeks: number }> = [];

describe('cure anchors (predicted usable window overlaps the field window)', () => {
  for (const a of ANCHORS) {
    it(a.name, () => {
      const e = estimateCureModel(a.input);
      expect(e).not.toBeNull();
      const predicted: [number, number] = [e!.usable.minWeeks, e!.usable.maxWeeks];
      expect(overlap(predicted, a.fieldWeeks), `${a.name}: predicted ${predicted} vs field ${a.fieldWeeks} (${a.source})`).toBeGreaterThan(0);
    });
  }

  it('castile: at-its-best window overlaps the months-scale consensus [24, 52] weeks', () => {
    const e = estimateCureModel(cp(OILS.olive))!;
    expect(e.second.kind).toBe('best');
    expect(overlap([e.second.minWeeks, e.second.maxWeeks], [24, 52])).toBeGreaterThan(0);
  });

  it('100% sunflower flips to use-within (high-PUFA shelf rule)', () => {
    const e = estimateCureModel(cp(OILS.sunflower))!;
    expect(e.second.kind).toBe('useWithin');
  });
});

describe('real batches (empty until logged — see protocol above)', () => {
  // House pattern (workability-calibration.test.ts): one `it` looping inside — vacuously
  // green while REAL_BATCHES is empty, a real inside-the-window assertion once rows exist.
  it('recorded real batches (if any) fall inside the predicted usable window', () => {
    for (const b of REAL_BATCHES) {
      const e = estimateCureModel(b.input)!;
      expect(
        b.observedUsableWeeks >= e.usable.minWeeks && b.observedUsableWeeks <= e.usable.maxWeeks,
        `${b.name}: observed ${b.observedUsableWeeks}wk vs predicted ${e.usable.minWeeks}–${e.usable.maxWeeks}wk`,
      ).toBe(true);
    }
  });
});
