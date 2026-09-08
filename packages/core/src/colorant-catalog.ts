import type { ColorantKind } from './colorants.js';

/**
 * The colorant catalog: what a maker can pick instead of typing a name.
 *
 * Families and members come from the cold-process source's own colorant chapter —
 * the four manufactured classes (CP:9264-9291: dyes, pigments, lakes, micas) and the
 * natural list grouped by colour (CP:9339-9366). Behaviour notes are that chapter's
 * warnings, not invention.
 *
 * WHY SOME MATERIALS ARE ALSO ADDITIVES: the source quotes the FDA line that an additive
 * used "for purpose other than coloring", which secondarily produces colour, is not a
 * colour additive (CP:9256-9259). Clay, charcoal, cocoa and the rest are dosed under
 * Additives when they are there for slip, absorbency or scrub, and picked here when the
 * purpose is colour. `alsoAdditiveId` records that pairing so the app can say when one
 * material has been dosed twice.
 *
 * DOSE: rates are teaspoons per POUND OF OILS, read off the supplier and tutorial pages
 * cited beside each entry (all retrieved 2026-09-09). That denominator matters — the same
 * pages also quote per pound of SOAP, per pound of INFUSING oil, and per batter layer, and
 * a rate without its denominator is meaningless, so only per-pound-of-oils figures are
 * carried here. A "dispersed" teaspoon in these tutorials is a teaspoon of the DISPERSION
 * (about 1 tsp powder to 1 tbsp oil), not of powder; those figures are excluded too.
 * Weight % is not sourceable, because grams per teaspoon varies by product — see
 * COLORANT_GUIDANCE — which is why the panel's dose field starts empty.
 *
 * RATE SOURCES, all read off the page body and retrieved 2026-09-09:
 *   https://www.lovinsoap.com/wp-content/uploads/2016/06/ColoringSoap.pdf
 *     — oxides, ultramarines, micas, dyes and lakes, cosmetic pigments; defines PPO as
 *       "per pound of oil" and states 1 tsp PPO for pigments, 1/4 tsp PPO for dyes.
 *   https://nurturehandmade.com/pages/how-to-use-our-micas — mica 1/2 tsp pastel to
 *     2 tsp bold, per pound of oils.
 *   https://nurturehandmade.com/products/black-iron-oxide — black 1/4-1/2 tsp PPO.
 *   https://nurturehandmade.com/products/revolutionary-red-dye-pigment-blend — red 1.5-2 tsp PPO.
 *   https://nurturehandmade.com/products/titanium-dioxide and
 *     https://www.savvyhomemade.com/titanium-dioxide-in-soap/ — 1/4-1 tsp PPO.
 *   https://lovelygreens.com/how-to-naturally-color-handmade-soap/ — madder 1/2-2 tsp PPO,
 *     turmeric 1/32-1 tsp PPO, spirulina up to 3 tsp PPO, charcoal up to 3 tsp PPO, and the
 *     per-clay rates (rose and red kaolin 1-3, Cambrian blue 1-2, Rhassoul 1).
 *   https://thenerdyfarmwife.com/charcoal-in-soap/ — the charcoal shade ladder, 1/8 tsp PPO
 *     light grey to 4 tsp PPO black with grey lather.
 *   https://thenovastudio.com/annatto-seed-natural-soap-colorant/ — annatto powder tested
 *     1/8 to 1 tsp per pound of oils.
 *   https://www.ivyherbal.com/articles/soap-additives-what-they-do — clay 1 tsp per pound of
 *     oils, "about 8 to 10 g in a 1,000 g oil batch": the one direct weight anchor found.
 *   https://lovelygreens.com/indigo-soap-recipe-natural-blue-soap/ (under 1/2 tsp PPO) against
 *     https://nurturehandmade.com/products/natural-indigo-powder (3 tsp PPO) — the twelvefold
 *     disagreement that keeps indigo rate-free; a published side-by-side of three suppliers'
 *     indigo found the saturation genuinely differs by product.
 *   https://lovelygreens.com/make-naturally-colored-orange-soap-using-annatto-seeds/ and the
 *     alkanet section of the Lovely Greens colour guide — infusion routes, stated per pound of
 *     INFUSING oil, deliberately NOT carried as a per-pound-of-oils rate.
 * Supplier names stay in these comments and out of the interface (AGENTS.md).
 */
export type ColorantFamily =
  | 'multi' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'brown' | 'black' | 'white';

export type ColorantCatalogEntry = {
  id: string;
  name: string;
  kind: ColorantKind;
  family: ColorantFamily;
  /** The SOURCED usage rate, teaspoons per POUND OF OILS — the denominator the trade
   * states and the only one these figures share. Null where no rate is defensible:
   * indigo (order-of-magnitude disagreement, real product variation) or a material whose
   * only sourced route is an infusion. Weight % is not sourceable; see COLORANT_GUIDANCE. */
  tspPerLbLow: number | null;
  tspPerLbHigh: number | null;
  /** What the maker has to know before choosing it. Short, behaviour only. */
  note?: string;
  /** The additive-catalog id for the same material, dosed for a non-colour purpose. */
  alsoAdditiveId?: string;
};

export const COLORANT_FAMILY_LABELS: Record<ColorantFamily, string> = {
  multi: 'Any colour',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow and orange',
  red: 'Red and pink',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
  white: 'White',
};

export const COLORANT_CATALOG: readonly ColorantCatalogEntry[] = [
  // --- Manufactured classes (CP:9264-9305) -------------------------------------------
  {
    id: 'mica', name: 'Mica', kind: 'mica', family: 'multi',
    tspPerLbLow: 0.5, tspPerLbHigh: 2,
    // CP:9296-9302: must be tested and approved for cold process; colour can morph under
    // alkaline and high-heat conditions, and an unlabelled mica is not recommended.
    note: 'Use one your supplier labels as approved for cold process — colour can morph in the alkali and the heat. Too much stains the lather.',
  },
  {
    id: 'iron-oxide', name: 'Iron oxide', kind: 'oxide', family: 'multi',
    tspPerLbLow: 1, tspPerLbHigh: 1,
    // CP:9276-9285: opaque, do not bleed, do not migrate or fade.
    // The generic pigment rate is 1 tsp PPO, but the family spans 8x: black reads at
    // 1/4-1/2 tsp PPO while a red needs 1.5-2. Colour-specific, so it goes in the note.
    note: 'Opaque and steadfast: it does not bleed, migrate or fade. The rate swings by colour — black reads at a quarter of a teaspoon where a red wants two — and too much colours the lather and the washcloth.',
  },
  {
    id: 'ultramarine', name: 'Ultramarine', kind: 'oxide', family: 'multi',
    tspPerLbLow: 1, tspPerLbHigh: 1,
    note: 'Opaque and steadfast, like the oxides. Externally applied cosmetics only.',
  },
  {
    id: 'titanium-dioxide', name: 'Titanium dioxide', kind: 'oxide', family: 'white',
    tspPerLbLow: 0.25, tspPerLbHigh: 1,
    alsoAdditiveId: 'titanium-dioxide',
    note: 'An opaque, steadfast white that also lightens every colour it shares a batch with. It is prone to glycerin rivers, more so dispersed in water than in oil, and too much leaves a chalky bar and a pasty lather.',
  },
  {
    id: 'fdc-dye', name: 'FD&C / D&C dye', kind: 'dye', family: 'multi',
    tspPerLbLow: 0.25, tspPerLbHigh: 0.25,
    // CP:9269-9272: bleeding, heat and UV unstable, not recommended for CP by the source.
    note: 'Water soluble and vivid, but it bleeds between layers, morphs at soap pH and fades in light — the cold-process source advises against it in a bar.',
  },
  {
    id: 'lake-pigment', name: 'Lake pigment', kind: 'other', family: 'multi',
    tspPerLbLow: 0.25, tspPerLbHigh: 0.25,
    // CP:9287-9291: migrating colorants, best in single-colour soaps and melt and pour.
    note: 'A dye on an insoluble base. It migrates, so keep it to a single-colour soap.',
  },

  // --- Blue (CP:9339-9340) ------------------------------------------------------------
  {
    id: 'indigo', name: 'Indigo powder', kind: 'natural', family: 'blue',
    tspPerLbLow: null, tspPerLbHigh: null,
    note: 'Test your own product first. Published rates disagree by more than tenfold, and saturation genuinely varies between suppliers; too much turns the lather blue and stains cloth.',
  },
  { id: 'woad', name: 'Woad', kind: 'natural', family: 'blue', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'blue-cambrian-clay', name: 'Blue Cambrian clay', kind: 'natural', family: 'blue', tspPerLbLow: 1, tspPerLbHigh: 2, alsoAdditiveId: 'clay' },
  { id: 'blue-cornmeal', name: 'Blue cornmeal', kind: 'natural', family: 'blue', tspPerLbLow: null, tspPerLbHigh: null },

  // --- Green (CP:9343-9345) -----------------------------------------------------------
  { id: 'spirulina', name: 'Spirulina', kind: 'natural', family: 'green', tspPerLbLow: 0.5, tspPerLbHigh: 3, note: 'Plant greens are fugitive: this fades with time and light whatever the dose. Mix it into an equal weight of water first.' },
  { id: 'nettle', name: 'Nettle leaf powder', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'wheatgrass', name: 'Wheatgrass', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'spinach-powder', name: 'Spinach powder', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'kelp', name: 'Kelp', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'sage', name: 'Sage', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'botanicals' },
  { id: 'dandelion-root', name: 'Dandelion root', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'botanicals' },

  // --- Yellow and orange (CP:9356-9361) ----------------------------------------------
  { id: 'annatto', name: 'Annatto', kind: 'natural', family: 'yellow', tspPerLbLow: 0.125, tspPerLbHigh: 1, note: 'The rate above is for the powder added directly. Ground seed is coarse and many makers infuse it into an oil instead, which is a different measurement entirely.' },
  { id: 'turmeric', name: 'Turmeric', kind: 'natural', family: 'yellow', tspPerLbLow: 0.03, tspPerLbHigh: 1, note: 'A very little goes a long way — a thirty-second of a teaspoon per pound reads soft yellow, a whole one burnt orange. Premix it in oil; it does not disperse in water.' },
  { id: 'calendula', name: 'Calendula petals', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'botanicals' },
  { id: 'paprika', name: 'Paprika', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null, note: 'Can irritate skin at more than a trace.' },
  { id: 'curry-powder', name: 'Curry powder', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'yellow-clay', name: 'Yellow or orange clay', kind: 'natural', family: 'yellow', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay' },
  { id: 'carrot-puree', name: 'Carrot puree', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'pumpkin-puree', name: 'Pumpkin puree', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null },

  // --- Red and pink (CP:9362-9363) ----------------------------------------------------
  { id: 'madder-root', name: 'Madder root', kind: 'natural', family: 'red', tspPerLbLow: 0.5, tspPerLbHigh: 2, note: 'Gel changes the outcome: ungelled reads pale pink to dusky, gelled reads true pink to deep salmon. Added at trace rather than infused it leaves small speckles.' },
  { id: 'cochineal', name: 'Cochineal', kind: 'natural', family: 'red', tspPerLbLow: null, tspPerLbHigh: null, note: 'An insect-derived pigment — not vegan.' },
  { id: 'rhubarb-powder', name: 'Rhubarb powder', kind: 'natural', family: 'red', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'pink-kaolin', name: 'Pink kaolin clay', kind: 'natural', family: 'red', tspPerLbLow: 1, tspPerLbHigh: 3, alsoAdditiveId: 'clay' },
  { id: 'red-clay', name: 'Moroccan red clay', kind: 'natural', family: 'red', tspPerLbLow: 1, tspPerLbHigh: 3, alsoAdditiveId: 'clay' },

  // --- Purple (CP:9364) ---------------------------------------------------------------
  { id: 'alkanet-root', name: 'Alkanet root', kind: 'natural', family: 'purple', tspPerLbLow: null, tspPerLbHigh: null, note: 'No direct rate: added as powder it grits and dulls, so the sourced route is an infusion — around three tablespoons of dried root per pound of infusing oil. Poor-quality root reads warm grey rather than purple.' },
  { id: 'gromwell-root', name: 'Gromwell root', kind: 'natural', family: 'purple', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'purple-clay', name: 'Brazilian purple clay', kind: 'natural', family: 'purple', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay' },

  // --- Brown (CP:9341-9342) -----------------------------------------------------------
  { id: 'cocoa-powder', name: 'Cocoa powder', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'cocoa-powder' },
  { id: 'black-walnut', name: 'Black walnut powder', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'acorn-powder', name: 'Acorn powder', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'henna', name: 'Henna powder', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'rhassoul-clay', name: 'Rhassoul clay', kind: 'natural', family: 'brown', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay' },
  {
    id: 'beet-root', name: 'Beet root', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null,
    // CP:9367-9372: betalains do not survive the alkali — beet juice will not colour soap red.
    note: 'Betalains do not survive the alkali: this reads brown or tan in soap, never the red it is in the jar.',
  },

  // --- Black (CP:9346) ----------------------------------------------------------------
  { id: 'activated-charcoal', name: 'Activated charcoal', kind: 'natural', family: 'black', tspPerLbLow: 0.125, tspPerLbHigh: 1, alsoAdditiveId: 'charcoal', note: 'An eighth of a teaspoon per pound reads light grey and a whole one dark; past that it goes black and greys the lather. It marks a soap dish and a washcloth, though it washes out.' },
  { id: 'dead-sea-mud', name: 'Dead sea mud', kind: 'natural', family: 'black', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay' },
  { id: 'poppy-seeds', name: 'Poppy seeds', kind: 'natural', family: 'black', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'seeds', note: 'Specks rather than a wash of colour, and they scrub.' },

  // --- White (CP:9365) ----------------------------------------------------------------
  { id: 'kaolin-clay', name: 'Kaolin clay', kind: 'natural', family: 'white', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', note: 'Every clay drinks water and thickens the batter, so expect a faster trace. Disperse it in water first or the bar can crack.' },
  { id: 'fullers-earth', name: "Fuller's earth", kind: 'natural', family: 'white', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay' },
];

export function colorantEntryById(id: string): ColorantCatalogEntry | undefined {
  return COLORANT_CATALOG.find((e) => e.id === id);
}

/** Catalog entries grouped for the picker, in the source's own colour order. */
export const COLORANT_FAMILY_ORDER: readonly ColorantFamily[] = [
  'multi', 'white', 'black', 'blue', 'green', 'yellow', 'red', 'purple', 'brown',
];

export function colorantsByFamily(): Array<{ family: ColorantFamily; label: string; entries: ColorantCatalogEntry[] }> {
  return COLORANT_FAMILY_ORDER.map((family) => ({
    family,
    label: COLORANT_FAMILY_LABELS[family],
    entries: COLORANT_CATALOG.filter((e) => e.family === family),
  })).filter((g) => g.entries.length > 0);
}

/**
 * The general warning the source attaches to the whole natural list (CP:9367-9372): many
 * plant pigments discolour in soap through alkalinity, heat and oxidation. Anthocyanins
 * (blueberry, cherry) and betalains (beet) are the named examples — neither survives.
 */
export const NATURAL_COLORANT_CAUTION =
  'Many plant pigments do not survive soap: the alkali, the heat and the air change them. Anthocyanins and betalains are the classic disappointments — blueberry will not read blue and beet will not read red.';
