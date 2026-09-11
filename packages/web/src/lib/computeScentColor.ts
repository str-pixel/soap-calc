// packages/web/src/lib/computeScentColor.ts
import {
  carrierOilSuperfatShift,
  colorantDispersal,
  colorantEntryById,
  COLORANT_LYE_ROUTE_PROCESSES,
  COLORANT_MIX_PROCESSES,
  colorantGrams,
  colorantStage,
  essentialOilCaution,
  essentialOilCeilingWhy,
  essentialOilEntryById,
  essentialOilSafeMaxPercentOfProduct,
  fragranceGrams,
  fragranceOverUsualRange,
  fragranceShareOfProduct,
  parsePercentOfOil,
  polysorbate20Grams,
  portionOilGrams,
  portionsTotalPercent,
  vanillaStabilizerGrams,
  vanillinBrowning,
  USUAL_DOSE_MAX_PERCENT,
  type AdditiveStage,
  type ColorantDispersal,
  type ColorantMix,
  type ColorantKind,
  type VanillinBrowning,
} from '@soap-calc/core';
import type { ProcessId } from './process';
import { colorantClaimsPortion, type ScentColor } from './scentColor';

export type ComputedFragrance = {
  key: string; catalogId: string; name: string; percent: number | null; grams: number;
  stage: AdditiveStage; caution: boolean; browning: VanillinBrowning;
  stabilizerGrams: number; polysorbateGrams: number;
  /** The oils (or, for LS, the solution) the dose was taken against — carried so pass 2
   * can turn a product-basis ceiling back into the basis the maker types in. */
  doseBasisGrams: number;
  /** The typed dose is past what a bar or a bottle usually carries (core
   * fragranceOverUsualRange) — the one verdict; the panel and the rule both read it. */
  overUsualRange: boolean;
  /** The labelling allergens this oil is known to carry, off the catalog — presence, not
   * a measured share. Empty for an oil the maker named themselves. */
  allergenNames: string[];
  /** The most of this oil the finished soap may carry (core essentialOilSafeMaxPercentOfProduct)
   * and the sentence behind it; null where the catalog has no ceiling for it. */
  safeMaxPercentOfProduct: number | null;
  ceilingWhy: string | null;
  /** The ceiling sits above anything a bar or bottle usually carries (geranium, cedarwood):
   * it is not "safe use", it is a figure nobody will reach, and the panel says so. */
  ceilingAboveUsualRange: boolean;
  /** The ceiling in the basis the maker types in, for THIS recipe — settled in the
   * compliance pass once the product weight is known; null before that. */
  safeMaxPercentOfBasis: number | null;
  shareOfProduct: number;
  /** The dose puts this oil past its ceiling — settled in the compliance pass. */
  overSafeMax: boolean;
};
export type ComputedColorant = {
  key: string; catalogId: string; name: string; kind: ColorantKind; percent: number | null; grams: number | null;
  portionKey: string; portionName: string; portionPercent: number | null;
  /** Linked to a portion that has no usable share yet — the typed dose cannot be sized. */
  portionShareMissing: boolean;
  /** The oils this colour is dosed against: the recipe's, or its portion's share of them.
   * Carried so a caller can turn a weight back into the percent that produced it without
   * re-deriving the portion arithmetic. 0 when there is nothing to dose against yet. */
  basisGrams: number;
  /** The maker sent this colour through the lye solution. */
  viaLye: boolean;
  /** What it is mixed with, once the process has had its say — everything but cold process
   * prescribes its own solvent, so it reads 'oil' there whatever was stored. */
  mixedWith: ColorantMix;
  stage: AdditiveStage; dispersal: ColorantDispersal;
};
export type ComputedScentColor = {
  fragrances: ComputedFragrance[];
  colorants: ComputedColorant[];
  portions: Array<{ key: string; name: string; percent: number | null }>;
  /** core portionsTotalPercent — the printed total and the over-100 verdict from ONE sum. */
  portionsTotalPercent: number;
  portionsOver100: boolean;
  fragranceGrams: number; stabilizerGrams: number; polysorbateGrams: number; colorantGrams: number; carrierOilGrams: number;
  extrasGrams: number;
  carrierSuperfatShiftPercent: number;
  /** Every labelling allergen the picked oils carry between them, by name, deduplicated —
   * what to expect to name on the label. Presence, not a computed share. */
  labelAllergens: Array<{ name: string }>;
  productBasis: 'label' | 'solution' | 'batch' | null;
};

/** The fragrance stage per process: at trace in a bar (CP:16777 "after trace"), after the
 * cook in HP (HP:10653), after dilution in LS (LS:2950, 3363). */
export function fragranceStageFor(process: ProcessId): AdditiveStage {
  return process === 'cp' ? 'trace' : 'after_cook';
}

/** An empty section, fully computed — for fixtures and any caller with no scent state. */
export function emptyComputedScentColor(): ComputedScentColor {
  return {
    fragrances: [], colorants: [], portions: [], portionsTotalPercent: 0, portionsOver100: false,
    fragranceGrams: 0, stabilizerGrams: 0, polysorbateGrams: 0, colorantGrams: 0, carrierOilGrams: 0,
    extrasGrams: 0, carrierSuperfatShiftPercent: 0, labelAllergens: [], productBasis: null,
  };
}

/** The empty section, one shared object: an empty scent state (every recipe's default)
 * returns this by identity, so nothing downstream re-renders for a section with no rows. */
const EMPTY_COMPUTED: ComputedScentColor = emptyComputedScentColor();


/** What the compliance shares are shares OF, in words — the Fragrance panel's note and any
 * other surface that quotes a share name it the same way. */
export function productNoun(process: ProcessId, basis: ComputedScentColor['productBasis']): string {
  if (basis === 'batch') return 'raw batch';
  return process === 'ls' ? 'finished solution' : 'finished bar';
}

/** Pass 1 — everything that depends only on the oils/solution. The finished-product
 * figures need the batch weight this pass feeds, so they come in pass 2. */
export function computeScentColorGrams(
  scent: ScentColor,
  ctx: { process: ProcessId; totalOilGrams: number; solutionGrams: number; deliveredSuperfatPercent: number | null },
): ComputedScentColor {
  if (scent.fragrances.length === 0 && scent.colorants.length === 0 && scent.portions.length === 0) return EMPTY_COMPUTED;
  const { process, totalOilGrams, solutionGrams, deliveredSuperfatPercent } = ctx;
  const basisGrams = process === 'ls' ? solutionGrams : totalOilGrams;
  const stage = fragranceStageFor(process);
  const fragrances: ComputedFragrance[] = scent.fragrances.map((f) => {
    const entry = f.catalogId ? essentialOilEntryById(f.catalogId) : undefined;
    const percent = parsePercentOfOil(f.percent);
    const grams = fragranceGrams(percent, basisGrams);
    const vanillin = parsePercentOfOil(f.vanillinPercent);
    const safeMax = entry ? essentialOilSafeMaxPercentOfProduct(entry) : null;
    return {
      key: f.key, name: f.name, percent, grams, stage,
      // The CATALOG decides for an oil that was picked from it, and the name test only for
      // one the maker named themselves — where the name is all there is to go on. Two
      // sources for one claim is how they end up disagreeing.
      caution: entry ? entry.accelerates === true : essentialOilCaution(f.name),
      browning: vanillinBrowning(vanillin),
      stabilizerGrams: vanillaStabilizerGrams(grams, vanillin),
      catalogId: f.catalogId,
      doseBasisGrams: basisGrams,
      overUsualRange: fragranceOverUsualRange(percent, process),
      allergenNames: entry ? [...entry.allergens] : [],
      safeMaxPercentOfProduct: safeMax,
      ceilingWhy: entry ? essentialOilCeilingWhy(entry) : null,
      // Product and dose bases differ by the cure loss, a factor near 1.3 for a bar and 1
      // for a bottle; every binding ceiling sits far under the usual range in either, and
      // the two that do not (geranium, cedarwood) sit far over it, so the product-basis
      // figure decides without waiting for the product weight.
      ceilingAboveUsualRange: safeMax !== null && safeMax > USUAL_DOSE_MAX_PERCENT[process],
      safeMaxPercentOfBasis: null,
      overSafeMax: false,
      polysorbateGrams: process === 'ls' ? polysorbate20Grams(grams, deliveredSuperfatPercent) : 0,
      shareOfProduct: 0,
    };
  });
  // A portion share is read raw (not through parsePercentOfOil, which caps at 100) so a typed
  // 150% is SEEN — as its own figure and in the over-100 total — rather than vanishing.
  const rawPercent = (v: string): number | null => {
    const n = Number(v.trim());
    return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  };
  const portions = scent.portions.map((p) => ({ key: p.key, name: p.name, percent: rawPercent(p.percent) }));
  const byKey = new Map(portions.map((p) => [p.key, p]));
  const colorants: ComputedColorant[] = scent.colorants.map((c) => {
    // A colour in the lye is in the pot before the oils are, so a portion cannot claim it,
    // and the route only stands where the entry and the process both offer it.
    const entry = c.catalogId ? colorantEntryById(c.catalogId) : undefined;
    const viaLye =
      c.viaLye && entry?.lyeRoute !== undefined && COLORANT_LYE_ROUTE_PROCESSES.includes(process);
    // The lye solution is the solvent on that route, so a stored mix has nothing to say.
    const mixedWith: ColorantMix =
      !viaLye && COLORANT_MIX_PROCESSES.includes(process) ? c.mixedWith : 'oil';
    // One predicate decides who can hold a share — the panel's control and the load-time
    // cleanup read the same one, so a colour cannot be shown one way and counted another.
    const portion = colorantClaimsPortion({ viaLye, mixedWith }, process) ? byKey.get(c.portionKey) : undefined;
    const percent = parsePercentOfOil(c.percent);
    // A colour linked to a portion with no usable share (blank, 0) has no oils to dose against:
    // "to shade", never the whole batter's dose under a portion heading.
    const basisGrams =
      portion === undefined
        ? portionOilGrams(totalOilGrams, null)
        : portion.percent === null
          ? 0
          : portionOilGrams(totalOilGrams, Math.min(portion.percent, 100));
    const grams = colorantGrams(percent, basisGrams);
    return {
      key: c.key, catalogId: c.catalogId, name: c.name, kind: c.kind, percent, grams,
      portionKey: portion?.key ?? '', portionName: portion?.name ?? '', portionPercent: portion?.percent ?? null,
      portionShareMissing: portion !== undefined && portion.percent === null && percent !== null,
      basisGrams,
      viaLye,
      mixedWith,
      stage: colorantStage(process, portion !== undefined, viaLye, mixedWith),
      dispersal: colorantDispersal(process, grams, portion !== undefined, viaLye, mixedWith),
    };
  });
  // Only the shares a colour actually holds are counted. A share exists BECAUSE a colour
  // asked for it, so in practice this is every portion — except where the process itself
  // refuses them: a liquid soap has no batter, its colours hold nothing, and a total (and an
  // over-100 warning) drawn from portions nothing points at would describe shares no control
  // in that process can show or reach.
  const claimed = new Set(colorants.map((c) => c.portionKey).filter(Boolean));
  const portionTotal = portionsTotalPercent(portions.filter((p) => claimed.has(p.key)));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const fragranceTotal = sum(fragrances.map((f) => f.grams));
  const stabilizerGrams = sum(fragrances.map((f) => f.stabilizerGrams));
  const polysorbateGrams = sum(fragrances.map((f) => f.polysorbateGrams));
  const colorantTotal = sum(colorants.map((c) => c.grams ?? 0));
  // Both oil methods count: a vein carries TWICE the pigment's weight in oil (1:2), which is
  // the largest single load a colour can put on the recipe — leaving it out kept it out of
  // the batch weight and out of the superfat with it.
  const carrierOilGrams = sum(
    colorants.map((c) =>
      c.dispersal.method === 'carrier-oil' || c.dispersal.method === 'vein-oil'
        ? c.dispersal.carrierGrams ?? 0
        : 0,
    ),
  );
  return {
    fragrances, colorants, portions,
    portionsTotalPercent: portionTotal.total,
    portionsOver100: portionTotal.over100,
    fragranceGrams: fragranceTotal, stabilizerGrams, polysorbateGrams, colorantGrams: colorantTotal, carrierOilGrams,
    extrasGrams: fragranceTotal + stabilizerGrams + polysorbateGrams + colorantTotal + carrierOilGrams,
    carrierSuperfatShiftPercent: carrierOilSuperfatShift(carrierOilGrams, totalOilGrams),
    labelAllergens: [],
    productBasis: null,
  };
}

/**
 * A product-basis ceiling as a percent of the DOSE basis, for this recipe. The product
 * weight carries the oil itself, so the most of it that fits is solved, not scaled: with
 * the rest of the product at R grams and a ceiling of c (a fraction), g ÷ (R + g) = c gives
 * g = c·R ÷ (1 − c); that over the dose basis is the figure the maker can type. Null until
 * the product weight is known.
 */
function ceilingInDoseBasis(f: ComputedFragrance, productGrams: number | null): number | null {
  if (f.safeMaxPercentOfProduct === null || productGrams === null || f.doseBasisGrams <= 0) return null;
  const c = f.safeMaxPercentOfProduct / 100;
  if (c <= 0 || c >= 1) return null;
  const rest = Math.max(0, productGrams - f.grams);
  const gramsAtCeiling = (c * rest) / (1 - c);
  return (100 * gramsAtCeiling) / f.doseBasisGrams;
}

/** Pass 2 — the finished-product comparisons (IFRA basis) and the allergen list. */
export function applyScentColorCompliance(
  computed: ComputedScentColor,
  productGrams: number | null,
  productBasis: 'label' | 'solution' | 'batch',
): ComputedScentColor {
  // Nothing to compare: keep the pass-1 object (identity matters to the panel's memo).
  if (computed.fragrances.length === 0) return computed;
  const product = productGrams !== null && Number.isFinite(productGrams) && productGrams > 0 ? productGrams : null;
  const fragrances = computed.fragrances.map((f) => {
    const shareOfProduct = product === null ? 0 : fragranceShareOfProduct(f.grams, product);
    // The one verdict on the ceiling, decided here where the dose is known — the panel and
    // the rule both read it.
    const overSafeMax =
      f.safeMaxPercentOfProduct !== null && shareOfProduct > 0 && shareOfProduct > f.safeMaxPercentOfProduct;
    return { ...f, shareOfProduct, overSafeMax, safeMaxPercentOfBasis: ceilingInDoseBasis(f, product) };
  });
  // Presence across every dosed oil, each name once, in the order first met.
  const seen = new Set<string>();
  const labelAllergens: Array<{ name: string }> = [];
  for (const f of fragrances) {
    if (f.grams <= 0) continue;
    for (const name of f.allergenNames) {
      const k = name.toLowerCase();
      if (!seen.has(k)) { seen.add(k); labelAllergens.push({ name }); }
    }
  }
  return { ...computed, fragrances, productBasis, labelAllergens };
}
