import type { AdditiveProcess } from './additives.js';
import { EU_LAW_RINSE_OFF_LIMIT_PERCENT, IFRA_CATEGORY_NINE_PERCENT, lsPotentDoseClause, USUAL_DOSE_RANGE_PERCENT } from './fragrance.js';
import { roundScaled } from './numeric.js';

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
 *                law's (methyl eugenol, safrole: fragrance.ts EU_LAW_RINSE_OFF_LIMIT_PERCENT). The
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
  /** The dose the cold-process text itself puts on this oil — a recipe's, or the rate it
   * quotes — as a percent of total oil weight, with the line. The starting dose reads it. */
  bookDose?: { percent: number; source: string };
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
  // binding at any dose a bar carries. Each list below is the annex's every row for the
  // oil that has a limit on record, at the annex's level (the highest across the grades and
  // varieties it lists for the oil); essential-oil-catalog.test.ts holds the transcript.
  {
    id: 'lemon', name: 'Lemon', allergens: ['Limonene'],
    bookDose: { percent: 6, source: 'CP:17084' },
    // [IFRA-ANNEX] lemon oil, expressed. 7-Methoxycoumarin is prohibited as such and allowed
    // as a natural constituent up to 0.01% of the product (the standard's notebox) → 20%.
    constituents: [
      { substance: 'Citral', percentOfOil: 3.5 },
      { substance: 'Citronellal', percentOfOil: 0.1 },
      { substance: 'Geraniol', percentOfOil: 0.1 },
      { substance: '7-Methoxycoumarin', percentOfOil: 0.05 },
    ],
  },
  // Sweet orange oil itself is not in [IFRA-ANNEX] (only its terpenes are).
  { id: 'sweet-orange', name: 'Sweet orange', allergens: ['Limonene'] },
  {
    id: 'grapefruit', name: 'Grapefruit', allergens: ['Limonene', 'Citral', 'Geraniol'],
    // [IFRA-ANNEX] grapefruit oil. Its geranial and neral rows are the citral row again.
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
    bookDose: { percent: 3, source: 'CP:17556' },
    // [IFRA-ANNEX] lavender oil: nothing near binding (the lowest figure, 2-hexenal, → 150%).
    constituents: [
      { substance: '1-Octen-3-yl acetate', percentOfOil: 1.04 },
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
    constituents: [
      { substance: 'Carvone', percentOfOil: 0.1 },
      { substance: 'cis-3-Hexenyl isovalerate', percentOfOil: 0.1 },
    ],
  },
  // Eucalyptus globulus is not in [IFRA-ANNEX]; radiata carries 1.5% citral (→ 80%).
  { id: 'eucalyptus', name: 'Eucalyptus', allergens: ['Limonene'], bookDose: { percent: 3, source: 'CP:17670' } },
  {
    id: 'tea-tree', name: 'Tea tree', allergens: [],
    bookDose: { percent: 5, source: 'CP:16761' },
    // [SCCS-TTO] 1.0% in shower gel. [IFRA-ANNEX] tea tree oil: methyl eugenol 0.05%, which
    // EU law's 0.001% would cap at 2.0% — the SCCS figure is lower and wins.
    standard: {
      percentOfProduct: 1.0, authority: 'SCCS',
      why: "the EU's scientific committee found tea tree oil safe up to 1.0% in a shower gel (SCCS/1681/25), the nearest product it assessed to a bar — the oil has no IFRA standard of its own",
    },
    constituents: [
      { substance: 'Methyl eugenol', percentOfOil: 0.05 },
      { substance: 'Cedrene', percentOfOil: 0.03 },
    ],
  },
  // Floral and sweet.
  {
    id: 'geranium', name: 'Geranium', allergens: ['Citronellol', 'Geraniol', 'Linalool', 'Citral', 'Limonene'],
    // [IFRA-ANNEX] geranium oil (Pelargonium graveolens; the "African" P. odoratissimum row
    // is another species). Geraniol (cap 2.8% → 15.8% of a bar) binds ahead of citronellol
    // (cap 24% → 114%), citral (→ 240%) and the rest.
    constituents: [
      { substance: 'Citronellol', percentOfOil: 21.1 },
      { substance: 'Geraniol', percentOfOil: 17.7 },
      { substance: 'Citral', percentOfOil: 0.5 },
      { substance: 'Citronellyl acetate', percentOfOil: 0.5 },
      { substance: 'Citronellal', percentOfOil: 0.15 },
      { substance: 'cis-3-Hexenyl isovalerate', percentOfOil: 0.1 },
    ],
  },
  {
    id: 'ylang-ylang', name: 'Ylang ylang',
    allergens: ['Linalool', 'Geraniol', 'Farnesol', 'Benzyl benzoate', 'Benzyl salicylate'],
    // [IFRA-51] Ylang ylang extracts, STD 084 (Amendment 49): Category 9 1.4%, dermal
    // sensitisation. [IFRA-ANNEX] lists five oil grades (extra, I, II, III, complete); each
    // constituent below is the highest level across them, so a rich grade is still inside.
    // None binds below the standard: estragole → 2.1%, methyl eugenol → 2.5%, benzyl cyanide
    // (prohibited as such, 0.01% notebox) → 20%, isoeugenol → 21%, benzyl benzoate → 24%.
    // The annex's "cresol (unspecified)" is carried as p-cresol, the one isomer with a
    // standard, at the annex level.
    standard: {
      percentOfProduct: 1.4, authority: 'IFRA',
      why: "IFRA's own standard for ylang ylang extracts sets 1.4% in soap (Category 9), for skin sensitisation",
    },
    constituents: [
      { substance: 'Benzyl benzoate', percentOfOil: 7.81 },
      { substance: 'Benzyl salicylate', percentOfOil: 3.35 },
      { substance: 'Farnesol', percentOfOil: 2.35 },
      { substance: 'Geraniol', percentOfOil: 1.43 },
      { substance: 'Isoeugenol', percentOfOil: 0.99 },
      { substance: 'Eugenol', percentOfOil: 0.69 },
      { substance: 'Benzyl alcohol', percentOfOil: 0.25 },
      { substance: 'Estragole', percentOfOil: 0.2 },
      { substance: 'Citral', percentOfOil: 0.12 },
      { substance: 'Isoeugenyl acetate', percentOfOil: 0.12 },
      { substance: 'Benzyl cyanide', percentOfOil: 0.05 },
      { substance: 'Methyl eugenol', percentOfOil: 0.04 },
      { substance: 'Benzyl cinnamate', percentOfOil: 0.03 },
      { substance: 'p-Cresol', percentOfOil: 0.03 },
      { substance: 'Cinnamic alcohol', percentOfOil: 0.02 },
    ],
  },
  {
    id: 'lemongrass', name: 'Lemongrass', allergens: ['Citral', 'Linalool', 'Geraniol', 'Citronellol', 'Farnesol'],
    bookDose: { percent: 3, source: 'CP:17667' },
    // [IFRA-ANNEX] lemongrass oil, West and East Indian, the higher of the two per row:
    // citral 73% (West; East lists geranial 41.4 + neral 30.5 = 72%); cap 1.2% → 1.6% of a
    // bar. The East Indian's iso-geranial and iso-neral rows have no standard of their own
    // and are not in the Citral standard's scope, so they are not counted.
    constituents: [
      { substance: 'Citral', percentOfOil: 73 },
      { substance: 'Geraniol', percentOfOil: 5.25 },
      { substance: 'Citronellal', percentOfOil: 0.51 },
      { substance: 'Isoeugenol', percentOfOil: 0.5 },
      { substance: 'Citronellol', percentOfOil: 0.25 },
      { substance: 'Citronellyl acetate', percentOfOil: 0.23 },
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
    constituents: [
      { substance: 'Cedrene', percentOfOil: 30.2 },
      { substance: 'alpha-Bisabolol', percentOfOil: 0.6 },
    ],
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
    // "cinnamon bark EO commonly has a suggested usage rate of 0.1%" (CP:9589-9590).
    bookDose: { percent: 0.1, source: 'CP:9589-9590' },
    // [IFRA-ANNEX] cinnamon bark oil (C. zeylanicum): cinnamic aldehyde 75% (cap 0.49% →
    // 0.65% of a bar); the rest sit far above it — safrole, prohibited as such and allowed as
    // a natural constituent up to 0.01% of the product by IFRA's notebox and by EU Annex
    // II/360 alike, → 5%. Leaf oil is a different material (eugenol 74%, safrole 1.2%); the
    // entry is the bark. The text puts cinnamon bark's usual suggested rate at 0.1% and
    // advises against the oil in soap outright (CP:9596-9600).
    constituents: [
      { substance: 'Cinnamal', percentOfOil: 75 },
      { substance: 'Eugenol', percentOfOil: 2 },
      { substance: 'Benzyl benzoate', percentOfOil: 0.6 },
      { substance: 'Coumarin', percentOfOil: 0.6 },
      { substance: 'o-Methoxycinnamaldehyde', percentOfOil: 0.5 },
      { substance: 'Cinnamic alcohol', percentOfOil: 0.3 },
      { substance: 'Benzaldehyde', percentOfOil: 0.2 },
      { substance: 'Safrole', percentOfOil: 0.2 },
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
 * past 100% of the product — which is no ceiling at all. A pure function of static data,
 * resolved once per entry and remembered.
 */
export function essentialOilCeiling(entry: EssentialOilEntry): EssentialOilCeiling | null {
  const cached = CEILINGS.get(entry);
  if (cached !== undefined) return cached;
  const resolved = resolveCeiling(entry);
  CEILINGS.set(entry, resolved);
  return resolved;
}
const CEILINGS = new WeakMap<EssentialOilEntry, EssentialOilCeiling | null>();

function resolveCeiling(entry: EssentialOilEntry): EssentialOilCeiling | null {
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
    const eu = EU_LAW_RINSE_OFF_LIMIT_PERCENT[c.substance];
    if (eu !== undefined) {
      candidates.push({
        percentOfProduct: eu.percent / share, authority: 'EU law', substance: c.substance,
        // Annex III sets a rinse-off limit; Annex II prohibits the substance and allows only
        // its natural trace, up to a figure in any finished product.
        why: eu.where === 'Annex III'
          ? `EU law (Annex III) caps ${word} at ${eu.percent}% of a rinse-off product and ${material} typically carries ${c.percentOfOil}% of it`
          : `EU law (Annex II) allows ${word} only as a natural trace, up to ${eu.percent}% of the finished product, and ${material} typically carries ${c.percentOfOil}% of it`,
      });
    }
  }
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => (b.percentOfProduct < a.percentOfProduct ? b : a));
  return best.percentOfProduct < 100 ? best : null;
}

/** Four-fifths of a ceiling's share of the finished soap, rounded down to the half point —
 * the room a starting dose keeps under it. The catalog test holds every ceiling on record
 * high enough for this to be at least half a point, so the sentence that describes it
 * ("rounded down to the half point") is always true of the figure. */
function roomUnder(ceilingPercentOfProduct: number): number {
  return roundScaled(0.8 * ceilingPercentOfProduct, 2, 'down');
}

/**
 * Where a dose of this oil starts, in the basis the maker types in (% of oil weight for a
 * bar, % of the finished solution for liquid soap), and why. A bar starts at the dose the
 * cold-process text itself puts on the oil, else at the start the range record gives (3%,
 * the floor of its recipes); a bottle at the record's 1% (LS:13214-13215). Where that
 * would sit at or over the oil's ceiling, it starts at four-fifths of the ceiling's share
 * of the finished soap, rounded down to the half point, instead. That figure is compared
 * across bases on purpose: a bar's dose basis is lighter than the cured bar and a bottle's
 * is the solution before its extras, so the same number typed as a dose lands further
 * under the ceiling still — and it does not move with the recipe's water, as a figure
 * solved in the dose basis would.
 */
export function essentialOilStartingDose(
  entry: EssentialOilEntry,
  process: AdditiveProcess,
): { percent: number; why: string } {
  const range = USUAL_DOSE_RANGE_PERCENT[process];
  const base =
    process === 'ls'
      ? { percent: range.start, why: lsPotentDoseClause() }
      : entry.bookDose
        ? {
            percent: entry.bookDose.percent,
            why: entry.bookDose.percent < range.low
              ? `the rate the cold-process text quotes for ${essentialOilMaterial(entry)}`
              : `what the cold-process text doses ${essentialOilMaterial(entry)} at`,
          }
        : { percent: range.start, why: "the floor of the cold-process text's bar recipes" };
  const ceiling = essentialOilCeiling(entry);
  if (!ceiling) return base;
  const room = roomUnder(ceiling.percentOfProduct);
  if (base.percent <= room) return base;
  return {
    percent: room,
    why: "well under its ceiling — four-fifths of the share of the finished soap the ceiling allows, rounded down to the half point",
  };
}
