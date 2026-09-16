import { formatCoveragePercent, isLowCoverage, type FattyAcidProfile } from './properties.js';
import { piecewise } from './workability.js';

export type CureMilestoneKind = 'best' | 'useWithin';
export type CureConfidence = 'low' | 'moderate';

export interface CureWeeksRange {
  minWeeks: number;
  maxWeeks: number;
}

export interface CureModelEstimate {
  /** Water-evaporation + early-hardness milestone — okay to start using the bar. */
  usable: CureWeeksRange;
  /** Maturation milestone: 'best' = keeps improving until here; 'useWithin' = high-PUFA
   * shelf window (DOS arrives before further cure gains — see spec). */
  second: CureWeeksRange & { kind: CureMilestoneKind };
  confidence: CureConfidence;
  factors: string[];
  caveats: string[];
}

export interface CureModelInput {
  fa: FattyAcidProfile;
  faCoverage: number;
  /**
   * Covered oil weight ÷ total oil weight (core `calculateRecipeFattyAcids`). `fa` is
   * renormalized over the oils that HAVE data, so every percentage in it is inflated by
   * 1 ÷ this when an oil is unprofiled. The 15/25 rancidity thresholds are absolute, so they
   * judge `pufa × share` — a lower bound, since unprofiled oils contribute at least zero.
   * Omitted means fully covered (1).
   */
  faCoveredWeightShare?: number;
  lyeConcentrationPercent: number;
  process: 'cp' | 'hp' | 'ls';
}

/**
 * Transparent, tunable heuristic — cure timing has no verified constant. Every value is a
 * deliberate, adjustable default (see the design doc's Model section). Knees were set so the
 * archetype anchors in cure-calibration.test.ts land on community-consensus windows.
 */
export const CURE_TUNING = {
  // PUFA counts toward the slow driver, discounted.
  linoleicWeight: 0.6,
  // slow driver -> usable-from min weeks.
  usableKnees: [[10, 2], [35, 3.8], [55, 5], [70, 6.5], [80, 8]] as ReadonlyArray<readonly [number, number]>,
  // lauric+myristic shortens usable-from (multiplier).
  fastCredit: [[0, 1.0], [30, 0.9], [55, 0.8]] as ReadonlyArray<readonly [number, number]>,
  // lye concentration % -> water factor. Applies to usable-from ONLY: evaporation is
  // water-driven; maturation isn't.
  lyeConc: [[25, 1.25], [33, 1.0], [40, 0.85]] as ReadonlyArray<readonly [number, number]>,
  usableFloorWeeks: 2,
  usableSpread: 1.5, // maxWeeks = minWeeks * spread
  // slow driver -> at-its-best min weeks.
  bestKnees: [[10, 4], [50, 8], [65, 13], [78, 26], [88, 40]] as ReadonlyArray<readonly [number, number]>,
  bestSpread: 1.6,
  // PUFA thresholds: caveat, then flip the second milestone to a use-within shelf window.
  pufaCaveatPercent: 15,
  pufaFlipPercent: 25,
  shelfKnees: [[25, 52], [40, 26], [70, 13]] as ReadonlyArray<readonly [number, number]>,
};

// TOP RETUNE CANDIDATE: ricinoleic at full weight in the slow driver. Directionally right
// (castor soap is hygroscopic and rubbery-soft early) but the magnitude is a guess — revisit
// first when calibration batches disagree (see cure-calibration.test.ts protocol).

const DOS_CAVEAT =
  'High linoleic + linolenic content makes bars prone to rancid spots (DOS) — store cured bars cool, dark, and airy.';
const FLIP_CAVEAT =
  'Very high polyunsaturated content: rancidity tends to arrive before long-cure benefits — use these bars within the shown window instead of aging them longer.';

export function estimateCureModel(input: CureModelInput): CureModelEstimate | null {
  const T = CURE_TUNING;
  if (input.process === 'ls') return null;
  if (!Number.isFinite(input.lyeConcentrationPercent) || !Number.isFinite(input.faCoverage)) {
    return null;
  }
  // A present-but-non-finite FA value means corrupted input — fall back to the fixed
  // window (spec: non-finite FA inputs → null); missing keys are legitimately 0.
  if (!Object.values(input.fa).every((v) => Number.isFinite(v))) return null;
  if (input.faCoverage <= 0) return null;

  const fa = (k: string): number => input.fa[k] ?? 0;
  const fast = fa('lauric') + fa('myristic');
  const pufa = fa('linoleic') + fa('linolenic');
  const slow = fa('oleic') + fa('ricinoleic') + T.linoleicWeight * pufa;
  // The timeline drivers (slow/fast) stay on the renormalized reading: they are continuous
  // estimates of how this soap ages, and an unprofiled oil is better approximated by the
  // average of the oils we do know than by zero. Only the rancidity THRESHOLDS below are
  // absolute claims about how much PUFA is present, so only they take the bound.
  const share = input.faCoveredWeightShare ?? 1;
  const pufaAtLeast = pufa * (Number.isFinite(share) ? Math.max(0, Math.min(1, share)) : 1);

  const usableMin = Math.max(
    T.usableFloorWeeks,
    piecewise(slow, T.usableKnees) *
      piecewise(fast, T.fastCredit) *
      piecewise(input.lyeConcentrationPercent, T.lyeConc),
  );
  const usable: CureWeeksRange = { minWeeks: usableMin, maxWeeks: usableMin * T.usableSpread };

  // The second milestone can never precede usable-from (100% coconut actually hits this).
  const bestMin = Math.max(piecewise(slow, T.bestKnees), usableMin);
  let second: CureModelEstimate['second'] = {
    kind: 'best',
    minWeeks: bestMin,
    maxWeeks: bestMin * T.bestSpread,
  };

  const caveats: string[] = [];
  if (pufaAtLeast > T.pufaFlipPercent) {
    // The BOUND decides whether to flip; the higher renormalized reading sizes the window.
    // Sizing from the bound would hand a recipe a LONGER shelf-life promise the thinner its
    // data got, which is the one place optimism is unsafe.
    const shelf = Math.max(piecewise(pufa, T.shelfKnees), usableMin);
    second = { kind: 'useWithin', minWeeks: shelf, maxWeeks: shelf };
    caveats.push(FLIP_CAVEAT);
  } else if (pufaAtLeast > T.pufaCaveatPercent) {
    caveats.push(DOS_CAVEAT);
  }
  // The same low-coverage rule, printed figure and wording as the panels and insights, so this
  // caveat never says "covers only 80%" beside a panel that calls the same 80% sound.
  if (isLowCoverage(input.faCoverage)) {
    caveats.push(
      `Fatty-acid data covers only ${formatCoveragePercent(input.faCoverage)}% of recipe oil weight — the cure drivers are partly estimated.`,
    );
  }

  const factors = [
    `Slow FAs (oleic + ricinoleic + weighted PUFA) ${Math.round(slow)}%`,
    `Quick FAs (lauric + myristic) ${Math.round(fast)}%`,
    `${Math.round(input.lyeConcentrationPercent)}% lye concentration`,
  ];

  // 'low' at launch: the knees are literature-anchored but the calibration harness has no
  // real batches yet (same honest posture workability shipped with).
  return { usable, second, confidence: 'low', factors, caveats };
}
