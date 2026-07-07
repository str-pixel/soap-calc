import type { OilRecord } from './oils';

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Drop parenthetical INCI fragments that repeat the oil's common display name.
 * e.g. "Sunflower Oil" + "Helianthus Annuus (Sunflower) Seed Oil" → "Helianthus Annuus Seed Oil"
 */
export function formatInciSubtitle(
  displayName: string,
  inciName: string,
  options?: { category?: string },
): string {
  const displayNorm = normalizeToken(displayName);
  let result = inciName;

  for (const match of inciName.matchAll(/\(([^)]+)\)/g)) {
    const inner = match[1];
    const innerNorm = normalizeToken(inner);
    if (!innerNorm) continue;

    const displayContainsInner =
      displayNorm.includes(innerNorm) ||
      innerNorm.split(' ').every((word) => word.length > 2 && displayNorm.includes(word));

    if (displayContainsInner) {
      result = result.replace(match[0], '');
    }
  }

  result = result.replace(/\s+/g, ' ').trim();

  const resultNorm = normalizeToken(result);
  if (!resultNorm || displayNorm.includes(resultNorm) || resultNorm.includes(displayNorm)) {
    // Pure fatty acids use the same string for common and INCI names (e.g. "Oleic Acid").
    if (options?.category === 'free_acid' && inciName.trim()) {
      return inciName;
    }
    return '';
  }

  return result;
}

export function oilPickerTag(oil: Pick<OilRecord, 'displayName' | 'category'>): string | undefined {
  const tallowMatch = oil.displayName.match(/^Tallow\s+(\w+)/i);
  if (tallowMatch) return tallowMatch[1];

  switch (oil.category) {
    case 'free_acid':
      return 'Fatty acid';
    case 'wax':
      return 'Wax';
    case 'tar':
      return 'Tar';
    case 'wax_ester':
      return 'Wax ester';
    default:
      return undefined;
  }
}
