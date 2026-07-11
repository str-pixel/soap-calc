export type DilutionInput = {
  anhydrousGrams: number; // oils + lye (water-free soap solids)
  cookWaterGrams: number; // water already in the paste (the lye water)
  kohGrams: number;
  naohGrams: number;
  soapConcentrationPercent: number;
};

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
  const dilutionWaterGrams = Math.max(0, totalWaterGrams - cook);
  const koh = Number.isFinite(kohGrams) && kohGrams > 0 ? kohGrams : 0;
  const naoh = Number.isFinite(naohGrams) && naohGrams > 0 ? naohGrams : 0;
  const glycerinGrams = koh * 0.55 + naoh * 0.77;
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
