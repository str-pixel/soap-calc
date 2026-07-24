import { describe, expect, it } from 'vitest';
import { estimateWorkability, WORKABILITY_TUNING, type WorkabilityInput } from './workability';
import {
  analyzeRealBatches,
  cpBatch,
  RETUNE_MIN_BATCHES,
  type RealBatch,
} from './workability-calibration';

/**
 * Field-anchor calibration suite: runs the REAL estimator against unmold windows
 * reported by published soapmaking sources. The assertion is deliberately weak —
 * the predicted range must OVERLAP the field window — because the field data is
 * anecdotal; the logged coverage table is the honest signal of calibration fit.
 *
 * ── CALIBRATION PROTOCOL (how to turn real batches into better constants) ──
 * 1. Make a batch; note: oils/% (→ hardness score from the app), lye concentration %,
 *    superfat %, gel handling (none/natural/forced), sodium lactate / salt dose.
 * 2. Record the hour the loaf releases cleanly from a silicone/wood mold.
 * 3. Add one line to REAL_BATCHES below, e.g.:
 *      cpBatch('70/30 olive-coconut', { hardnessScore: 33, lyeConcentrationPercent: 33,
 *              superfatPercent: 5, gelMode: 'natural' }, 40),
 *    (add `additives: [{ id: 'sodium-lactate', dosePercent: 3 }]` if used).
 * 4. Run `npm test --workspace @soap-calc/core -- workability-calibration`.
 *    The logged table shows predicted vs observed + direction for every batch.
 * 5. The suite FAILS on its own once ≥5 batches miss in one direction, printing the
 *    direction and a suggested global scale. Retune WORKABILITY_TUNING (bands first,
 *    then gel/lye multipliers) until both REAL_BATCHES and the FIELD_ANCHORS overlap
 *    again. Never tune to one batch — that's why the threshold is RETUNE_MIN_BATCHES.
 */

const cp = (over: Partial<WorkabilityInput>): WorkabilityInput => ({
  hardnessScore: 47,
  faCoverage: 100,
  lyeConcentrationPercent: 33,
  superfatPercent: 5,
  process: 'cp',
  gelMode: 'natural',
  additives: [],
  ...over,
});

type Anchor = {
  name: string;
  source: string;
  input: WorkabilityInput;
  /** Unmold window reported in the field, hours. */
  fieldHours: [number, number];
};

/** Published-source anchors (blog/tutorial anecdotes — coarse, but real-world). */
const FIELD_ANCHORS: Anchor[] = [
  {
    name: 'castile-natural',
    source: 'Soap Queen / RusticWise: 100% olive "several days to a week or longer, up to two weeks"',
    input: cp({ hardnessScore: 14 }),
    fieldHours: [72, 336],
  },
  {
    name: 'sixty-hard-next-day',
    source: 'Bramble Berry: "60% hard oils could be ready the next day" (score ≈44)',
    input: cp({ hardnessScore: 44 }),
    fieldHours: [18, 48],
  },
  {
    name: 'trinity-34-33-33',
    source: 'Bramble Berry formulating: "some unmold in 24 h or less; others need 3–4 days" (score ≈47)',
    input: cp({ hardnessScore: 47 }),
    fieldHours: [18, 96],
  },
  {
    name: 'cpop-forced-8h',
    source: 'Soap Queen gel phase: CPOP/forced-gel hard recipe unmolds "most often around 8 hours"',
    input: cp({
      gelMode: 'forced',
      lyeConcentrationPercent: 38,
      superfatPercent: 3,
      additives: [{ id: 'sodium-lactate', dosePercent: 3 }],
    }),
    fieldHours: [6, 10],
  },
  {
    name: 'coconut-laundry-0sf',
    source: 'Common report: 100% coconut 0% SF sets rock-hard same day (score clamps to 60)',
    input: cp({ hardnessScore: 79, superfatPercent: 0 }),
    fieldHours: [4, 24],
  },
];

const overlap = (a: [number, number], b: [number, number]): number =>
  Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

/** Real batches recorded by the maker — the data that actually validates the model.
 * EMPTY BY DESIGN: never fabricate rows. Add measured batches via cpBatch() (see the
 * protocol above). This is the only place real calibration data lives. */
const REAL_BATCHES: RealBatch[] = [];

describe('workability field-anchor calibration', () => {
  it('every published anchor overlaps the predicted unmold range (logged table = fit quality)', () => {
    const rows = FIELD_ANCHORS.map((a) => {
      const e = estimateWorkability(a.input);
      expect(e, a.name).not.toBeNull();
      const pred: [number, number] = [e!.unmold.minHours, e!.unmold.maxHours];
      const cover = overlap(pred, a.fieldHours) / (a.fieldHours[1] - a.fieldHours[0]);
      expect(overlap(pred, a.fieldHours), `${a.name}: predicted ${pred} vs field ${a.fieldHours}`).toBeGreaterThan(0);
      return {
        anchor: a.name,
        predicted: `${pred[0].toFixed(1)}–${pred[1].toFixed(1)} h`,
        field: `${a.fieldHours[0]}–${a.fieldHours[1]} h`,
        'field coverage': `${Math.round(cover * 100)}%`,
      };
    });
    console.table(rows);
  });

  it('sodium lactate at max dose saves ≥1 day on a castile (field: "unmolds 1–2 days earlier")', () => {
    const plain = estimateWorkability(cp({ hardnessScore: 14 }))!;
    const withSl = estimateWorkability(
      cp({ hardnessScore: 14, additives: [{ id: 'sodium-lactate', dosePercent: 3 }] }),
    )!;
    const savedAtSlowEdge = plain.unmold.maxHours - withSl.unmold.maxHours;
    expect(savedAtSlowEdge).toBeGreaterThanOrEqual(24);
  });

  it('the slow extreme reaches the display ceiling (renders "2+ weeks", never a false precise day)', () => {
    const e = estimateWorkability(
      cp({ hardnessScore: 14, gelMode: 'none', lyeConcentrationPercent: 28, superfatPercent: 8 }),
    )!;
    expect(e.unmold.maxHours).toBeGreaterThanOrEqual(WORKABILITY_TUNING.ceilingHours);
  });

  // The live gate: logs predicted-vs-observed for every recorded batch and FAILS once the
  // model misses ≥RETUNE_MIN_BATCHES times in one direction. Passes trivially while empty.
  it('recorded real batches do not signal a consistent-direction retune', () => {
    const report = analyzeRealBatches(REAL_BATCHES);
    if (report.n > 0) {
      console.table(
        report.results.map((r) => ({
          batch: r.name,
          observed: `${r.observedHours}h`,
          predicted: r.predicted ? `${r.predicted[0].toFixed(0)}–${r.predicted[1].toFixed(0)}h` : '—',
          direction: r.direction,
        })),
      );
    }
    expect(
      report.retune,
      report.retune
        ? `Model runs consistently ${report.retune.direction} (${report.misses}/${report.n} batches miss). ` +
            `Suggested starting scale for band hours: ×${report.retune.suggestedScale.toFixed(2)}. Retune WORKABILITY_TUNING.`
        : undefined,
    ).toBeNull();
  });
});

describe('analyzeRealBatches (retune-signal logic)', () => {
  // Synthetic fixtures — these test the ANALYZER, they are NOT calibration data.
  const natural = { hardnessScore: 47, lyeConcentrationPercent: 33, superfatPercent: 5, gelMode: 'natural' as const };
  // score 47 natural → predicted unmold [12, 36]h (midpoint 24).
  const nBatches = (n: number, observed: number): RealBatch[] =>
    Array.from({ length: n }, (_, i) => cpBatch(`b${i}`, natural, observed));

  it('empty input → no batches, no retune', () => {
    expect(analyzeRealBatches([])).toMatchObject({ n: 0, hits: 0, misses: 0, retune: null });
  });

  it('all observations inside the predicted range → hits, no retune', () => {
    const r = analyzeRealBatches(nBatches(6, 24));
    expect(r.hits).toBe(6);
    expect(r.misses).toBe(0);
    expect(r.retune).toBeNull();
    expect(r.results[0].direction).toBe('ok');
  });

  it('≥5 batches releasing LATER than predicted → "fast" retune with scale >1', () => {
    const r = analyzeRealBatches(nBatches(5, 60)); // 60h > 36h max → model too fast
    expect(r.misses).toBe(5);
    expect(r.retune?.direction).toBe('fast');
    expect(r.retune!.suggestedScale).toBeCloseTo(60 / 24, 5); // observed / midpoint
  });

  it('≥5 batches releasing EARLIER than predicted → "slow" retune', () => {
    const r = analyzeRealBatches(nBatches(5, 6)); // 6h < 12h min → model too slow
    expect(r.retune?.direction).toBe('slow');
    expect(r.retune!.suggestedScale).toBeLessThan(1);
  });

  it('4 consistent misses is below threshold → no retune yet (never tune to a handful)', () => {
    expect(analyzeRealBatches(nBatches(4, 60)).retune).toBeNull();
    expect(RETUNE_MIN_BATCHES).toBe(5);
  });

  it('misses split across both directions do not trigger a retune', () => {
    const mixed = [...nBatches(3, 60), ...nBatches(3, 6)]; // 3 fast + 3 slow, neither ≥5
    expect(analyzeRealBatches(mixed).retune).toBeNull();
  });
});
