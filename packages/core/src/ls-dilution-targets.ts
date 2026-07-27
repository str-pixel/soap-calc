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
 * LS_MINIMUM_DILUTION_GUIDE), and no target below that will stay liquid.
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
  { key: 'hand', label: 'General hand soap', low: 15, high: 30 },
  { key: 'mechanic', label: 'Mechanic or gardener soap', low: 30, high: 35 },
  {
    key: 'dish',
    label: 'Dish soap',
    low: 35,
    high: 45,
    note: 'Or the recipe’s own minimum dilution, whichever is thicker.',
  },
  {
    key: 'laundry',
    label: 'Laundry soap',
    low: 35,
    high: 45,
    note: 'Or the recipe’s own minimum dilution, whichever is thicker.',
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
 * own minimum dilution set by its fatty acids: a soap held above it thickens or sets solid.
 * These are the anchors — a target below the relevant one will not stay liquid however much
 * the intended use might want it.
 */
export type LsMinimumDilution = {
  key: string;
  label: string;
  /** Highest % soap that still stays liquid for this kind of recipe. */
  maxSoapPercent: number;
};

export const LS_MINIMUM_DILUTION_GUIDE: readonly LsMinimumDilution[] = [
  { key: 'coconut-heavy', label: 'Coconut-heavy', maxSoapPercent: 40 },
  { key: 'combination', label: 'Most combination recipes', maxSoapPercent: 35 },
  { key: 'castile', label: 'Castile / high unsaturated', maxSoapPercent: 25 },
];

/** True when the target is above every recipe type's ceiling — it cannot stay liquid. */
export function lsConcentrationAboveAllMinimums(soapConcentrationPercent: number): boolean {
  if (!Number.isFinite(soapConcentrationPercent)) return false;
  return soapConcentrationPercent > LS_MINIMUM_DILUTION_GUIDE[0].maxSoapPercent;
}

/**
 * Liquid soap is not recommended for hair: the alkaline pH roughens the cuticle, which is
 * why a "shampoo" dilution target is deliberately absent from LS_DILUTION_TARGETS rather
 * than merely unlisted.
 */
export const LS_SHAMPOO_NOT_RECOMMENDED = true;
