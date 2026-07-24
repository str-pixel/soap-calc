import { estimateWorkability, type WorkabilityInput } from './workability.js';

/**
 * Real-batch calibration tooling. This is the honest closing hook for the workability
 * model's #1 risk (constants derived from anecdote, never checked against a real bar):
 * record actual batches, and `analyzeRealBatches` reports where the model is wrong and,
 * once enough batches miss in one direction, raises a retune signal with a starting scale.
 *
 * It fabricates nothing — `REAL_BATCHES` in the calibration test stays empty until a maker
 * enters measured unmold hours. This file only turns those measurements into a verdict.
 */

/** Consecutive one-directional misses required before the tool asserts a retune is due. */
export const RETUNE_MIN_BATCHES = 5;

export interface RealBatch {
  name: string;
  input: WorkabilityInput;
  /** The hour the loaf actually released cleanly from a silicone/wood mold. */
  observedUnmoldHours: number;
}

/**
 * Build a CP batch record from the levers a maker reads off the app plus the observed hour.
 * `hardnessScore` is the app's Hardness figure for the recipe; the rest mirror the inputs.
 */
export function cpBatch(
  name: string,
  levers: {
    hardnessScore: number;
    lyeConcentrationPercent: number;
    superfatPercent: number;
    gelMode: WorkabilityInput['gelMode'];
    faCoverage?: number;
    additives?: WorkabilityInput['additives'];
  },
  observedUnmoldHours: number,
): RealBatch {
  return {
    name,
    observedUnmoldHours,
    input: {
      process: 'cp',
      faCoverage: levers.faCoverage ?? 100,
      additives: levers.additives ?? [],
      hardnessScore: levers.hardnessScore,
      lyeConcentrationPercent: levers.lyeConcentrationPercent,
      superfatPercent: levers.superfatPercent,
      gelMode: levers.gelMode,
    },
  };
}

/** 'fast' = model predicted sooner than reality (observed above the range → bands too short);
 *  'slow' = model predicted later than reality; 'ok' = observed inside the predicted range. */
export type BatchDirection = 'fast' | 'slow' | 'ok';

export interface BatchResult {
  name: string;
  observedHours: number;
  predicted: [number, number] | null;
  hit: boolean;
  direction: BatchDirection;
  /** observed / predicted-midpoint; >1 means reality is slower than the model's centre. */
  ratio: number | null;
}

export interface CalibrationReport {
  results: BatchResult[];
  n: number;
  hits: number;
  misses: number;
  /** Set only when ≥ RETUNE_MIN_BATCHES batches miss in the SAME direction. `suggestedScale`
   *  is the median observed/midpoint over those batches — a blunt global starting multiplier
   *  for the band hours, NOT a per-band answer. */
  retune: { direction: 'fast' | 'slow'; suggestedScale: number } | null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function analyzeRealBatches(batches: readonly RealBatch[]): CalibrationReport {
  const results: BatchResult[] = batches.map((b) => {
    const e = estimateWorkability(b.input);
    if (!e) {
      return { name: b.name, observedHours: b.observedUnmoldHours, predicted: null, hit: false, direction: 'ok', ratio: null };
    }
    const min = e.unmold.minHours;
    const max = e.unmold.maxHours;
    const hit = b.observedUnmoldHours >= min && b.observedUnmoldHours <= max;
    const direction: BatchDirection = hit ? 'ok' : b.observedUnmoldHours > max ? 'fast' : 'slow';
    return {
      name: b.name,
      observedHours: b.observedUnmoldHours,
      predicted: [min, max],
      hit,
      direction,
      ratio: b.observedUnmoldHours / ((min + max) / 2),
    };
  });

  const misses = results.filter((r) => !r.hit);
  const fast = misses.filter((m) => m.direction === 'fast');
  const slow = misses.filter((m) => m.direction === 'slow');
  const dominant = fast.length >= slow.length ? fast : slow;

  let retune: CalibrationReport['retune'] = null;
  if (dominant.length >= RETUNE_MIN_BATCHES) {
    const ratios = dominant.map((m) => m.ratio).filter((x): x is number => x !== null);
    retune = {
      direction: fast.length >= slow.length ? 'fast' : 'slow',
      suggestedScale: median(ratios),
    };
  }

  return { results, n: results.length, hits: results.length - misses.length, misses: misses.length, retune };
}
