import type { AdditiveProcess } from './additives.js';

/**
 * ESSENTIAL OILS the app offers by name, with the labelling allergens each one typically
 * carries and what the books say about using it in soap.
 *
 * WHAT THE ALLERGEN LISTS ARE, AND ARE NOT. They are the Annex III substances that appear
 * among each oil's PUBLISHED PRINCIPAL COMPONENTS — derived here from one open composition
 * review, cited below, and cross-referenced against the labelling list. That makes them a
 * starting point, not a declaration: an oil's minor constituents are not in a
 * principal-component table, and a minor constituent can still clear the 0.01% labelling
 * threshold in a rinse-off product. Composition also moves with origin, season and batch.
 * So the app pre-fills the NAMES and leaves the percentages empty, and says once, plainly,
 * that the supplier's own declaration governs. It is the difference between "here is what
 * to look for" and "here is what to print", and the app only does the first.
 *
 * Sources, retrieved 2026-09-10:
 *   [EO-COMP] Sharmeen JB, Mahomoodally FM, Zengin G, Maggi F. "Essential Oils as Natural
 *             Sources of Fragrance Compounds for Cosmetics and Cosmeceuticals." Molecules
 *             2021;26(3):666. doi:10.3390/molecules26030666 — Table 3, principal components
 *             per oil. Every allergen named below appears in that oil's row.
 *   [ANNEX-III] The labelling list itself is already cited in fragrance.ts (Regulation (EC)
 *             1223/2009 Annex III, widened by (EU) 2023/1545 from 31 July 2026).
 * The books carry the soaping behaviour and none of the chemistry: clove and cinnamon
 * "contain chemical constituents" that accelerate trace and irritate (CP:9531-9538), and
 * cinnamon EO is advised against in soap outright (CP:9589-9592).
 */

export type EssentialOilEntry = {
  id: string;
  name: string;
  /** Annex III substances among this oil's published principal components ([EO-COMP]). */
  allergens: readonly string[];
  /** Accelerates trace and irritates skin (CP:9531-9538). */
  accelerates?: true;
  /** Anything the books say about this oil in soap, in the app's own words. */
  note?: string;
  /** Processes it is offered for; absent = all. */
  processes?: readonly AdditiveProcess[];
};

/** What the app says once, wherever a pre-filled allergen list is shown. */
export const ESSENTIAL_OIL_ALLERGEN_CAUTION =
  'These are the labelling allergens this oil is usually made of — a place to start, not a declaration. An oil shifts with its origin and its batch, and a constituent too small to be listed among the main ones can still be big enough to name on a label. Fill the percentages from your own supplier\'s allergen declaration.';

export const ESSENTIAL_OIL_CATALOG: readonly EssentialOilEntry[] = [
  // Citrus: limonene carries them all.
  { id: 'lemon', name: 'Lemon', allergens: ['Limonene'] },
  { id: 'sweet-orange', name: 'Sweet orange', allergens: ['Limonene'] },
  { id: 'grapefruit', name: 'Grapefruit', allergens: ['Limonene', 'Citral', 'Geraniol'] },
  {
    id: 'bergamot', name: 'Bergamot', allergens: ['Limonene', 'Linalool', 'Geraniol'],
    note: 'Expressed bergamot carries bergapten and is phototoxic on skin; a bergapten-free (FCF) grade is the one to soap with.',
  },
  // Herbaceous and minty.
  { id: 'lavender', name: 'Lavender', allergens: ['Linalool'] },
  { id: 'rosemary', name: 'Rosemary', allergens: [] },
  { id: 'peppermint', name: 'Peppermint', allergens: [] },
  { id: 'eucalyptus', name: 'Eucalyptus', allergens: ['Limonene'] },
  { id: 'tea-tree', name: 'Tea tree', allergens: [] },
  // Floral and sweet.
  { id: 'geranium', name: 'Geranium', allergens: ['Citronellol', 'Geraniol', 'Linalool', 'Citral', 'Limonene'] },
  {
    id: 'ylang-ylang', name: 'Ylang ylang',
    allergens: ['Linalool', 'Geraniol', 'Farnesol', 'Benzyl benzoate', 'Benzyl salicylate'],
  },
  { id: 'lemongrass', name: 'Lemongrass', allergens: ['Citral', 'Linalool', 'Geraniol', 'Citronellol', 'Farnesol'] },
  // Woody and earthy.
  { id: 'patchouli', name: 'Patchouli', allergens: ['Limonene'] },
  { id: 'cedarwood', name: 'Cedarwood', allergens: [] },
  // The two the cold-process text singles out.
  {
    id: 'clove', name: 'Clove', allergens: ['Eugenol'], accelerates: true,
    note: 'Eugenol-heavy, so it hurries trace along and can irritate skin. Keep the dose low and have the mold ready.',
  },
  {
    id: 'cinnamon', name: 'Cinnamon', allergens: ['Cinnamal', 'Eugenol', 'Linalool'], accelerates: true,
    note: 'The cold-process text advises against this one in soap: cinnamaldehyde and eugenol both irritate, and it seizes a batch faster than almost anything else.',
  },
];

export function essentialOilEntryById(id: string): EssentialOilEntry | undefined {
  return id ? ESSENTIAL_OIL_CATALOG.find((e) => e.id === id) : undefined;
}
