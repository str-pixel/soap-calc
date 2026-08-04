import { DEFAULT_KOH_PURITY, DEFAULT_NAOH_PURITY } from './lye.js';
import { GLYCEROL_MOLAR_MASS, KOH_MOLAR_MASS, NAOH_MOLAR_MASS } from './molar-masses.js';

export type DilutionInput = {
  anhydrousGrams: number; // oils + lye (water-free soap solids)
  /** Water already in the paste when dilution starts: the lye water PLUS the water any
   * alternative liquid brought in at the lye/oils/trace stages (splitLiquidPasteWaterGrams).
   * Under-reporting it makes the calc prescribe dilution water that is already there, and
   * the finished soap lands below its target concentration. */
  cookWaterGrams: number;
  kohGrams: number; // as-weighed
  naohGrams: number; // as-weighed
  soapConcentrationPercent: number;
  /** As-weighed → active alkali; missing/invalid falls back to the same defaults the
   * lye calc used to produce these grams (mirrors neutralization.ts). */
  kohPurityPercent?: number;
  naohPurityPercent?: number;
  /** The recipe's main superfat; a negative value (lye excess) means part of the
   * alkali saponifies nothing and yields no glycerol. */
  superfatPercent?: number;
};

// Glycerol released per gram of ACTIVE alkali: glycerol MW / (3 × alkali MW).
const GLYCERIN_PER_ACTIVE_KOH = GLYCEROL_MOLAR_MASS / (3 * KOH_MOLAR_MASS);
const GLYCERIN_PER_ACTIVE_NAOH = GLYCEROL_MOLAR_MASS / (3 * NAOH_MOLAR_MASS);

function purityFraction(purityPercent: number | undefined, defaultPercent: number): number {
  const p =
    purityPercent !== undefined && Number.isFinite(purityPercent) && purityPercent > 0 && purityPercent <= 100
      ? purityPercent
      : defaultPercent;
  return p / 100;
}

export type DilutionResult = {
  anhydrousGrams: number;
  solutionGrams: number;
  totalWaterGrams: number;
  dilutionWaterGrams: number;
  glycerinGrams: number;
  soapConcentrationPercent: number;
  targetExceedsPaste: boolean;
};

/** Dilute a cooked LS paste to a target soap concentration. Glycerin is informational
 * (excluded from the concentration denominator, per anhydrous = oils + lye). */
export function calculateDilution(input: DilutionInput): DilutionResult | null {
  const { anhydrousGrams, cookWaterGrams, kohGrams, naohGrams, soapConcentrationPercent } = input;
  if (!Number.isFinite(anhydrousGrams) || anhydrousGrams <= 0) return null;
  if (!Number.isFinite(soapConcentrationPercent) || soapConcentrationPercent <= 0 || soapConcentrationPercent >= 100) {
    return null;
  }
  const cook = Number.isFinite(cookWaterGrams) && cookWaterGrams > 0 ? cookWaterGrams : 0;
  const soapFrac = soapConcentrationPercent / 100;
  const solutionGrams = anhydrousGrams / soapFrac;
  const totalWaterGrams = solutionGrams - anhydrousGrams;
  const targetExceedsPaste = totalWaterGrams < cook;
  // Clamped to 0, not left negative — but that clamp makes any figure DERIVED from
  // (totalWaterGrams - dilutionWaterGrams) unreliable once targetExceedsPaste is true: the
  // subtraction no longer recovers the real cook water, it recovers 0, so a "paste weight"
  // built from it silently understates the true paste by the whole clamped amount. See
  // ls-yield.ts's predictedPasteGrams field for where this bit a drift comparison, and use
  // its wholeBatchPasteGrams (or an equivalent clamp-free basis) instead of re-deriving one
  // here.
  const dilutionWaterGrams = Math.max(0, totalWaterGrams - cook);
  const koh = Number.isFinite(kohGrams) && kohGrams > 0 ? kohGrams : 0;
  const naoh = Number.isFinite(naohGrams) && naohGrams > 0 ? naohGrams : 0;
  const activeKoh = koh * purityFraction(input.kohPurityPercent, DEFAULT_KOH_PURITY);
  const activeNaoh = naoh * purityFraction(input.naohPurityPercent, DEFAULT_NAOH_PURITY);
  // Lye is linear in superfat (grams = grams0 × (1 − s/100)); for s < 0 only the
  // exact-saponification share 100/(100 − s) reacts — excess alkali yields no glycerol.
  const s = input.superfatPercent;
  const saponifyingShare = s !== undefined && Number.isFinite(s) && s < 0 ? 100 / (100 - s) : 1;
  const glycerinGrams =
    (activeKoh * GLYCERIN_PER_ACTIVE_KOH + activeNaoh * GLYCERIN_PER_ACTIVE_NAOH) * saponifyingShare;
  return {
    anhydrousGrams,
    solutionGrams,
    totalWaterGrams,
    dilutionWaterGrams,
    glycerinGrams,
    soapConcentrationPercent,
    targetExceedsPaste,
  };
}
