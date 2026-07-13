/**
 * Public oil-id renames applied at build time. The internal build key stays the legacy slug
 * (`slugify(leg.name)`), so FNWL/INCI/backfill lookups and provenance are unchanged — only the
 * emitted `id` differs. A matching web-side migration (`oilById`) resolves saved recipes that
 * reference the old id, so a rename never breaks existing recipes.
 *
 * Use sparingly: ids are stable keys. Every entry here MUST have a lockstep entry in the web
 * `OIL_ID_MIGRATIONS` map (packages/web/src/lib/oils.ts).
 */
export const OIL_ID_OVERRIDES: Record<string, string> = {
  // High-erucic rapeseed was mislabeled with a "canola" slug (and a separate canola-oil entry
  // exists); renamed so a "canola" search no longer surfaces it via the id-substring match.
  'rapeseed-oil-canola': 'rapeseed-oil-high-erucic',
};
