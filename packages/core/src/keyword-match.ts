export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wordBoundaryMatch(text: string, keyword: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
  return pattern.test(text);
}

function isLikelyFragranceName(name: string): boolean {
  return /\b(fragrance|essential oil|perfume|parfum|eo)\b/i.test(name);
}

export type NamedCatalogEntry = {
  catalogId: string;
  name: string;
  /** Where the line is added — mirrors additives.ts AdditiveStage (spelled out here so this
   * module keeps importing nothing). Optional: rules that read it treat an unknown stage as
   * the catalog's default for that additive. */
  addAt?: 'lye' | 'oils' | 'trace' | 'top' | 'after_cook';
};

/** Name-only keyword match across additive lines, with the same fragrance guard
 * additiveMatches uses. For substances that have no catalog entry (and shouldn't — e.g.
 * magnesium salts, which are advised against), where matching on catalogId is meaningless:
 * passing '' as a catalogId to additiveMatches would match EVERY custom line. */
export function additiveNameMatches(
  entries: NamedCatalogEntry[] | undefined,
  nameKeyword: string,
): boolean {
  if (!entries?.length) return false;
  return entries.some(
    (entry) => !isLikelyFragranceName(entry.name) && wordBoundaryMatch(entry.name, nameKeyword),
  );
}

/** The entries `additiveMatches` would match — by catalog id, or by a word-boundary keyword
 * on a name that does not read as a fragrance. Rules that need the matched LINES (to read
 * their stage) call this; the boolean form below stays for everyone else. */
export function matchingAdditiveEntries<T extends NamedCatalogEntry>(
  entries: T[] | undefined,
  catalogId: string,
  nameKeyword: string,
): T[] {
  if (!entries?.length) return [];
  return entries.filter(
    (entry) =>
      entry.catalogId === catalogId ||
      (!isLikelyFragranceName(entry.name) && wordBoundaryMatch(entry.name, nameKeyword)),
  );
}

export function additiveMatches(
  entries: NamedCatalogEntry[] | undefined,
  catalogId: string,
  nameKeyword: string,
): boolean {
  return matchingAdditiveEntries(entries, catalogId, nameKeyword).length > 0;
}

export type NamedOilEntry = { oilId: string; name: string };

export function recipeOilMatches(
  entries: NamedOilEntry[] | undefined,
  options: { oilIds?: string[]; nameKeyword?: string },
): boolean {
  if (!entries?.length) return false;
  const ids = options.oilIds ?? [];
  const keyword = options.nameKeyword;
  return entries.some((entry) => {
    if (ids.includes(entry.oilId)) return true;
    if (keyword && (wordBoundaryMatch(entry.name, keyword) || entry.oilId.includes(keyword))) {
      return true;
    }
    return false;
  });
}
