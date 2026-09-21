import { LEGACY_TO_FNWL_ALIASES, normalizeNamePunctuation, normalizeOilName } from './normalize.js';
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
  if (direct) return preferExactName(direct, legacyName);

  const aliases = LEGACY_TO_FNWL_ALIASES[norm] ?? [];
  for (const alias of aliases) {
    const hit = fnwlIndex.get(normalizeOilName(alias));
    if (hit) return preferExactName(hit, alias);
  }

  return undefined;
}

/** The chart row whose raw name IS the name we looked up beats the group's median: it is
 * the best-identified row for that oil. Several rows can carry the exact name (kukui has
 * four), so the median among THOSE keeps the documented median rule; with no exact-name
 * row the group's median representative stands.
 *
 * Compared on punctuation-insensitive names, not verbatim: the name we looked up is often
 * an ALIAS, which the table stores already normalized ('jojoba oil natural'), while the
 * chart row carries the product name ('Jojoba Oil, Natural'). A verbatim compare can never
 * match those, which left the rule firing only for the few aliases that survive
 * normalization byte-for-byte. */
function preferExactName(row: FnwlRow, rawName: string): FnwlRow {
  const target = normalizeNamePunctuation(rawName);
  const exact = (row.variants ?? []).filter((v) => normalizeNamePunctuation(v.name) === target);
  if (exact.length === 0) return row;
  const sorted = [...exact].sort((a, b) => a.sapKoh - b.sapKoh);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
