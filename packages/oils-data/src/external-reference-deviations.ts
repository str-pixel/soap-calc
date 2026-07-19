import type { Band, ExternalReferenceTable } from './external-references.js';

/** Iodine-value units / % beyond the band edge before a stored value is flagged. */
export const IODINE_ABS_TOL = 5;
export const IODINE_REL_TOL = 0.05;
/** mg KOH/g / % beyond the SAP band edge. */
export const SAP_ABS_TOL = 4;
export const SAP_REL_TOL = 0.03;
/** A single-source band is weak evidence — widen its tolerance so it doesn't trip on small gaps.
 * It is NOT a suppressor: a large single-source gap still flags and is adjudicated in review. */
export const SINGLE_SOURCE_TOL_FACTOR = 2;

/**
 * Stored iodine/SAP that disagrees with the external published band for a REVIEWED reason.
 * Keyed by `${id}:${property}` — one oil can deviate on iodine and SAP independently. Kept exact
 * by the drift guard (`external-reference-consistency.test.ts`). Reviewed, source-attributed only.
 */
export const KNOWN_EXTERNAL_REFERENCE_DEVIATIONS: Record<string, string> = {};

export type ExternalReferenceProperty = 'iodine' | 'sapKoh';

export type ExternalReferenceDeviation = {
  id: string;
  property: ExternalReferenceProperty;
  /** Stored value compared (iodine value, or SAP in mg KOH/g). */
  stored: number;
  band: [number, number];
  sourceCount: number;
  /** Signed distance past the nearest tolerance edge (negative = below, positive = above), 0.1-rounded. */
  deltaOutside: number;
  tier: 'warn' | 'acknowledged';
  reason?: string;
};

type OilLike = { id: string; iodine?: number; sapMgKohPerGram?: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

function evaluate(
  id: string,
  property: ExternalReferenceProperty,
  stored: number,
  band: Band,
  absTol: number,
  relTol: number,
): ExternalReferenceDeviation | null {
  const factor = band.sourceCount === 1 ? SINGLE_SOURCE_TOL_FACTOR : 1;
  const lo = band.min - Math.max(absTol, relTol * band.min) * factor;
  const hi = band.max + Math.max(absTol, relTol * band.max) * factor;
  let deltaOutside: number;
  if (stored < lo) deltaOutside = stored - lo;
  else if (stored > hi) deltaOutside = stored - hi;
  else return null;
  const reason = KNOWN_EXTERNAL_REFERENCE_DEVIATIONS[`${id}:${property}`];
  return {
    id,
    property,
    stored,
    band: [band.min, band.max],
    sourceCount: band.sourceCount,
    deltaOutside: round1(deltaOutside),
    tier: reason ? 'acknowledged' : 'warn',
    reason,
  };
}

/**
 * Flag every oil whose stored iodine / SAP falls outside its pooled external band ± per-side
 * tolerance. Coverage is defined solely by `refs` (no category filter — this compares numbers,
 * it derives nothing). Warn-only: tiers are `acknowledged` (documented in
 * KNOWN_EXTERNAL_REFERENCE_DEVIATIONS) or `warn`. Sorted by id, then property (iodine before sap).
 */
export function classifyExternalReferenceDeviations(
  oils: OilLike[],
  refs: ExternalReferenceTable,
): ExternalReferenceDeviation[] {
  const out: ExternalReferenceDeviation[] = [];
  for (const oil of oils) {
    const ref = refs[oil.id];
    if (!ref) continue;
    if (ref.iodine && oil.iodine != null) {
      const d = evaluate(oil.id, 'iodine', oil.iodine, ref.iodine, IODINE_ABS_TOL, IODINE_REL_TOL);
      if (d) out.push(d);
    }
    if (ref.sapKoh && oil.sapMgKohPerGram != null) {
      const d = evaluate(oil.id, 'sapKoh', oil.sapMgKohPerGram, ref.sapKoh, SAP_ABS_TOL, SAP_REL_TOL);
      if (d) out.push(d);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id) || a.property.localeCompare(b.property));
}
