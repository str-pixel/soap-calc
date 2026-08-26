/**
 * Target soap concentrations for diluted liquid soap, by what the soap is for.
 *
 * A liquid-soap recipe's dilution is the one number with no chemistry to pin it: any
 * concentration above the recipe's own minimum "works", and the right answer depends
 * entirely on the product. A hand soap and a dish soap made from the same paste want very
 * different dilutions, and diluting further is also the cheap way to stretch a batch —
 * water and a thickener cost a fraction of what the oils did.
 *
 * These are recommended ranges by intended use, expressed as % soap in the finished
 * solution (the same figure the dilution calculator takes). They are guidance, not limits:
 * every recipe also has a MINIMUM dilution set by its fatty acids (see
 * LS_MINIMUM_DILUTION_GUIDE), and a target holding more soap than that leaves the excess
 * undissolved in the pot.
 */
export type LsDilutionTarget = {
  key: string;
  /** What the soap is for. */
  label: string;
  /** Inclusive % soap in the finished solution. */
  low: number;
  high: number;
  /** Shown alongside when the range alone would mislead. */
  note?: string;
};

/**
 * No "shampoo" entry here, and deliberately so: liquid soap is not recommended for hair — the
 * alkaline pH roughens the cuticle — so a shampoo dilution target is absent rather than merely
 * unlisted. The panel says so in prose, directly under its render of this list
 * (DilutionPanel.tsx's suggested-targets note, "Liquid soap itself, thickened or not, is not
 * recommended for hair"). That note stands open on the panel now, so the absence is answered
 * on screen rather than behind a disclosure.
 */
export const LS_DILUTION_TARGETS: readonly LsDilutionTarget[] = [
  { key: 'baby', label: 'Baby or gentle soap', low: 10, high: 15 },
  { key: 'face', label: 'Face soap', low: 10, high: 15 },
  {
    key: 'foaming',
    label: 'Foaming dispenser',
    low: 10,
    high: 15,
    note: 'For an average recipe — a coconut-heavy soap is naturally thinner and can run higher.',
  },
  { key: 'body-wash', label: 'Body wash', low: 10, high: 35 },
  // "Hand soap", not "general hand soap": every row here is soap, so the qualifier only
  // separated this band from the others by being vaguer than them. The key stays `hand`.
  { key: 'hand', label: 'Hand soap', low: 15, high: 30 },
  { key: 'mechanic', label: 'Mechanic or gardener soap', low: 30, high: 35 },
  {
    key: 'dish',
    label: 'Dish soap',
    low: 35,
    high: 45,
    note: 'Or the recipe’s own minimum dilution, if it cannot dissolve this much soap.',
  },
  {
    key: 'laundry',
    label: 'Laundry soap',
    low: 35,
    high: 45,
    note: 'Or the recipe’s own minimum dilution, if it cannot dissolve this much soap.',
  },
];

/** Uses whose recommended range contains this concentration. Empty when nothing fits. */
export function lsDilutionUsesFor(
  soapConcentrationPercent: number,
): readonly LsDilutionTarget[] {
  if (!Number.isFinite(soapConcentrationPercent) || soapConcentrationPercent <= 0) return [];
  return LS_DILUTION_TARGETS.filter(
    (t) => soapConcentrationPercent >= t.low && soapConcentrationPercent <= t.high,
  );
}

/**
 * The floor, which is a property of the recipe rather than the product. Every recipe has its
 * own minimum dilution set by its fatty acids, and the failure state for a target above it
 * (more soap than the recipe dissolves) is UNDISSOLVED SOAP, not a change of viscosity: the
 * solution is supersaturated and the excess sits in the pot as lumps of paste or a thick,
 * goopy layer on top (LS:1519; LS:1524 "supersaturated and there will be remaining soap
 * paste"; LS:1610 "remaining soap pieces or a white foamy layer on top"; LS:2181 "saturated
 * and have remaining soap" — four statements, one failure state).
 *
 * An earlier revision said a soap held above the minimum "thickens or sets solid", and the
 * panel copy inherited it. The reference contradicts the "thickens" half for the very
 * recipes this guide leads with — coconut-heavy soaps are thin as milk or juice "even at
 * the minimum dilution concentration" (LS:1657) — and supports "sets" nowhere: hardening is
 * attributed to cold dilution water (LS:2277, LS:2370) or an over-large NaOH share
 * (LS:2679), never to too little water. It is also the exact belief LS:3585 names a
 * "preconceived (and incorrect) notion" (that minimum water buys a thick soap). The
 * viscosity-consequence claim must not come back in any wording; the guide's numbers are
 * unchanged and are what LS:1603/LS:1605 give.
 */
export type LsMinimumDilution = {
  key: string;
  label: string;
  /** Highest % soap this kind of recipe can fully dissolve. */
  maxSoapPercent: number;
};

export const LS_MINIMUM_DILUTION_GUIDE: readonly LsMinimumDilution[] = [
  { key: 'coconut-heavy', label: 'Coconut-heavy', maxSoapPercent: 40 },
  { key: 'combination', label: 'Most combination recipes', maxSoapPercent: 35 },
  { key: 'castile', label: 'Castile / high unsaturated', maxSoapPercent: 25 },
];

/** True when the target is above every recipe type's ceiling — no recipe dissolves this
 * much soap, so some of the paste will stay undissolved whatever the blend. */
export function lsConcentrationAboveAllMinimums(soapConcentrationPercent: number): boolean {
  if (!Number.isFinite(soapConcentrationPercent)) return false;
  return soapConcentrationPercent > LS_MINIMUM_DILUTION_GUIDE[0].maxSoapPercent;
}
