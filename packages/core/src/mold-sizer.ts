/** Typical poured-soap density proxy (olive oil), g/cm³ */
export const SOAP_FILL_DENSITY_G_PER_CM3 = 0.92;

/** Default oil share of batch weight when sizing without a live recipe */
export const DEFAULT_OIL_BATCH_FRACTION = 0.65;

export function rectangularMoldVolumeCm3(
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): number | null {
  if (![lengthCm, widthCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }
  return lengthCm * widthCm * heightCm;
}

export function cylinderMoldVolumeCm3(radiusCm: number, heightCm: number): number | null {
  if (![radiusCm, heightCm].every((n) => Number.isFinite(n) && n > 0)) {
    return null;
  }
  return Math.PI * radiusCm * radiusCm * heightCm;
}

export function oilGramsFromMoldVolumeCm3(
  volumeCm3: number,
  options?: {
    fillDensityGPerCm3?: number;
    oilBatchFraction?: number;
  },
): number | null {
  const density = options?.fillDensityGPerCm3 ?? SOAP_FILL_DENSITY_G_PER_CM3;
  const fraction = options?.oilBatchFraction ?? DEFAULT_OIL_BATCH_FRACTION;
  if (!Number.isFinite(volumeCm3) || volumeCm3 <= 0) return null;
  if (!Number.isFinite(density) || density <= 0) return null;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) return null;
  return volumeCm3 * density * fraction;
}

export function oilGramsFromBarCount(
  barCount: number,
  finishedBarWeightGrams: number,
  oilBatchFraction = DEFAULT_OIL_BATCH_FRACTION,
): number | null {
  if (!Number.isFinite(barCount) || barCount <= 0) return null;
  if (!Number.isFinite(finishedBarWeightGrams) || finishedBarWeightGrams <= 0) {
    return null;
  }
  if (!Number.isFinite(oilBatchFraction) || oilBatchFraction <= 0 || oilBatchFraction > 1) {
    return null;
  }
  return barCount * finishedBarWeightGrams * oilBatchFraction;
}

export function oilBatchFraction(oilGrams: number, totalBatchGrams: number): number | null {
  if (!Number.isFinite(oilGrams) || oilGrams <= 0) return null;
  if (!Number.isFinite(totalBatchGrams) || totalBatchGrams <= oilGrams) return null;
  const fraction = oilGrams / totalBatchGrams;
  return fraction > 0 && fraction <= 1 ? fraction : null;
}

/** Increase suggested oil weight for mold shrinkage, waste, or trimming. */
export function applyOilWasteFactor(oilGrams: number, wasteFactorPercent: number): number | null {
  if (!Number.isFinite(oilGrams) || oilGrams <= 0) return null;
  if (!Number.isFinite(wasteFactorPercent) || wasteFactorPercent < 0 || wasteFactorPercent > 50) {
    return null;
  }
  return oilGrams * (1 + wasteFactorPercent / 100);
}
