import type { AdditiveProcess } from './additives.js';
import { EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT, IFRA_CATEGORY_NINE_PERCENT } from './fragrance.js';

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
 * So the app shows the NAMES as a warning and says, plainly, that the supplier's own
 * declaration governs. It is the difference between "here is what to look for" and "here
 * is what to print", and the app only does the first.
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
 *                drive its use". Each entry lists every constituent IFRA names for the oil that
 *                has a limit on record, and essentialOilCeiling takes the lowest figure across
 *                all of them and the oil's own standard, against both tables — IFRA's and EU
 *                law's (methyl eugenol, fragrance.ts EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT). The
 *                winner is computed, not typed, and so is the sentence behind it.
 *   [SCCS-TTO]   the EU Scientific Committee on Consumer Safety's final opinion on tea tree
 *                oil, SCCS/1681/25 (adopted 30 October 2025): "safe ... up to the maximum
 *                concentration of 2.0% in shampoo, 1.0% in shower gel, 1.0% in face wash and
 *                0.1% in face cream". IFRA has no standard for the oil and its constituents do
 *                not bind, so the SCCS's shower-gel figure — the nearest product it assessed to
 *                a bar — is the ceiling.
 * IFRA's index (same source) has NO standard for peppermint, tea tree, lavender, rosemary,
 * eucalyptus, geranium, lemongrass, patchouli, cedarwood, clove, cinnamon or sweet orange as
 * oils; expressed lemon, grapefruit and bergamot have phototoxicity standards that read
 * "No Restriction" for Category 9. A figure at or past 100% of the product is no ceiling at
 * all (lavender's geraniol would "cap" it at 583%), and the resolver says null; a ceiling
 * above anything a bar carries (geranium, cedarwood) is carried, and the panel says so
 * rather than printing it as safe use.
 * The books carry the soaping behaviour and none of the chemistry: clove and cinnamon
 * "contain chemical constituents" that accelerate trace and irritate (CP:9531-9538), and
 * cinnamon EO is advised against in soap outright (CP:9589-9592).
 */

/** The ceiling as resolved for an oil: the most of it the finished soap may carry, the
 * sentence behind the figure (plain words, the authority named, no supplier), who set it,
 * and — for a constituent-derived one — which constituent binds. */
export type EssentialOilCeiling = {
  percentOfProduct: number;
  why: string;
  authority: 'IFRA' | 'EU law' | 'SCCS';
  substance: string | null;
};

export type EssentialOilEntry = {
  id: string;
  name: string;
  /** The material the sentences name — "clove bud oil", "Virginian cedarwood oil" — where
   * the display name alone would leave the grade or the species open. */
  material?: string;
  /** Annex III substances among this oil's published principal components ([EO-COMP]). */
  allergens: readonly string[];
  /** IFRA's typical level of each restricted constituent in this oil ([IFRA-ANNEX]), as a
   * percent of the OIL — every one that has a limit on record, not just the one that
   * binds; the resolver checks them all. */
  constituents?: readonly { substance: string; percentOfOil: number }[];
  /** A ceiling a body set for the OIL itself, as a percent of the finished product: IFRA's
   * own standard for the material, or the SCCS's opinion. Compared with the constituents'
   * figures; the lowest wins. */
  standard?: { percentOfProduct: number; authority: 'IFRA' | 'SCCS'; why: string };
  /** Accelerates trace and irritates skin (CP:9531-9538). */
  accelerates?: true;
  /** Anything the books say about this oil in soap, in the app's own words. */
  note?: string;
  /** Processes it is offered for; absent = all. */
  processes?: readonly AdditiveProcess[];
};

export const ESSENTIAL_OIL_CATALOG: readonly EssentialOilEntry[] = [
  // Citrus: limonene carries them all. The phototoxicity standards for the expressed oils
  // read "No Restriction" for Category 9 ([IFRA-51]); what IFRA's annex lists is far from
  // binding at any dose a bar carries.
  {
    id: 'lemon', name: 'Lemon', allergens: ['Limonene'],
    // [IFRA-ANNEX] lemon oil, expressed.
    constituents: [
      { substance: 'Citral', percentOfOil: 3.5 },
      { substance: 'Citronellal', percentOfOil: 0.1 },
      { substance: 'Geraniol', percentOfOil: 0.1 },
    ],
  },
  // Sweet orange oil itself is not in [IFRA-ANNEX] (only its terpenes are).
  { id: 'sweet-orange', name: 'Sweet orange', allergens: ['Limonene'] },
  {
    id: 'grapefruit', name: 'Grapefruit', allergens: ['Limonene', 'Citral', 'Geraniol'],
    // [IFRA-ANNEX] grapefruit oil.
    constituents: [
      { substance: 'Citral', percentOfOil: 0.1 },
      { substance: 'Citronellal', percentOfOil: 0.1 },
      { substance: '2-Hexenal', percentOfOil: 0.03 },
    ],
  },
  {
    id: 'bergamot', name: 'Bergamot', allergens: ['Limonene', 'Linalool', 'Geraniol'],
    // [IFRA-BERGAMOT] IFRA Standard, expressed bergamot oil (Amendment 49):
    // https://d3t14p1xronwr0.cloudfront.net/docs/standards/IFRA_STD_087.pdf — retrieved
    // 2026-09-10. The restriction is a LEAVE-ON one (0.4% for skin exposed to sunshine;
    // bergapten under 15 ppm), and soap is rinse-off, Category 9 — so it does not bite here.
    // Said anyway because the same bottle usually goes into balms and oils too, where it does.
    note: 'Expressed bergamot carries bergapten, which is phototoxic in sunlight. The limits on it are for leave-on products, so a rinse-off soap is not what they are about — but if that same bottle also goes into a balm or a body oil, reach for the distilled bergapten-free (FCF) grade there.',
    // [IFRA-ANNEX] bergamot oil expressed: geranial 0.28 + neral 0.2 (both in the Citral standard).
    constituents: [
      { substance: 'Citral', percentOfOil: 0.48 },
      { substance: 'Geraniol', percentOfOil: 0.04 },
    ],
  },
  // Herbaceous and minty.
  {
    id: 'lavender', name: 'Lavender', allergens: ['Linalool'],
    // [IFRA-ANNEX] lavender oil: nothing near binding (geraniol → 583% of a bar).
    constituents: [
      { substance: 'Geraniol', percentOfOil: 0.48 },
      { substance: '2-Hexenal', percentOfOil: 0.01 },
    ],
  },
  // Rosemary is not in [IFRA-ANNEX] at all — no restricted constituent at a typical level.
  { id: 'rosemary', name: 'Rosemary', allergens: [] },
  {
    id: 'peppermint', name: 'Peppermint', allergens: [],
    // [IFRA-ANNEX] peppermint oil: carvone 0.1% against a 0.18% cap → 180% of a bar. The
    // pulegone and menthofuran that medicines regulators watch have no IFRA standard.
    constituents: [{ substance: 'Carvone', percentOfOil: 0.1 }],
  },
  // Eucalyptus globulus is not in [IFRA-ANNEX]; radiata carries 1.5% citral (→ 80%).
  { id: 'eucalyptus', name: 'Eucalyptus', allergens: ['Limonene'] },
  {
    id: 'tea-tree', name: 'Tea tree', allergens: [],
    // [SCCS-TTO] 1.0% in shower gel. [IFRA-ANNEX] tea tree oil: methyl eugenol 0.05%, which
    // EU law's 0.001% would cap at 2.0% — the SCCS figure is lower and wins.
    standard: {
      percentOfProduct: 1.0, authority: 'SCCS',
      why: "the EU's scientific committee found tea tree oil safe up to 1.0% in a shower gel (SCCS/1681/25), the nearest product it assessed to a bar — the oil has no IFRA standard of its own",
    },
    constituents: [{ substance: 'Methyl eugenol', percentOfOil: 0.05 }],
  },
  // Floral and sweet.
  {
    id: 'geranium', name: 'Geranium', allergens: ['Citronellol', 'Geraniol', 'Linalool', 'Citral', 'Limonene'],
    // [IFRA-ANNEX] geranium oil. Geraniol (cap 2.8% → 15.8% of a bar) binds ahead of
    // citronellol (cap 24% → 114%), citral (→ 240%) and citronellal.
    constituents: [
      { substance: 'Citronellol', percentOfOil: 21.1 },
      { substance: 'Geraniol', percentOfOil: 17.7 },
      { substance: 'Citral', percentOfOil: 0.5 },
      { substance: 'Citronellal', percentOfOil: 0.15 },
    ],
  },
  {
    id: 'ylang-ylang', name: 'Ylang ylang',
    allergens: ['Linalool', 'Geraniol', 'Farnesol', 'Benzyl benzoate', 'Benzyl salicylate'],
    // [IFRA-51] Ylang ylang extracts, STD 084 (Amendment 49): Category 9 1.4%, dermal
    // sensitisation. [IFRA-ANNEX] lists five grades (extra, I, II, III, complete); each
    // constituent below is the highest level across them, so a rich grade is still inside.
    // None binds below the standard: isoeugenol → 21%, estragole → 2.1%, methyl eugenol → 2.5%.
    standard: {
      percentOfProduct: 1.4, authority: 'IFRA',
      why: "IFRA's own standard for ylang ylang extracts sets 1.4% in soap (Category 9), for skin sensitisation",
    },
    constituents: [
      { substance: 'Benzyl salicylate', percentOfOil: 3.35 },
      { substance: 'Farnesol', percentOfOil: 2.35 },
      { substance: 'Geraniol', percentOfOil: 1.43 },
      { substance: 'Isoeugenol', percentOfOil: 0.99 },
      { substance: 'Eugenol', percentOfOil: 0.69 },
      { substance: 'Estragole', percentOfOil: 0.2 },
      { substance: 'Methyl eugenol', percentOfOil: 0.04 },
      { substance: 'Citral', percentOfOil: 0.12 },
      { substance: 'Benzyl alcohol', percentOfOil: 0.25 },
    ],
  },
  {
    id: 'lemongrass', name: 'Lemongrass', allergens: ['Citral', 'Linalool', 'Geraniol', 'Citronellol', 'Farnesol'],
    // [IFRA-ANNEX] lemongrass oil, West Indian: citral 73% (East Indian: geranial 41.4 +
    // neral 30.5 = 72%); cap 1.2% → 1.6% of a bar. Methyl eugenol is the East Indian's
    // figure, carried so the stricter oil is still covered (EU → 2.0%).
    constituents: [
      { substance: 'Citral', percentOfOil: 73 },
      { substance: 'Geraniol', percentOfOil: 2.3 },
      { substance: 'Isoeugenol', percentOfOil: 0.5 },
      { substance: 'Citronellal', percentOfOil: 0.3 },
      { substance: 'Eugenol', percentOfOil: 0.2 },
      { substance: 'Methyl eugenol', percentOfOil: 0.05 },
    ],
  },
  // Woody and earthy.
  // Patchouli is not in [IFRA-ANNEX] — no restricted constituent at a typical level.
  { id: 'patchouli', name: 'Patchouli', allergens: ['Limonene'] },
  {
    id: 'cedarwood', name: 'Cedarwood', material: 'Virginian cedarwood oil', allergens: [],
    // [IFRA-ANNEX] cedarwood oil, Virginian — the soaper's usual one: α-cedrene 24.3% +
    // β-cedrene 5.9%, both in the Cedrene standard's scope; cap 2.9% → 9.6% of a bar. Texas
    // runs 15% cedrene (→ 19%), Atlas 1.5% (→ 193%), so Virginian is the tightest case.
    constituents: [{ substance: 'Cedrene', percentOfOil: 30.2 }],
  },
  // The two the cold-process text singles out.
  {
    id: 'clove', name: 'Clove', material: 'clove bud oil', allergens: ['Eugenol'], accelerates: true,
    // [IFRA-ANNEX] clove bud oil. Eugenol (cap 4.9% → 6.0% of a bar) is what a soaper
    // expects to bind; the 0.1% of methyl eugenol does instead — EU law caps it at 0.001%
    // of a rinse-off product (→ 1.0%), IFRA at 0.0017% (→ 1.7%). Leaf and stem oils carry
    // 0.1% and 0.06% of it.
    constituents: [
      { substance: 'Eugenol', percentOfOil: 82 },
      { substance: 'Methyl eugenol', percentOfOil: 0.1 },
    ],
    note: 'Eugenol-heavy, so it hurries trace along and can irritate skin. Keep the dose low and have the mold ready.',
  },
  {
    id: 'cinnamon', name: 'Cinnamon', material: 'cinnamon bark oil', allergens: ['Cinnamal', 'Eugenol', 'Linalool'], accelerates: true,
    // [IFRA-ANNEX] cinnamon bark oil (C. zeylanicum): cinnamic aldehyde 75% (cap 0.49% →
    // 0.65% of a bar); the rest sit far above it. Safrole (0.2%) has no table here. Leaf
    // oil is a different material (eugenol 74%, safrole 1.2%); the entry is the bark.
    constituents: [
      { substance: 'Cinnamal', percentOfOil: 75 },
      { substance: 'Eugenol', percentOfOil: 2 },
      { substance: 'Coumarin', percentOfOil: 0.6 },
      { substance: 'Benzaldehyde', percentOfOil: 0.2 },
      { substance: 'Isoeugenol', percentOfOil: 0.02 },
    ],
    note: 'The cold-process text advises against this one in soap: cinnamaldehyde and eugenol both irritate, and it seizes a batch faster than almost anything else.',
  },
];

export function essentialOilEntryById(id: string): EssentialOilEntry | undefined {
  return id ? ESSENTIAL_OIL_CATALOG.find((e) => e.id === id) : undefined;
}

/** How a constituent reads in a sentence: IFRA's key, or the everyday name where the key
 * is the INCI one. */
const CONSTITUENT_WORDS: Readonly<Record<string, string>> = { Cinnamal: 'cinnamaldehyde' };
const constituentWord = (substance: string): string => CONSTITUENT_WORDS[substance] ?? substance.toLowerCase();

/** The material an entry's sentences name — the given one, else "<name> oil". */
export function essentialOilMaterial(entry: EssentialOilEntry): string {
  return entry.material ?? `${entry.name.toLowerCase()} oil`;
}

/**
 * The most of this oil a soap may carry, as a percent of the FINISHED PRODUCT, and why.
 * IFRA's own method (Guidance §7.12): each constituent's limit ÷ (its share of the oil ÷
 * 100), against every table that names it, and the oil's own standard where one exists —
 * the lowest figure wins, and its sentence is built from the same numbers. Clove's methyl
 * eugenol is limited to 0.001% and clove bud oil is 0.1% methyl eugenol, so clove tops out
 * at 1.0% of the bar. Null where nothing is on record, or where the lowest figure is at or
 * past 100% of the product — which is no ceiling at all.
 */
export function essentialOilCeiling(entry: EssentialOilEntry): EssentialOilCeiling | null {
  const candidates: EssentialOilCeiling[] = [];
  if (entry.standard && entry.standard.percentOfProduct > 0) {
    candidates.push({ ...entry.standard, substance: null });
  }
  const material = essentialOilMaterial(entry);
  for (const c of entry.constituents ?? []) {
    if (!(c.percentOfOil > 0)) continue;
    const share = c.percentOfOil / 100;
    const word = constituentWord(c.substance);
    const ifra = IFRA_CATEGORY_NINE_PERCENT[c.substance];
    if (ifra !== undefined) {
      candidates.push({
        percentOfProduct: ifra / share, authority: 'IFRA', substance: c.substance,
        why: `IFRA caps ${word} at ${ifra}% of a soap and ${material} is typically ${c.percentOfOil}% ${word}`,
      });
    }
    const eu = EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT[c.substance];
    if (eu !== undefined) {
      candidates.push({
        percentOfProduct: eu / share, authority: 'EU law', substance: c.substance,
        why: `EU law (Annex III) caps ${word} at ${eu}% of a rinse-off product and ${material} typically carries ${c.percentOfOil}% of it`,
      });
    }
  }
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.percentOfProduct < a.percentOfProduct ? b : a));
  return best.percentOfProduct < 100 ? best : null;
}
