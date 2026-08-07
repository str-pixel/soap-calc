/**
 * Preservatives documented working at liquid soap's pH, with their dose ceilings.
 *
 * Why a table at all: diluted liquid soap sits at a water activity well inside the
 * microbial growth range (~0.98 diluted vs ~0.87 for the paste, which the book itself
 * places only NEAR the level that stops growth, not safely past it — LS:3176–3181), and "the
 * alkaline pH alone protects it" is a named myth (LS:1638). Only a handful of
 * preservatives hold up at pH 9–10+, and practitioner documentation (Classic Bells,
 * https://classicbells.com/soap/liquidSoapPreservative.asp) names exactly three: Suttocide
 * A, Glydant Plus, and Liquid Germall Plus (the last as an off-label use). Phenoxyethanol
 * is carried as the widely-stocked fourth with an explicit "marginal above pH 10" flag.
 *
 * DOSE BASIS. Every percentage here is % w/w of the FINISHED, READY-FOR-USE product, as
 * supplied (the bottle's own dilution included). That is also the basis of the EU Annex V
 * maxima (Reg. EC/1223/2009) — for liquid soap the finished product is the diluted
 * solution, not the paste.
 *
 * CEILINGS. `maxPct` is the hard cap the UI clamps at; `ceiling` names who set it, because
 * the clamp message must say whether exceeding it is illegal (EU) or off-spec (supplier):
 * - 'eu': the Annex V active-substance cap converted to as-supplied strength.
 * - 'supplier': the supplier's own maximum recommended use level, which binds BELOW the
 *   EU cap for that product.
 *
 * FORMALDEHYDE LABELLING. Reg. (EU) 2022/1181 requires "releases formaldehyde" on the
 * label once total released formaldehyde exceeds 0.001% (10 ppm). `formaldehydeLabel`
 * states each product's standing toward that duty — every releaser says so, in one of
 * two strengths:
 * - 'generally-required': an effective dose generally crosses the threshold (Suttocide
 *   A, Glydant Plus), so the UI states the label duty outright.
 * - 'check-threshold': the product contains a formaldehyde releaser (Liquid Germall
 *   Plus's diazolidinyl urea — uniformly listed among the releasers the 10 ppm rule
 *   catches, alongside DMDM hydantoin and imidazolidinyl urea), but no verified
 *   released-formaldehyde figure at its dose exists here, so the UI says "check", never
 *   "exempt". At the 0.5% supplier max the bottle carries ~0.198% DU — the same order
 *   of active as the Glydant dose that IS flagged — so silence would have implied an
 *   exemption that likely does not exist.
 * - 'not-a-releaser': no formaldehyde chemistry at all (phenoxyethanol); the UI stays
 *   silent because there is nothing to check.
 *
 * STAGE. All four are heat-sensitive to some degree: add after dilution, in the cool-down
 * (LS:2520). `addBelowC` carries the supplier's own figure where one exists.
 */

export type LsPreservativeId =
  | 'suttocide-a'
  | 'liquid-germall-plus'
  | 'glydant-plus'
  | 'phenoxyethanol';

/** Who set maxPct — decides whether the clamp message says "EU legal maximum" or
 * "supplier's maximum". */
export type LsPreservativeCeiling = 'eu' | 'supplier';

/** The product's standing toward the EU "releases formaldehyde" label duty
 * (Reg. (EU) 2022/1181, threshold 0.001% total released formaldehyde) — see the header's
 * FORMALDEHYDE LABELLING notes for what each value asserts and why Germall's is the
 * middle one. */
export type LsFormaldehydeLabel = 'generally-required' | 'check-threshold' | 'not-a-releaser';

export type LsPreservative = {
  id: LsPreservativeId;
  label: string;
  /** What the bottle holds — composition, as commonly supplied. */
  composition: string;
  /** Suitability at liquid soap's pH, quoting the rated range. */
  phNote: string;
  /** Supplier-typical dose, % w/w of finished product as supplied, [low, high]. */
  typicalPctRange: readonly [number, number];
  /** Seeds the dose input. Always within typicalPctRange and never above maxPct. */
  defaultPct: number;
  /** The hard ceiling, % w/w as supplied. */
  maxPct: number;
  ceiling: LsPreservativeCeiling;
  formaldehydeLabel: LsFormaldehydeLabel;
  /** Supplier's add-below temperature in °C, null where no figure is published. */
  addBelowC: number | null;
};

export const LS_PRESERVATIVES: readonly LsPreservative[] = [
  {
    // Sodium hydroxymethylglycinate (SHMG), sold as a 50% aqueous solution (Ashland's
    // Suttocide A). The anchor choice for soap pH: rated effective at pH 3.5–12, the only
    // one of the four whose RATED range contains liquid soap's 9–10+ (verified:
    // https://www.makingskincare.com/preservatives/ "3.5-12";
    // https://www.humblebeeandme.com/project/sodium-hydroxymethylglycinate/ — "usually
    // sold as a 50% solution", usage 0.5–1%, formaldehyde donor).
    // EU ceiling: Annex V/51 caps SHMG at 0.5% ACTIVE; a 50% solution therefore tops out
    // at 1.0% AS SUPPLIED. The supplier-typical 0.5–1.0% runs right up to that cap, so
    // the default sits at the ceiling. Since Reg. (EU) 2021/1902, V/51 additionally
    // conditions the RAW MATERIAL: its releasable formaldehyde must be < 0.1% w/w — a
    // supplier-side spec on the ingredient as bought, which does not move the 1.0%
    // as-supplied dose ceiling.
    id: 'suttocide-a',
    label: 'Suttocide A',
    composition: 'Sodium hydroxymethylglycinate, 50% solution',
    phNote: 'Rated pH 3.5–12 — comfortably covers soap pH',
    typicalPctRange: [0.5, 1.0],
    defaultPct: 1.0,
    maxPct: 1.0,
    ceiling: 'eu',
    formaldehydeLabel: 'generally-required',
    addBelowC: null,
  },
  {
    // Propylene glycol + diazolidinyl urea + IPBC (ISP/Ashland). Supplier maximum 0.5%
    // as supplied, added at or below 50 °C / 122 °F in the cool-down (verified:
    // https://www.wholesalesuppliesplus.com/products/germall-plus-liquid.aspx — use
    // 0.1–0.5%, add at 122 °F (50 °C) or below;
    // https://www.makingskincare.com/preservatives/ — "0.5% Cool down", pH "3-8 but can
    // be used at higher pH, for example, pH 10"). The 0.5% supplier max binds BEFORE the
    // Annex V active caps (V/46 diazolidinyl urea 0.5%, V/56 IPBC 0.02% rinse-off) at
    // this product's actives, so the ceiling is the supplier's. Soap-pH use is
    // practitioner-documented and off-label — the supplier rates it pH 3–8
    // (https://classicbells.com/soap/liquidSoapPreservative.asp names it one of the
    // three that work in high-pH lye soap, "an off-label use").
    id: 'liquid-germall-plus',
    label: 'Liquid Germall Plus',
    composition: 'Propylene glycol + diazolidinyl urea + IPBC',
    phNote: 'Rated pH 3–8; works at soap pH in practice (off-label)',
    typicalPctRange: [0.1, 0.5],
    defaultPct: 0.5,
    maxPct: 0.5,
    ceiling: 'supplier',
    formaldehydeLabel: 'check-threshold',
    addBelowC: 50,
  },
  {
    // DMDM hydantoin + IPBC (Lonza/Arxada "Glydant Plus"; the liquid grade is what a
    // soapmaker buys). Verified against Lonza's own Glydant Plus TDS
    // (https://mychem.ir/uploads/tds/32529.pdf): powder is 94–96% DMDMH + 4.5–5.5% IPBC
    // at 0.075–0.18% use, "wide pH range: 3–9", best added at 45 °C in the cool-down;
    // the LIQUID runs at twice the use level — 0.15–0.36%
    // (https://www.knowde.com/stores/arxada/products/glydant-plus-liquid). On the
    // liquid's ACTIVES the two sources disagree: the powder TDS's "twice the amount of
    // active" sentence implies ~48% DMDMH, while the Knowde listing gives DMDMH 64–72%
    // (its IPBC 2.2–2.8% does match the halving). Encoded numbers are unaffected either
    // way: the supplier's 0.36% binds well before the EU active caps at EITHER strength
    // (Annex V/33 DMDMH 0.6% → ≥0.83% as supplied even at 72%; V/56 IPBC 0.02%
    // rinse-off → ≈0.8% at ~2.5% IPBC), so the ceiling is the supplier's. NOTE: an earlier spec figure of "~55% active → ~1.09% as
    // supplied, default 0.5%, max 1.0%" described plain Glydant (55% DMDMH, no IPBC),
    // not this product; the verified Glydant Plus figures replace it. Soap-pH use is
    // practitioner-documented (classicbells.com above) — the rated range stops at 9.
    id: 'glydant-plus',
    label: 'Glydant Plus',
    composition: 'DMDM hydantoin + IPBC',
    phNote: 'Rated pH 3–9; used at soap pH in practice',
    typicalPctRange: [0.15, 0.36],
    defaultPct: 0.36,
    maxPct: 0.36,
    ceiling: 'supplier',
    formaldehydeLabel: 'generally-required',
    addBelowC: 45,
  },
  {
    // Phenoxyethanol. EU ceiling 1.0% (Annex V/29; verified
    // https://incidecoder.com/ingredients/phenoxyethanol — "can be used up to 1%
    // worldwide"). Typical 0.6–1%, rated pH 3–10
    // (https://www.makingskincare.com/preservatives/), which is exactly why it carries
    // the marginal flag: diluted liquid soap commonly sits at or above the top of that
    // range. Not a formaldehyde releaser — the one entry with nothing to check.
    id: 'phenoxyethanol',
    label: 'Phenoxyethanol',
    composition: 'Phenoxyethanol',
    phNote: 'Rated pH 3–10 — marginal above pH 10',
    typicalPctRange: [0.6, 1.0],
    defaultPct: 1.0,
    maxPct: 1.0,
    ceiling: 'eu',
    formaldehydeLabel: 'not-a-releaser',
    addBelowC: null,
  },
];

const BY_ID = new Map(LS_PRESERVATIVES.map((p) => [p.id, p]));

export function lsPreservativeById(id: LsPreservativeId): LsPreservative {
  // The map is built from the id union's own table, so this cannot miss for a
  // well-typed caller; the non-null assertion keeps the return type honest.
  return BY_ID.get(id) as LsPreservative;
}

/** The dose the calculator may actually use: the entered % clamped into
 * [0, preservative.maxPct]. `clamped` is true only when the CEILING clipped it — junk
 * (NaN, negative) resolves to a zero dose without claiming a ceiling did it, so the UI's
 * clamp message never fires over an empty or half-typed field. */
export function clampLsPreservativePct(
  pct: number,
  preservative: LsPreservative,
): { pct: number; clamped: boolean } {
  if (!Number.isFinite(pct) || pct <= 0) return { pct: 0, clamped: false };
  if (pct > preservative.maxPct) return { pct: preservative.maxPct, clamped: true };
  return { pct, clamped: false };
}

/** Grams of preservative (as supplied) for a finished-product mass at a % w/w dose.
 * Non-finite or negative inputs yield 0 — a bench figure must never print NaN. */
export function preservativeDoseGrams(finishedGrams: number, pct: number): number {
  if (!Number.isFinite(finishedGrams) || finishedGrams <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return (finishedGrams * pct) / 100;
}
