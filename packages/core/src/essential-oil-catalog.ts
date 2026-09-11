import type { AdditiveProcess } from './additives.js';
import { euRinseOffLimitPercent, ifraCategoryNinePercent } from './fragrance.js';

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
 *
 * WHAT THE CEILINGS ARE. Each oil that has one carries the most of it a soap may hold, as a
 * percent of the FINISHED product, and where the figure comes from. Three kinds, all read
 * from primary text on 2026-09-11 (PDF/xlsx downloaded and text-extracted locally):
 *   [IFRA-51]    the consolidated IFRA Standards, 51st Amendment — Category 9 is soap:
 *                https://d3t14p1xronwr0.cloudfront.net/docs/Standards-Documentation/ifra-standards-51st-amendment.pdf
 *                An oil with a standard of its OWN (ylang ylang, STD 084) takes that figure.
 *   [IFRA-ANNEX] IFRA's "Annex on contributions from other sources", the Natural Complex
 *                Substances task force's typical level of each restricted constituent in each
 *                named oil, "intended to be used in the absence of the company's own or
 *                reliable supplier analytical data" (Guidance, p.12):
 *                https://d3t14p1xronwr0.cloudfront.net/docs/Standards-Documentation/ifra-51st-amendment-annex-on-contributions-from-other-sources.xlsx
 *                The Guidance's own method (§7.12, p.66) is the one used here: the constituent's
 *                cap divided by its share of the oil is the most of the oil the product may
 *                carry, and "the lowest resulting maximum permitted use level of the NCS will
 *                drive its use". Every constituent IFRA lists for the oil was checked; the entry
 *                records the one that binds. Where EU law names a lower limit on a constituent
 *                (methyl eugenol, fragrance.ts EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT) the law binds.
 *   [SCCS-TTO]   the EU Scientific Committee on Consumer Safety's final opinion on tea tree
 *                oil, SCCS/1681/25 (adopted 30 October 2025): "safe ... up to the maximum
 *                concentration of 2.0% in shampoo, 1.0% in shower gel, 1.0% in face wash and
 *                0.1% in face cream". IFRA has no standard for the oil and its constituents do
 *                not bind, so the SCCS's shower-gel figure — the nearest product it assessed to
 *                a bar — is the ceiling.
 * IFRA's index (same source) has NO standard for peppermint, tea tree, lavender, rosemary,
 * eucalyptus, geranium, lemongrass, patchouli, cedarwood, clove, cinnamon or sweet orange as
 * oils; expressed lemon, grapefruit and bergamot have phototoxicity standards that read
 * "No Restriction" for Category 9. An oil with no ceiling below anything a bar carries says
 * so rather than showing a figure nobody will reach.
 * The books carry the soaping behaviour and none of the chemistry: clove and cinnamon
 * "contain chemical constituents" that accelerate trace and irritate (CP:9531-9538), and
 * cinnamon EO is advised against in soap outright (CP:9589-9592).
 */

/**
 * A ceiling is either a figure a body set for the OIL itself, or one derived from a
 * constituent: the constituent's limit in the product (IFRA Category 9 or EU Annex III)
 * divided by its typical share of the oil. `why` is the sentence the app shows for it —
 * plain words, the authority named, no supplier.
 */
export type EssentialOilCeiling =
  | { kind: 'standard'; percentOfProduct: number; authority: 'IFRA' | 'SCCS'; why: string }
  | { kind: 'constituent'; substance: string; percentOfOil: number; limit: 'ifra' | 'eu'; why: string };

export type EssentialOilEntry = {
  id: string;
  name: string;
  /** Annex III substances among this oil's published principal components ([EO-COMP]). */
  allergens: readonly string[];
  /** The most of this oil a soap may carry — see the header. Absent where no ceiling can be
   * derived (an oil the app lists with no restricted constituent at a level that bites). */
  ceiling?: EssentialOilCeiling;
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
    // [IFRA-BERGAMOT] IFRA Standard, expressed bergamot oil (Amendment 49):
    // https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_087.pdf — retrieved
    // 2026-09-10. The restriction is a LEAVE-ON one (0.4% for skin exposed to sunshine;
    // bergapten under 15 ppm), and soap is rinse-off, Category 9 — so it does not bite here.
    // Said anyway because the same bottle usually goes into balms and oils too, where it does.
    note: 'Expressed bergamot carries bergapten, which is phototoxic in sunlight. The limits on it are for leave-on products, so a rinse-off soap is not what they are about — but if that same bottle also goes into a balm or a body oil, reach for the distilled bergapten-free (FCF) grade there.',
  },
  // Herbaceous and minty.
  // [IFRA-ANNEX] lavender oil: geraniol 0.48% (→ 583% of a bar), 2-hexenal 0.01% (→ 150%).
  { id: 'lavender', name: 'Lavender', allergens: ['Linalool'] },
  // Rosemary is not in [IFRA-ANNEX] at all — no restricted constituent at a typical level.
  { id: 'rosemary', name: 'Rosemary', allergens: [] },
  // [IFRA-ANNEX] peppermint oil: carvone 0.1% against a 0.18% cap → 180% of a bar.
  { id: 'peppermint', name: 'Peppermint', allergens: [] },
  // Eucalyptus globulus is not in [IFRA-ANNEX]; radiata carries 1.5% citral (→ 80%).
  { id: 'eucalyptus', name: 'Eucalyptus', allergens: ['Limonene'] },
  {
    id: 'tea-tree', name: 'Tea tree', allergens: [],
    // [SCCS-TTO] 1.0% in shower gel. [IFRA-ANNEX] tea tree oil: methyl eugenol 0.05%, which
    // EU law's 0.001% would cap at 2.0% — the SCCS figure is lower and stands.
    ceiling: {
      kind: 'standard', percentOfProduct: 1.0, authority: 'SCCS',
      why: "the EU's scientific committee found tea tree oil safe up to 1.0% in a shower gel (SCCS/1681/25), the nearest product it assessed to a bar — the oil has no IFRA standard of its own",
    },
  },
  // Floral and sweet.
  {
    id: 'geranium', name: 'Geranium', allergens: ['Citronellol', 'Geraniol', 'Linalool', 'Citral', 'Limonene'],
    // [IFRA-ANNEX] geranium oil: geraniol 17.7% (cap 2.8% → 15.8% of a bar) binds ahead of
    // citronellol 21.1% (cap 24% → 114%), citral 0.5% (→ 240%) and citronellal 0.15%.
    ceiling: {
      kind: 'constituent', substance: 'Geraniol', percentOfOil: 17.7, limit: 'ifra',
      why: 'IFRA caps geraniol at 2.8% of a soap and geranium oil is typically 17.7% geraniol',
    },
  },
  {
    id: 'ylang-ylang', name: 'Ylang ylang',
    allergens: ['Linalool', 'Geraniol', 'Farnesol', 'Benzyl benzoate', 'Benzyl salicylate'],
    // [IFRA-51] Ylang ylang extracts, STD 084 (Amendment 49): Category 9 1.4%, dermal
    // sensitisation. Its constituents do not bind below that: [IFRA-ANNEX] ylang ylang oil
    // extra — isoeugenol 0.99% (cap 0.21% → 21%), farnesol 1.36% (→ 169%), estragole up to
    // 0.2% in grade I (cap 0.0041% → 2.1%), methyl eugenol up to 0.04% (EU 0.001% → 2.5%).
    ceiling: {
      kind: 'standard', percentOfProduct: 1.4, authority: 'IFRA',
      why: "IFRA's own standard for ylang ylang extracts sets 1.4% in soap (Category 9), for skin sensitisation",
    },
  },
  {
    id: 'lemongrass', name: 'Lemongrass', allergens: ['Citral', 'Linalool', 'Geraniol', 'Citronellol', 'Farnesol'],
    // [IFRA-ANNEX] lemongrass oil, West Indian: citral 73% (East Indian: geranial 41.4 +
    // neral 30.5 = 72%); cap 1.2% → 1.6% of a bar. Isoeugenol 0.5% (→ 42%) and methyl
    // eugenol 0.05% in the East Indian (EU → 2.0%) sit above it.
    ceiling: {
      kind: 'constituent', substance: 'Citral', percentOfOil: 73, limit: 'ifra',
      why: 'IFRA caps citral at 1.2% of a soap and lemongrass is typically 73% citral',
    },
  },
  // Woody and earthy.
  // Patchouli is not in [IFRA-ANNEX] — no restricted constituent at a typical level.
  { id: 'patchouli', name: 'Patchouli', allergens: ['Limonene'] },
  {
    id: 'cedarwood', name: 'Cedarwood', allergens: [],
    // [IFRA-ANNEX] cedarwood oil, Virginian — the soaper's usual one: α-cedrene 24.3% +
    // β-cedrene 5.9%, both in the Cedrene standard's scope; cap 2.9% → 9.6% of a bar. Texas
    // runs 15% cedrene (→ 19%), Atlas 1.5% (→ 193%), so Virginian is the tightest case.
    ceiling: {
      kind: 'constituent', substance: 'Cedrene', percentOfOil: 30.2, limit: 'ifra',
      why: 'IFRA caps cedrene at 2.9% of a soap and Virginian cedarwood oil is typically 30% cedrene',
    },
  },
  // The two the cold-process text singles out.
  {
    id: 'clove', name: 'Clove', allergens: ['Eugenol'], accelerates: true,
    // [IFRA-ANNEX] clove bud oil: eugenol 82% (cap 4.9% → 6.0% of a bar) and methyl eugenol
    // 0.1%. EU law caps methyl eugenol at 0.001% of a rinse-off product → 1.0% of a bar, and
    // IFRA's own 0.0017% → 1.7%; the law binds. Leaf and stem oils carry 0.1% and 0.06%.
    ceiling: {
      kind: 'constituent', substance: 'Methyl eugenol', percentOfOil: 0.1, limit: 'eu',
      why: 'EU law (Annex III) caps methyl eugenol, a trace constituent of clove bud oil, at 0.001% of a rinse-off product — that binds long before eugenol\'s IFRA cap would',
    },
    note: 'Eugenol-heavy, so it hurries trace along and can irritate skin. Keep the dose low and have the mold ready.',
  },
  {
    id: 'cinnamon', name: 'Cinnamon', allergens: ['Cinnamal', 'Eugenol', 'Linalool'], accelerates: true,
    // [IFRA-ANNEX] cinnamon bark oil (C. zeylanicum): cinnamic aldehyde 75% (cap 0.49% →
    // 0.65% of a bar); coumarin 0.6% (→ 87%), eugenol 2% (→ 245%), safrole 0.2% sit above.
    // Leaf oil is a different material (eugenol 74%, safrole 1.2%); the entry is the bark.
    ceiling: {
      kind: 'constituent', substance: 'Cinnamal', percentOfOil: 75, limit: 'ifra',
      why: 'IFRA caps cinnamaldehyde at 0.49% of a soap and cinnamon bark oil is typically 75% cinnamaldehyde',
    },
    note: 'The cold-process text advises against this one in soap: cinnamaldehyde and eugenol both irritate, and it seizes a batch faster than almost anything else.',
  },
];

export function essentialOilEntryById(id: string): EssentialOilEntry | undefined {
  return id ? ESSENTIAL_OIL_CATALOG.find((e) => e.id === id) : undefined;
}

/**
 * The most of this oil a soap may carry, as a percent of the FINISHED PRODUCT. A standard's
 * figure as it stands; a constituent's limit ÷ (its share of the oil ÷ 100) — clove's methyl
 * eugenol is limited to 0.001% and clove bud oil is 0.1% methyl eugenol, so clove tops out at
 * 1.0% of the bar. Null where the oil has no ceiling, or its constituent's limit is not on
 * record (a data error the tests catch, not a runtime path).
 */
export function essentialOilSafeMaxPercentOfProduct(entry: EssentialOilEntry): number | null {
  const c = entry.ceiling;
  if (!c) return null;
  if (c.kind === 'standard') return c.percentOfProduct > 0 ? c.percentOfProduct : null;
  const limit = c.limit === 'eu' ? euRinseOffLimitPercent(c.substance) : ifraCategoryNinePercent(c.substance);
  if (limit === null || c.percentOfOil <= 0) return null;
  return limit / (c.percentOfOil / 100);
}

/** The sentence behind an oil's ceiling, or null where it has none. */
export function essentialOilCeilingWhy(entry: EssentialOilEntry): string | null {
  return entry.ceiling?.why ?? null;
}
