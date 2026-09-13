import type { SoapPropertyName } from './properties.js';

/**
 * A narrower band inside (mostly) the suggested range, for a balanced general-purpose bar.
 * A FORMULATION HINT, NEVER A PASS/FAIL RULE — nothing may compute a verdict from it. The
 * source is one author's stated preference: the books print it beside the Standard column
 * as "Preference" (CP:11636-11703, p404) and, in the hot-process printing, under the heading
 * "My Preference" (HP:4637-4664, p133). A personal preference must not decide whether a
 * maker's recipe reads as wrong; {@link SOAP_PROPERTY_GUIDE} does that.
 *
 * `longevity` is absent because the source table has no longevity row.
 *
 * It IS an inner band now that {@link SOAP_PROPERTY_GUIDE} carries the Standard column from
 * the same table — with one exception the source itself creates: creamy's Preference high
 * (50) exceeds its own Standard high (48), so a creamy score of 49 sits inside this band and
 * is still flagged out of range. Verified authorial rather than an extraction artifact; the
 * evidence is recorded in `property-guide-source.test.ts`. The properties panel names both bands in its legend, so a
 * maker meets two labelled ranges rather than two unexplained shades.
 */
export const FORMULATION_PREFERENCE_GUIDE: Partial<
  Record<SoapPropertyName, { low: number; high: number }>
> = {
  hardness: { low: 45, high: 55 },
  cleansing: { low: 10, high: 14 },
  condition: { low: 50, high: 60 },
  bubbly: { low: 20, high: 35 },
  creamy: { low: 30, high: 50 },
};

export const IODINE_GUIDE = { low: 41, high: 70 } as const;
export const INS_GUIDE = { low: 136, high: 165, ideal: 160 } as const;

/**
 * Fatty-acid % bands for general-purpose bath bars. SOURCED 2026-09-12, having shipped
 * since introduction with only "community formulation practice" to stand on: these six are
 * Kenna Cote's stated targets at Modern Soapmaking, "For a general purpose body soap, I tend
 * to follow these fatty acid ranges"
 * (https://www.modernsoapmaking.com/blog/soapcalcs-soap-quality-numbers, read 2026-09-12).
 * All six match her table exactly.
 *
 * Four of them — oleic 32-41, linoleic 7-14, linolenic 0-1, ricinoleic 4-7 — are also the
 * "most recipes" bands from her survey of 99 soapmakers' body-soap formulas
 * (https://www.modernsoapmaking.com/blog/the-most-popular-fatty-acid-profiles-in-soapmaking).
 * The two COMBINED bands are her recommendation, not that survey: the same survey's observed
 * lauric+myristic and palmitic+stearic both average about 22, below this 20-30 band's middle.
 * Other practitioners put palmitic+stearic higher still (DeeAnna Weed's "sweet spot" is
 * 30-40). Treat these as one experienced formulator's targets, which is what they are.
 *
 * DESCRIPTIVE ONLY: nothing computes a verdict from any band here (since 2026-09-13). The
 * fatty-acid panel shows each reading against its band and flags none. Rancidity is judged by
 * the formulation insights instead (dos_risk_no_antioxidant, pufa_cap_superfat,
 * high_poly_high_superfat), because the risk depends on the superfat and on whether an
 * antioxidant or chelator is present, which a fatty-acid band cannot see. The books list a
 * 15-20% polyunsaturate share as one of about ten ways to manage that risk, not as a limit
 * (CP:5516-5578, p161-163). A per-acid limit on the panel (linoleic 14, linolenic 1) flagged
 * 4 of 25 everyday bars, and any panel limit contradicted the insights on all 9 heavy
 * polyunsaturated recipes given BHT, ROE or EDTA at a 5% superfat, where the insights rightly
 * go quiet (measured on the lite catalog).
 */
export const FORMULATION_FATTY_ACID_GUIDE = {
  lauricMyristic: { low: 20, high: 30, label: 'Lauric + myristic (+C8–C10)' },
  palmiticStearic: { low: 20, high: 30, label: 'Palmitic + stearic' },
  oleic: { low: 32, high: 41, label: 'Oleic' },
  linoleic: { low: 7, high: 14, label: 'Linoleic' },
  linolenic: { low: 0, high: 1, label: 'Linolenic' },
  ricinoleic: { low: 4, high: 7, label: 'Ricinoleic' },
  // Catch-all groups for acids without a primary group — long-chain saturates (arachidic C20:0,
  // behenic C22:0, lignoceric C24:0) and the other unsaturates (palmitoleic C16:1 plus the
  // C20–C22 MUFAs/PUFAs eicosenoic/erucic/docosenoic/docosadienoic). ~0% in ordinary bath oils,
  // so "typical 0–2%" describes them honestly, and specialty oils (macadamia's palmitoleic,
  // meadowfoam, high-erucic broccoli seed) show their share here instead of silently inflating a
  // primary group. These two bands and trans's are this app's own, not Kenna Cote's.
  // A reading above them is not a fault, and no source calls it one. DeeAnna Weed writes that
  // behenic and arachidic "aren't so greatly different than stearic"; Modern Soapmaking says
  // capric, caprylic and palmitoleic acids occur "at such low quantities that they don't
  // contribute to soap qualities in a noticeable way". Flagging them caught ordinary recipes:
  // in an olive/coconut/palm base on the lite catalog, meadowfoam reads above 2% at a 3% share,
  // macadamia at 10%, moringa, karanja and sal at 21-23%, avocado at 26%.
  otherSaturated: { low: 0, high: 2, label: 'Other saturated' },
  otherUnsaturated: { low: 0, high: 2, label: 'Other unsaturated' },
  // Trans-C18:1 (elaidic) — ~0% in natural oils; a partially hydrogenated oil carries it (on
  // the lite catalog, 27.5%-hydrogenated soybean reads above 2% at a 10% share). Shown as its
  // own group so its weight isn't hidden inside the saturated total it sums into. Not a fault
  // either: each book prints a recipe built on it, "Vegetable Shortening: The Perfect Budget
  // Recipe" (CP:749, HP:643, LS:619), and a Unilever soap-bar patent credits trans fatty acids with "desirable cleaning
  // as well as the desired bar integrity and hardness" (WO2008055765A1).
  trans: { low: 0, high: 2, label: 'Trans (elaidic)' },
} as const;

/**
 * Single source of truth for the fatty-acid panel's groups: each group maps a
 * {@link FORMULATION_FATTY_ACID_GUIDE} band to the acids summed into that group. The acid lists
 * exactly partition every acid the Saturated/Unsaturated ratio counts (enforced both ways by the
 * display-groups test), so the groups always reconcile with the shown totals — no acid renders as
 * hidden weight, and none double-counts. Primary groups stay pure (oleic is oleic only, palmitic+
 * stearic is those two only) so their bands and labels stay accurate; every other tracked acid
 * lands in the honest otherSaturated/otherUnsaturated catch-alls.
 */
export const FATTY_ACID_DISPLAY_GROUPS = [
  { key: 'lauricMyristic', acids: ['lauric', 'myristic', 'caprylic', 'capric'] },
  { key: 'palmiticStearic', acids: ['palmitic', 'stearic'] },
  { key: 'oleic', acids: ['oleic'] },
  { key: 'linoleic', acids: ['linoleic'] },
  { key: 'linolenic', acids: ['linolenic'] },
  { key: 'ricinoleic', acids: ['ricinoleic'] },
  { key: 'otherSaturated', acids: ['behenic', 'arachidic', 'lignoceric'] },
  {
    key: 'otherUnsaturated',
    acids: ['palmitoleic', 'eicosenoic', 'docosenoic', 'docosadienoic', 'erucic'],
  },
  { key: 'trans', acids: ['elaidic'] },
] as const satisfies ReadonlyArray<{
  key: keyof typeof FORMULATION_FATTY_ACID_GUIDE;
  acids: readonly string[];
}>;
