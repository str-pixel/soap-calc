import { MIN_MAPPED_PERCENT } from '@soap-calc/core';

type OilLike = {
  id: string;
  propertiesAvailable?: boolean;
  fattyAcids?: Record<string, number>;
};

/**
 * Property-ready oils whose fatty-acid profile sums below `minPercent` — their bar-property
 * scores rest on a partial composition (inherited SoapCalc 8-acid truncation), so the build
 * surfaces them for review/backfill. Sorted ascending by sum (worst first). Defaults to the
 * shared {@link MIN_MAPPED_PERCENT} so "complete enough" means one thing across the codebase.
 */
export function incompleteProfileOils(
  oils: OilLike[],
  minPercent: number = MIN_MAPPED_PERCENT,
): { id: string; sum: number }[] {
  const out: { id: string; sum: number }[] = [];
  for (const oil of oils) {
    if (!oil.propertiesAvailable || !oil.fattyAcids) continue;
    const sum = Object.values(oil.fattyAcids).reduce((acc, pct) => acc + pct, 0);
    if (sum < minPercent) out.push({ id: oil.id, sum });
  }
  return out.sort((a, b) => a.sum - b.sum);
}
