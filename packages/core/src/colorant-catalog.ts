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
 * COLORANT_GUIDANCE. Picking a colour seeds the LOW end of its own band; a colour with no
 * defensible rate, and a custom row, start empty.
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
 *     turmeric 1/32-1 tsp PPO, spirulina up to 3 tsp PPO, charcoal up to 3 tsp PPO, nettle
 *     1-3, sage 1, spinach up to 1 TBSP (3 tsp), kelp up to 3, henna 1-2, annatto 1, and the
 *     per-clay rates (rose and red kaolin 1-3, Cambrian blue 1-2, Rhassoul 1). The same page
 *     is the source for the plant greens fading — "plant-based greens tend to be fugitive …
 *     they fade relatively quickly, especially when exposed to light" — which is where the
 *     spirulina, nettle, wheatgrass, spinach, kelp and sage verdicts come from.
 *   https://thenerdyfarmwife.com/charcoal-in-soap/ — the charcoal shade ladder, 1/8 tsp PPO
 *     light grey to 4 tsp PPO black with grey lather.
 *   https://thenovastudio.com/annatto-seed-natural-soap-colorant/ — annatto powder tested
 *     1/8 to 1 tsp per pound of oils.
 *   https://www.ivyherbal.com/articles/soap-additives-what-they-do — clay 1 tsp per pound of
 *     oils, "about 8 to 10 g in a 1,000 g oil batch": the one direct weight anchor found.
 *
 * WHERE A SOURCE GIVES ONLY A CEILING ("up to 3 tsp PPO"), the band's low end is the book's
 * own general starting rate for any colorant, 1 teaspoon per pound (CP:9389-9391) — a cited
 * figure rather than a guessed one. That covers spirulina, spinach, kelp and avocado.
 *   https://lovelygreens.com/indigo-soap-recipe-natural-blue-soap/ (under 1/2 tsp PPO),
 *     http://www.soap-making-resource.com/natural-soap-colorants.html (1/4-1/2 tsp) and the
 *     Great Cakes test below all land on 1/4-1/2 tsp PPO for ordinary indigo powder. The
 *     twelvefold outlier, https://nurturehandmade.com/products/natural-indigo-powder (3 tsp
 *     PPO), is that supplier's own concentrated grade — a different material, not a different
 *     opinion. A published side-by-side of three suppliers' indigo still found saturation
 *     genuinely differs by product, which is why the entry's note leads with testing yours.
 *   https://lovelygreens.com/make-naturally-colored-orange-soap-using-annatto-seeds/ and the
 *     alkanet section of the Lovely Greens colour guide — infusion routes, stated per pound of
 *     INFUSING oil, deliberately NOT carried as a per-pound-of-oils rate.
 *
 * SHADE LADDERS AND KEEPING, retrieved 2026-09-09. Only ladders stated per POUND OF OILS are
 * carried; several good ones are stated per pound of SOAP or per cup of batter and are not
 * comparable, so they are left out rather than converted:
 *   https://thenovastudio.com/annatto-seed-natural-soap-colorant/ — annatto 1/8 to 1 tsp PPO,
 *     lighter to deeper orange, grainy at the top.
 *   http://www.soap-making-resource.com/natural-soap-colorants.html — black walnut 1/4 tsp PPO
 *     light brown to 1/2 deep dark brown; paprika 1/2-1 TBSP PPO; indigo 1/4-1/2 tsp.
 *   https://www.greatcakessoapworks.com/handmade-soap-blog/index.php/how-to-use-indigo-to-color-cold-process-soap/
 *     — 1/2 tsp indigo through the LYE SOLUTION per 16 oz oils reads darker than a heavier
 *     oil-dispersed dose, which is why the note says the route matters as much as the dose.
 *   https://soapqueen.com/bath-and-body-tutorials/tips-and-tricks/using-madder-root-powder-color-soap/
 *     — gelled madder runs coral to brick red where ungelled runs dusty rose to mauve. Its
 *     step figures measure the 1:3 DISPERSION per pound of soap, so they are not carried.
 *   https://soapqueen.com/bath-and-body-tutorials/tips-and-tricks/turmeric-cold-process-soap-color-tests/
 *     — powder colours harder than infusion, and browns past the orange.
 *   https://www.soapmakingforum.com/threads/turmeric-soap-lost-color.83941/ — turmeric fading
 *     to cream within weeks, with the mechanism (curcumin is unstable to light, lye and heat).
 *     One site calls turmeric permanent; five practitioner reports say otherwise, so it is
 *     recorded as fading.
 *   https://lovelygreens.com/natural-purple-soap-alkanet-root/ — alkanet's grey-to-purple shift
 *     over about a week after cutting, and the ruby-red-oil test that predicts failure.
 *   https://soapqueen.com/bath-and-body-tutorials/tips-and-tricks/sunday-night-spotlight-mica-colorants/
 *     — the mica rule: what dyed the mica decides whether it survives soap pH.
 *   https://soapyfriends.com/how-long-will-natural-colors-last-in-homemade-soap/ — plant greens
 *     settling to khaki tan; the alkanet and indigo timelines.
 * Supplier names stay in these comments and out of the interface (AGENTS.md).
 */
/** One rung of a shade ladder: a dose in teaspoons per POUND OF OILS, and the colour the
 * source says it gives. Ordered lightest first. Only ladders stated against that same
 * denominator are carried — a ladder stated per cup of batter is not comparable. */
export type ColorantShade = { tspPerLb: number; colour: string };

/** What time and light do to the colour once the soap is made. */
export type ColorantStability = 'stable' | 'shifts' | 'fades';

export const COLORANT_STABILITY_TEXT: Record<ColorantStability, string> = {
  stable: 'Holds its colour: not light sensitive, and the alkali does not shift it.',
  shifts: 'Shifts over the first weeks — the colour you pour is not the colour you end up with. Prove it on a small batch before you build a design around it.',
  fades: 'Fades with time and light: expect it weaker in a few months than the day it was made.',
};

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
  /** Dose to colour, lightest first — what the maker actually wants to know. */
  shades?: readonly ColorantShade[];
  /** How the colour holds up over months. Absent where no source says. */
  stability?: ColorantStability;
  /** The additive-catalog entry that covers this material when it is dosed for a non-colour
   * purpose. Often a BUCKET: "Clay (bentonite, kaolin)", "Seeds (poppy, etc.)" and "Dried
   * botanicals, ground" each stand for many materials. */
  alsoAdditiveId?: string;
  /** Set only where that additive entry is the SAME MATERIAL, not a bucket — the one case
   * where dosing both can be called dosing one thing twice. */
  additiveIsSameMaterial?: true;
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
    // CP:9293-9310: must be tested and approved for cold process; colour can morph under
    // alkaline and high-heat conditions, and an unlabelled mica is not recommended.
    note: 'It is the dye on the mica that decides, not the mica: mineral-pigment ones hold, lake-dyed ones turn at soap pH, and a blue may come out lavender or a flat grey. Buy one labelled for cold process and prove it on a small batch. Too much of any of them stains the lather.',
    stability: 'shifts',
    shades: [
      { tspPerLb: 0.5, colour: 'pastel' },
      { tspPerLb: 1, colour: 'full depth' },
      { tspPerLb: 2, colour: 'bold' },
    ],
  },
  {
    id: 'iron-oxide', name: 'Iron oxide', kind: 'oxide', family: 'multi',
    // The band has to hold the whole family, or the note below prescribes a dose the
    // over-rate guard then flags: black sits at the bottom, a red at the top.
    tspPerLbLow: 0.25, tspPerLbHigh: 2,
    // CP:9276-9285: opaque, do not bleed, do not migrate or fade.
    // The generic pigment rate is 1 tsp PPO, but the family spans 8x: black reads at
    // 1/4-1/2 tsp PPO while a red needs 1.5-2. Colour-specific, so it goes in the note.
    note: 'Opaque and steadfast: it does not bleed, migrate or fade. The rate swings by colour — black reads at a quarter of a teaspoon where a red wants two — and too much colours the lather and the washcloth.',
    stability: 'stable',
  },
  {
    id: 'ultramarine', name: 'Ultramarine', kind: 'oxide', family: 'multi',
    tspPerLbLow: 1, tspPerLbHigh: 1,
    note: 'Opaque and steadfast, like the oxides.',
    stability: 'stable',
  },
  {
    id: 'titanium-dioxide', name: 'Titanium dioxide', kind: 'oxide', family: 'white',
    tspPerLbLow: 0.25, tspPerLbHigh: 1,
    alsoAdditiveId: 'titanium-dioxide', additiveIsSameMaterial: true,
    // The source names it as the base under a pastel soap (CP:9403), which is the same
    // fact as "it lightens what it is mixed with"; the rivers and the dulling are the
    // supplier pages cited in the header.
    note: 'An opaque, steadfast white, and the usual base under a pastel — it lightens whatever it is mixed with. It brings on glycerin rivers, more readily dispersed in water than in oil, and too much of it dulls both the bar and the lather.',
    stability: 'stable',
  },
  {
    id: 'fdc-dye', name: 'FD&C / D&C dye', kind: 'dye', family: 'multi',
    tspPerLbLow: 0.25, tspPerLbHigh: 0.25,
    // CP:9265-9276: bleeding, heat and UV unstable, not recommended for CP by the source.
    note: 'Water soluble and vivid, and the least suited of these to a bar: it creeps across a layer line, turns at soap pH, and gives up its colour in daylight.',
    stability: 'fades',
  },
  {
    id: 'neon-pigment', name: 'Neon cosmetic pigment', kind: 'other', family: 'multi',
    // Dry pigment at the bottom of the band, the weaker liquid form at the top.
    tspPerLbLow: 1, tspPerLbHigh: 3, stability: 'stable',
    // The coating is the whole story: it is what stops a bright organic colour bleeding and
    // morphing the way a bare dye does at soap pH.
    note: 'A bright pigment under a polymer coat, and the coat is why it behaves: it neither bleeds across a swirl nor turns at soap pH, where a bare dye does both. The liquid form is weaker — reckon on three times the dry rate.',
  },
  {
    id: 'lake-pigment', name: 'Lake pigment', kind: 'other', family: 'multi',
    tspPerLbLow: 0.25, tspPerLbHigh: 0.25,
    // CP:9287-9291: migrating colorants, best in single-colour soaps and melt and pour.
    note: 'A dye on an insoluble base. It migrates, so keep it to a single-colour soap.',
    stability: 'fades',
  },

  // --- Blue (CP:9339-9340) ------------------------------------------------------------
  {
    id: 'indigo', name: 'Indigo powder', kind: 'natural', family: 'blue',
    tspPerLbLow: 0.25, tspPerLbHigh: 0.5,
    note: 'Test your own product first — saturation genuinely varies between suppliers, and a concentrated grade needs a fraction of this. Past the top of that range the lather can come out blue and mark a tub or a cloth, and makers who overdo it report green rather than a deeper blue. It barely disperses in water, so it goes into the lye or into an infused oil.',
    stability: 'shifts',
  },
  { id: 'woad', name: 'Woad', kind: 'natural', family: 'blue', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'blue-cambrian-clay', name: 'Blue Cambrian clay', kind: 'natural', family: 'blue', tspPerLbLow: 1, tspPerLbHigh: 2, alsoAdditiveId: 'clay', stability: 'stable' },
  { id: 'blue-cornmeal', name: 'Blue cornmeal', kind: 'natural', family: 'blue', tspPerLbLow: null, tspPerLbHigh: null },

  // --- Green (CP:9343-9345) -----------------------------------------------------------
  {
    id: 'french-green-clay', name: 'French green clay', kind: 'natural', family: 'green',
    tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', stability: 'stable',
    // The one green that holds: every plant green in this family is fugitive, and a clay is
    // mineral. Mixed into the lye solution or into a couple of teaspoons of water first.
    note: 'The green that keeps. Every plant green here fades; this one is a mineral, so it stays where it lands. Mix it into the lye water, or into a couple of teaspoons of water, before it goes in.',
  },
  { id: 'avocado-puree', name: 'Avocado puree', kind: 'natural', family: 'green', tspPerLbLow: 1, tspPerLbHigh: 3, stability: 'fades', note: 'Starts green and usually settles at a muted yellow, faster in a bright room.' },
  { id: 'peppermint-leaf', name: 'Peppermint leaf', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null, stability: 'shifts', alsoAdditiveId: 'botanicals', note: 'If the leaves went in green they hold that green for some months, then darken.' },
  { id: 'parsley', name: 'Parsley', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null, stability: 'fades', alsoAdditiveId: 'botanicals', note: 'The quickest to go of any green here — reported gone from the bars within days.' },
  { id: 'spirulina', name: 'Spirulina', kind: 'natural', family: 'green', tspPerLbLow: 1, tspPerLbHigh: 3, note: 'Plant greens are fugitive. This one slides towards olive and ends up a khaki tan; light hurries it along and a dark cupboard holds it back. Wet it in the same weight of water before it goes in.', stability: 'fades' },
  { id: 'nettle', name: 'Nettle leaf powder', kind: 'natural', family: 'green', tspPerLbLow: 1, tspPerLbHigh: 3, stability: 'fades' },
  { id: 'wheatgrass', name: 'Wheatgrass', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null, stability: 'fades' },
  { id: 'spinach-powder', name: 'Spinach powder', kind: 'natural', family: 'green', tspPerLbLow: 1, tspPerLbHigh: 3, stability: 'fades' },
  { id: 'kelp', name: 'Kelp', kind: 'natural', family: 'green', tspPerLbLow: 1, tspPerLbHigh: 3, stability: 'fades' },
  { id: 'sage', name: 'Sage', kind: 'natural', family: 'green', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'botanicals', stability: 'fades' },
  { id: 'dandelion-root', name: 'Dandelion root', kind: 'natural', family: 'green', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'botanicals' },

  // --- Yellow and orange (CP:9356-9361) ----------------------------------------------
  { id: 'annatto', name: 'Annatto', kind: 'natural', family: 'yellow', tspPerLbLow: 0.125, tspPerLbHigh: 1, note: 'The rate above is for the powder added directly. Ground seed is coarse and many makers infuse it into an oil instead, which is a different measurement entirely.', stability: 'stable', shades: [{ tspPerLb: 0.125, colour: 'light orange, visibly grainy' }, { tspPerLb: 0.5, colour: 'orange' }, { tspPerLb: 1, colour: 'deep orange' }] },
  { id: 'turmeric', name: 'Turmeric', kind: 'natural', family: 'yellow', tspPerLbLow: 0.03, tspPerLbHigh: 1, note: 'A very little goes a long way. Premix it in oil; it does not disperse in water. Powder colours harder than an infusion but fades harder too — an infused oil holds longer.', shades: [{ tspPerLb: 0.03, colour: 'soft yellow' }, { tspPerLb: 1, colour: 'burnt orange' }], stability: 'fades' },
  { id: 'calendula', name: 'Calendula petals', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'botanicals' },
  { id: 'paprika', name: 'Paprika', kind: 'natural', family: 'yellow', tspPerLbLow: 1.5, tspPerLbHigh: 3, note: 'That rate is for the powder stirred in directly, which leaves grit and specks in the bar and hurries trace along — an infusion is the kinder route for this one.', stability: 'fades' },
  { id: 'curry-powder', name: 'Curry powder', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'yarrow', name: 'Yarrow', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'botanicals' },
  { id: 'yellow-clay', name: 'Yellow or orange clay', kind: 'natural', family: 'yellow', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', stability: 'stable' },
  { id: 'carrot-puree', name: 'Carrot puree', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'pumpkin-puree', name: 'Pumpkin puree', kind: 'natural', family: 'yellow', tspPerLbLow: null, tspPerLbHigh: null },

  // --- Red and pink (CP:9362-9363) ----------------------------------------------------
  { id: 'madder-root', name: 'Madder root', kind: 'natural', family: 'red', tspPerLbLow: 0.5, tspPerLbHigh: 2, note: 'Gel decides the hue, not just the depth: gelled runs coral to brick red, ungelled runs dusty rose to mauve, and the gap widens the more you use. Stirred in at trace rather than infused, it specks.', stability: 'stable' },
  { id: 'cochineal', name: 'Cochineal', kind: 'natural', family: 'red', tspPerLbLow: null, tspPerLbHigh: null, note: 'An insect-derived pigment — not vegan.' },
  { id: 'rhubarb-powder', name: 'Rhubarb powder', kind: 'natural', family: 'red', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'pink-kaolin', name: 'Pink kaolin clay', kind: 'natural', family: 'red', tspPerLbLow: 1, tspPerLbHigh: 3, alsoAdditiveId: 'clay', stability: 'stable', shades: [{ tspPerLb: 1, colour: 'pink' }, { tspPerLb: 3, colour: 'deeper pink' }] },
  { id: 'red-clay', name: 'Moroccan red clay', kind: 'natural', family: 'red', tspPerLbLow: 1, tspPerLbHigh: 3, alsoAdditiveId: 'clay', stability: 'stable', shades: [{ tspPerLb: 1, colour: 'soft pink-brown' }, { tspPerLb: 3, colour: 'deeper brown' }] },

  // --- Purple (CP:9364) ---------------------------------------------------------------
  { id: 'alkanet-root', name: 'Alkanet root', kind: 'natural', family: 'purple', tspPerLbLow: null, tspPerLbHigh: null, note: 'No direct rate: the powder grits and dulls, so the route with a figure behind it is an infusion — roughly three tablespoons of dried root to a pound of the oil you steep it in. Judge it before you soap. The oil should be a deep red by then; a pale or brownish one gives warm grey instead of purple, and poor-quality root does the same. Extra virgin olive oil fights the colour, so steep it in pomace. Much of what is sold as alkanet is ratanjot, which steeps brownish and gives a pale pinkish beige.', stability: 'shifts' },
  { id: 'gromwell-root', name: 'Gromwell root', kind: 'natural', family: 'purple', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'purple-clay', name: 'Brazilian purple clay', kind: 'natural', family: 'purple', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', stability: 'stable' },

  // --- Brown (CP:9341-9342) -----------------------------------------------------------
  { id: 'cinnamon', name: 'Cinnamon', kind: 'natural', family: 'brown', tspPerLbLow: 1, tspPerLbHigh: 1, note: 'A light to medium warm brown, and slightly gritty in the bar.' },
  { id: 'molasses', name: 'Molasses', kind: 'natural', family: 'brown', tspPerLbLow: 0.5, tspPerLbHigh: 1, note: 'Chocolate brown. It is a sugar, so it feeds the lather as well as colouring — and it browns further in a hot batch.' },
  { id: 'marshmallow-root', name: 'Marshmallow root', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'cocoa-powder', name: 'Cocoa powder', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'cocoa-powder', additiveIsSameMaterial: true, stability: 'stable' },
  { id: 'black-walnut', name: 'Black walnut powder', kind: 'natural', family: 'brown', tspPerLbLow: 0.25, tspPerLbHigh: 0.5, shades: [{ tspPerLb: 0.25, colour: 'light brown' }, { tspPerLb: 0.5, colour: 'deep dark brown' }] },
  { id: 'acorn-powder', name: 'Acorn powder', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null },
  { id: 'henna', name: 'Henna powder', kind: 'natural', family: 'brown', tspPerLbLow: 1, tspPerLbHigh: 2 },
  { id: 'rhassoul-clay', name: 'Rhassoul clay', kind: 'natural', family: 'brown', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', stability: 'stable' },
  {
    id: 'beet-root', name: 'Beet root', kind: 'natural', family: 'brown', tspPerLbLow: null, tspPerLbHigh: null,
    // CP:9367-9372: betalains do not survive the alkali — beet juice will not colour soap red.
    note: 'Betalains do not survive the alkali: this reads brown or tan in soap, never the red it is in the jar.',
  },

  // --- Black (CP:9346) ----------------------------------------------------------------
  { id: 'black-brazilian-clay', name: 'Black Brazilian clay', kind: 'natural', family: 'black', tspPerLbLow: 1, tspPerLbHigh: 2, alsoAdditiveId: 'clay', stability: 'stable' },
  { id: 'activated-charcoal', name: 'Activated charcoal', kind: 'natural', family: 'black', tspPerLbLow: 0.125, tspPerLbHigh: 3, alsoAdditiveId: 'charcoal', additiveIsSameMaterial: true, note: 'It marks a soap dish and a washcloth at the darker end, though it washes out.', stability: 'stable', shades: [{ tspPerLb: 0.125, colour: 'light grey' }, { tspPerLb: 0.5, colour: 'medium grey' }, { tspPerLb: 1, colour: 'dark grey, faint grey lather' }, { tspPerLb: 2, colour: 'grey-black' }, { tspPerLb: 3, colour: 'black, noticeably grey lather' }] },
  { id: 'dead-sea-mud', name: 'Dead sea mud', kind: 'natural', family: 'black', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', stability: 'stable' },
  { id: 'poppy-seeds', name: 'Poppy seeds', kind: 'natural', family: 'black', tspPerLbLow: null, tspPerLbHigh: null, alsoAdditiveId: 'seeds', note: 'Specks rather than a wash of colour, and they scrub.' },

  // --- White (CP:9365) ----------------------------------------------------------------
  { id: 'kaolin-clay', name: 'Kaolin clay', kind: 'natural', family: 'white', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', note: 'Clay pulls water out of the batter and stiffens it, so trace arrives sooner than you planned. Wet it in water before it goes in, or the bar can crack.', stability: 'stable' },
  { id: 'fullers-earth', name: "Fuller's earth", kind: 'natural', family: 'white', tspPerLbLow: 1, tspPerLbHigh: 1, alsoAdditiveId: 'clay', stability: 'stable' },
];

export function colorantEntryById(id: string): ColorantCatalogEntry | undefined {
  return COLORANT_CATALOG.find((e) => e.id === id);
}

/**
 * Whether dosing this colour AND its additive entry is dosing one material twice. Only true
 * where the additive entry names the same material; a bucket entry cannot be claimed equal
 * to the specific colour picked here, so bentonite for slip beside dead sea mud for colour
 * is two materials, not one doubled. Stated in the data, not inferred: the colorant side
 * being unique says nothing about whether the ADDITIVE side is a bucket.
 */
export function colorantSharesMaterialWithAdditive(entry: ColorantCatalogEntry): boolean {
  return entry.additiveIsSameMaterial === true;
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
  'A plant pigment has to survive the alkali, the heat of saponification and the air, and many do not. The two that catch people out are the anthocyanins in berries and the betalains in beetroot: neither keeps its colour, and both land on brown.';
