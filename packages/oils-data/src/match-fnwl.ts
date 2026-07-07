import { LEGACY_TO_FNWL_ALIASES, normalizeOilName } from './normalize.js';
import type { FnwlRow } from './parse-fnwl.js';

export type { FnwlRow };

export function buildFnwlIndex(rows: FnwlRow[]): Map<string, FnwlRow> {
  return new Map(rows.map((r) => [normalizeOilName(r.name), r]));
}

/**
 * Match a legacy oil name to FNWL using exact normalized name or explicit aliases only.
 * No substring/fuzzy matching — prevents dangerous pairs like grapeseed ↔ rapeseed.
 */
export function findFnwlMatch(
  legacyName: string,
  fnwlIndex: Map<string, FnwlRow>,
): FnwlRow | undefined {
  const norm = normalizeOilName(legacyName);
  const direct = fnwlIndex.get(norm);
  if (direct) return direct;

  const aliases = LEGACY_TO_FNWL_ALIASES[norm] ?? [];
  for (const alias of aliases) {
    const hit = fnwlIndex.get(normalizeOilName(alias));
    if (hit) return hit;
  }

  return undefined;
}
