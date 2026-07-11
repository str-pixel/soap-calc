// Anhydrous citric acid (triprotic) neutralizes 3 OH⁻. Molar masses in g/mol.
const CITRIC_ACID_MW = 192.124;
const KOH_MW = 56.1056;
const NAOH_MW = 39.997;
const CITRIC_WATER_DILUTION = 4; // citric acid dissolved 1:4 in hot water
const TARGET_PH_LOW = 9;
const TARGET_PH_HIGH = 10.5;

export type NeutralizationInput = {
  kohGrams: number; // as-weighed KOH from the lye result (at the negative superfat)
  naohGrams: number; // as-weighed NaOH from the lye result (dual lye)
  superfatPercent: number; // the (negative) main superfat, e.g. -2
  kohPurityPercent: number;
  naohPurityPercent: number;
};

export type NeutralizationResult = {
  lyeExcessPercent: number; // magnitude, e.g. 2 for superfat -2
  excessKohGrams: number; // as-weighed excess KOH
  excessNaohGrams: number; // as-weighed excess NaOH
  citricAcidGrams: number; // anhydrous citric estimate (from active excess)
  dilutionWaterGrams: number; // 4 × citricAcidGrams
  targetPhLow: number;
  targetPhHigh: number;
};

function activeFraction(purityPercent: number): number {
  return Number.isFinite(purityPercent) && purityPercent > 0 ? purityPercent / 100 : 1;
}

/** Estimate the citric acid needed to neutralize a lye-excess (negative-superfat) LS batch
 * down to pH 9–10.5. Returns null when there is no excess (superfat ≥ 0) or no alkali. */
export function calculateNeutralization(input: NeutralizationInput): NeutralizationResult | null {
  const { kohGrams, naohGrams, superfatPercent, kohPurityPercent, naohPurityPercent } = input;
  if (!Number.isFinite(superfatPercent) || superfatPercent >= 0) return null;
  const koh = Number.isFinite(kohGrams) && kohGrams > 0 ? kohGrams : 0;
  const naoh = Number.isFinite(naohGrams) && naohGrams > 0 ? naohGrams : 0;
  if (koh <= 0 && naoh <= 0) return null;

  // Lye is linear in superfat: grams = grams0 × (1 − s/100). Back out the as-weighed excess
  // over exact saponification without recomputing the recipe. s < 0 ⇒ factor in (0, 1).
  const excessFactor = -superfatPercent / (100 - superfatPercent);
  const excessKohGrams = koh * excessFactor;
  const excessNaohGrams = naoh * excessFactor;

  // Active alkali = as-weighed × purity; the pH-driving amount is the active fraction, and
  // using it keeps the estimate on the safe (lower) side.
  const molOH =
    (excessKohGrams * activeFraction(kohPurityPercent)) / KOH_MW +
    (excessNaohGrams * activeFraction(naohPurityPercent)) / NAOH_MW;
  const citricAcidGrams = (molOH / 3) * CITRIC_ACID_MW;

  return {
    lyeExcessPercent: -superfatPercent,
    excessKohGrams,
    excessNaohGrams,
    citricAcidGrams,
    dilutionWaterGrams: citricAcidGrams * CITRIC_WATER_DILUTION,
    targetPhLow: TARGET_PH_LOW,
    targetPhHigh: TARGET_PH_HIGH,
  };
}
