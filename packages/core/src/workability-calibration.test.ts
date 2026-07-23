import { describe, expect, it } from 'vitest';
import { estimateWorkability, WORKABILITY_TUNING, type WorkabilityInput } from './workability';

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
 * 3. Add a row to REAL_BATCHES below with those inputs and the observed hour.
 * 4. Run `npm test --workspace @soap-calc/core -- workability-calibration`.
 *    The logged table shows predicted vs observed for every batch.
 * 5. When ≥5 real batches disagree in a consistent direction, retune
 *    WORKABILITY_TUNING (bands first, then gel/lye multipliers) until both the
 *    REAL_BATCHES rows and the FIELD_ANCHORS still overlap. Never tune to one batch.
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
 * Shape: same inputs plus observedUnmoldHours. Empty until batches are logged. */
const REAL_BATCHES: Array<Anchor & { observedUnmoldHours: number }> = [];

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

  it('recorded real batches (if any) fall inside the predicted range', () => {
    for (const b of REAL_BATCHES) {
      const e = estimateWorkability(b.input)!;
      expect(
        b.observedUnmoldHours >= e.unmold.minHours && b.observedUnmoldHours <= e.unmold.maxHours,
        `${b.name}: observed ${b.observedUnmoldHours}h vs predicted ${e.unmold.minHours}–${e.unmold.maxHours}h`,
      ).toBe(true);
    }
  });
});
