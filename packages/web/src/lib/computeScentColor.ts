// packages/web/src/lib/computeScentColor.ts
import {
  allergensToLabel,
  carrierOilSuperfatShift,
  colorantDispersal,
  colorantEntryById,
  COLORANT_LYE_ROUTE_PROCESSES,
  COLORANT_MIX_PROCESSES,
  colorantGrams,
  colorantStage,
  essentialOilCaution,
  fragranceGrams,
  fragranceOverSupplierMax,
  fragranceShareOfProduct,
  parsePercentOfOil,
  polysorbate20Grams,
  portionOilGrams,
  portionsTotalPercent,
  vanillaStabilizerGrams,
  vanillinBrowning,
  type AdditiveStage,
  type ColorantDispersal,
  type ColorantMix,
  type ColorantKind,
  type LabelAllergen,
  type VanillinBrowning,
} from '@soap-calc/core';
import type { ProcessId } from './process';
import { colorantClaimsPortion, type ScentColor } from './scentColor';

export type ComputedFragrance = {
  key: string; name: string; percent: number | null; grams: number;
  stage: AdditiveStage; caution: boolean; browning: VanillinBrowning;
  stabilizerGrams: number; polysorbateGrams: number; supplierMaxPercent: number | null;
  /** The declarations as typed, parsed; the compliance pass turns them into labelAllergens. */
  allergens: Array<{ name: string; percentOfFragrance: number | null }>;
  shareOfProduct: number; overSupplierMax: boolean;
};
export type ComputedColorant = {
  key: string; catalogId: string; name: string; kind: ColorantKind; percent: number | null; grams: number | null;
  portionKey: string; portionName: string; portionPercent: number | null;
  /** Linked to a portion that has no usable share yet — the typed dose cannot be sized. */
  portionShareMissing: boolean;
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
  labelAllergens: LabelAllergen[];
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

const positiveOrNull = (n: number | null): number | null => (n !== null && n > 0 ? n : null);

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
    const percent = parsePercentOfOil(f.percent);
    const grams = fragranceGrams(percent, basisGrams);
    const vanillin = parsePercentOfOil(f.vanillinPercent);
    return {
      key: f.key, name: f.name, percent, grams, stage,
      caution: essentialOilCaution(f.name),
      browning: vanillinBrowning(vanillin),
      stabilizerGrams: vanillaStabilizerGrams(grams, vanillin),
      allergens: f.allergens.map((a) => ({ name: a.name, percentOfFragrance: parsePercentOfOil(a.percentOfFragrance) })),
      polysorbateGrams: process === 'ls' ? polysorbate20Grams(grams, deliveredSuperfatPercent) : 0,
      // 0 is "no rate" (core fragranceOverSupplierMax says so): read it as unentered, so the
      // prompt fires instead of every check going quiet.
      supplierMaxPercent: positiveOrNull(parsePercentOfOil(f.supplierMaxPercent)),
      shareOfProduct: 0,
      overSupplierMax: false,
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
      viaLye,
      mixedWith,
      stage: colorantStage(process, portion !== undefined, viaLye, mixedWith),
      dispersal: colorantDispersal(process, grams, portion !== undefined, viaLye, mixedWith),
    };
  });
  const portionTotal = portionsTotalPercent(portions);
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
    return { ...f, shareOfProduct, overSupplierMax: fragranceOverSupplierMax(shareOfProduct, f.supplierMaxPercent) };
  });
  const labelAllergens = product === null ? [] : allergensToLabel(
    fragrances.flatMap((f) => f.allergens.flatMap((a) =>
      a.percentOfFragrance === null ? [] : [{ name: a.name, percentOfFragrance: a.percentOfFragrance, fragranceGrams: f.grams }],
    )),
    product,
  );
  return { ...computed, fragrances, productBasis, labelAllergens };
}
