/**
 * SAP conversion per ISO 3657 lab units (mg KOH per gram of fat).
 *
 * - KOH coefficient (g KOH / g oil) = mgKohPerGram / 1000
 * - NaOH coefficient (g NaOH / g oil) = mgKohPerGram / 1402.5
 *
 * @see https://www.fromnaturewithlove.com/resources/sapon.asp
 */
export const KOH_PER_GRAM_DIVISOR = 1000;
export const NAOH_PER_GRAM_DIVISOR = 1402.5;
export const KOH_TO_NAOH_FACTOR = NAOH_PER_GRAM_DIVISOR / KOH_PER_GRAM_DIVISOR; // 1.4025

export function mgKohPerGramToSapKoh(mgKohPerGram: number): number {
  return mgKohPerGram / KOH_PER_GRAM_DIVISOR;
}

export function mgKohPerGramToSapNaoh(mgKohPerGram: number): number {
  return mgKohPerGram / NAOH_PER_GRAM_DIVISOR;
}

export function sapKohToSapNaoh(sapKoh: number): number {
  return sapKoh / KOH_TO_NAOH_FACTOR;
}

export function sapNaohToSapKoh(sapNaoh: number): number {
  return sapNaoh * KOH_TO_NAOH_FACTOR;
}

export function parseSapRangeMgKoh(range: string): { min: number; max: number; mid: number } {
  const segments = range.split(/\s*-\s*/).map((p) => p.trim());
  // Number('') is 0, so an empty segment ("196-") would silently halve the SAP.
  const parts = segments.map((p) => (p === '' ? Number.NaN : Number(p)));
  if (parts.length === 1 && !Number.isNaN(parts[0])) {
    return { min: parts[0], max: parts[0], mid: parts[0] };
  }
  const [a, b] = parts;
  if (parts.length !== 2 || Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`Invalid SAP range: ${range}`);
  }
  // Normalize reversed ranges ("264-250"): mid is order-independent, but the
  // min/max fields feed source metadata and should stay ordered.
  return { min: Math.min(a, b), max: Math.max(a, b), mid: (a + b) / 2 };
}
