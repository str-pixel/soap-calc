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

export type NamedCatalogEntry = { catalogId: string; name: string };

export function additiveMatches(
  entries: NamedCatalogEntry[] | undefined,
  catalogId: string,
  nameKeyword: string,
): boolean {
  if (!entries?.length) return false;
  return entries.some(
    (entry) =>
      entry.catalogId === catalogId ||
      (!isLikelyFragranceName(entry.name) &&
        wordBoundaryMatch(entry.name, nameKeyword)),
  );
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
