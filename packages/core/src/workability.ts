export type GelMode = 'none' | 'natural' | 'forced';
export type WorkabilityConfidence = 'low' | 'moderate';

export interface WorkabilityRange {
  minHours: number;
  maxHours: number;
}

export interface WorkabilityEstimate {
  unmold: WorkabilityRange;
  cut: WorkabilityRange;
  stamp: { opensMinHours: number; opensMaxHours: number } | null;
  confidence: WorkabilityConfidence;
  factors: string[];
  caveats: string[];
}

export interface WorkabilityInput {
  hardnessScore: number;
  faCoverage: number;
  lyeConcentrationPercent: number;
  superfatPercent: number;
  process: 'cp' | 'hp' | 'ls';
  gelMode: GelMode;
  additives: ReadonlyArray<{ id: string; dosePercent: number }>;
}

/**
 * Transparent, tunable heuristic — workability timing has no verified constant. Every value
 * here is a deliberate, adjustable default (see the design doc's Model section). The pipeline
 * is one multiplicative composition; the copy that surfaces this is behavior-only.
 */
export const WORKABILITY_TUNING = {
  hardnessClamp: [0, 60] as const,
  // half-open, top-down: first row whose `min` the (clamped) hardness meets or exceeds.
  bands: [
    { min: 45, hours: [12, 36] as const },
    { min: 38, hours: [36, 72] as const },
    { min: 30, hours: [72, 120] as const },
    { min: 22, hours: [120, 192] as const },
    { min: 0, hours: [192, 336] as const },
  ],
  gel: { none: 1.3, natural: 1.0, forced: 0.55 } as Record<GelMode, number>,
  lyeConc: [[25, 1.3], [33, 1.0], [40, 0.78]] as ReadonlyArray<readonly [number, number]>,
  superfat: [[2, 0.9], [5, 1.0], [10, 1.2]] as ReadonlyArray<readonly [number, number]>,
  sodiumLactate: { doseClamp: [0, 3] as const, knees: [[0, 1.0], [3, 0.9]] as ReadonlyArray<readonly [number, number]> },
  salt: { doseClamp: [0, 1] as const, knees: [[0, 1.0], [1, 0.9]] as ReadonlyArray<readonly [number, number]> },
  floorHours: 4,
  minWidthFactor: 1.5,
  bufferHours: 4,
  stampSpread: 1.3,
  ceilingHours: 336,
  lowCoveragePercent: 80,
  hp: { unmold: [6, 18] as const },
};

const CP_CAVEATS = [
  'Mold type and room temperature move these as much as the recipe does — plastic molds and cool rooms run slower; a warm room runs faster.',
  'The gel setting assumes a loaf; small or individual molds often don’t gel on their own — treat those as None unless you insulate.',
  'Don’t wait to stamp — bars over-harden and then take faint, cracked impressions. Two schools: stamp fresh at cut, or wait a day for a firmer, cleaner deep impression.',
  'Test firmness on a loaf offcut before cutting or stamping the batch.',
  'Salt bars (salt at 25%+ of oils) are out of scope — they must be cut within ~1–2 h and break the 4 h floor.',
];
const CEILING_CAVEAT =
  'High-olive (castile) bars can exceed two weeks — a still-soft loaf at day 10 is normal, not a failed batch.';
const HP_CAVEAT =
  'Hot-process bars are unmoldable soon after the cook firms; their rustic surface takes stamps unevenly, so stamp timing varies.';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Piecewise-linear through sorted knees; flat outside the first/last knee. */
function piecewise(x: number, knees: ReadonlyArray<readonly [number, number]>): number {
  if (x <= knees[0][0]) return knees[0][1];
  const last = knees[knees.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < knees.length - 1; i++) {
    const [x0, y0] = knees[i];
    const [x1, y1] = knees[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

function sumDose(additives: WorkabilityInput['additives'], id: string): number {
  return additives.reduce(
    (sum, a) => (a.id === id && Number.isFinite(a.dosePercent) ? sum + a.dosePercent : sum),
    0,
  );
}

const GEL_LABEL: Record<GelMode, string> = { none: 'No', natural: 'Natural', forced: 'Forced' };
const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function estimateWorkability(input: WorkabilityInput): WorkabilityEstimate | null {
  const T = WORKABILITY_TUNING;

  if (input.process === 'ls') return null;
  for (const v of [input.hardnessScore, input.faCoverage, input.lyeConcentrationPercent, input.superfatPercent]) {
    if (!Number.isFinite(v)) return null;
  }
  if (input.process === 'hp') {
    const [lo, hi] = T.hp.unmold;
    return {
      unmold: { minHours: lo, maxHours: hi },
      cut: { minHours: lo, maxHours: hi },
      stamp: null,
      confidence: 'moderate',
      factors: ['Hot process — the cook sets the timing, not the oils'],
      caveats: [HP_CAVEAT],
    };
  }
  if (input.faCoverage <= 0) return null;

  const confidence: WorkabilityConfidence = input.faCoverage < T.lowCoveragePercent ? 'low' : 'moderate';

  const hardness = clamp(input.hardnessScore, T.hardnessClamp[0], T.hardnessClamp[1]);
  const band = T.bands.find((b) => hardness >= b.min) ?? T.bands[T.bands.length - 1];

  // Object.hasOwn, not `in`: `in` walks the prototype chain, so a garbage gelMode like
  // 'toString' would pass and turn the multiplier into a Function → NaN hours.
  const gelMode: GelMode = Object.hasOwn(T.gel, input.gelMode) ? input.gelMode : 'natural';
  const slDose = clamp(sumDose(input.additives, 'sodium-lactate'), T.sodiumLactate.doseClamp[0], T.sodiumLactate.doseClamp[1]);
  const saltDose = clamp(sumDose(input.additives, 'salt'), T.salt.doseClamp[0], T.salt.doseClamp[1]);

  const composite =
    T.gel[gelMode] *
    piecewise(input.lyeConcentrationPercent, T.lyeConc) *
    piecewise(input.superfatPercent, T.superfat) *
    piecewise(slDose, T.sodiumLactate.knees) *
    piecewise(saltDose, T.salt.knees);

  let uMin = Math.max(T.floorHours, band.hours[0] * composite);
  let uMax = Math.max(T.floorHours, band.hours[1] * composite);
  if (uMax < uMin * T.minWidthFactor) uMax = uMin * T.minWidthFactor;

  const unmold: WorkabilityRange = { minHours: uMin, maxHours: uMax };
  const cut: WorkabilityRange = { minHours: uMin + T.bufferHours, maxHours: uMax + T.bufferHours };
  const stamp = { opensMinHours: cut.maxHours, opensMaxHours: cut.maxHours * T.stampSpread };

  const caveats = [...CP_CAVEATS];
  if (unmold.maxHours >= T.ceilingHours) caveats.push(CEILING_CAVEAT);

  const factors = [
    // floor, not round: the bands are half-open (`hardness >= min`), so flooring keeps the
    // shown integer on the same side of every boundary as the band lookup — otherwise 44.6
    // would display "45" while computing the <45 band (a 3× range gap behind one number).
    // (The deeper fix — continuous interpolation, no bands, no seam — is deferred to the
    // real-batch calibration retune; see workability-calibration.test.ts.)
    `Hard-oil score ${Math.floor(hardness)}`,
    `${GEL_LABEL[gelMode]} gel`,
    `${Math.round(input.lyeConcentrationPercent)}% lye concentration`,
    `${fmtNum(input.superfatPercent)}% superfat`,
  ];
  if (slDose > 0) factors.push('sodium lactate');
  if (saltDose > 0) factors.push('salt');

  return { unmold, cut, stamp, confidence, factors, caveats };
}
