import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_OIL_ALLERGEN_CAUTION,
  ESSENTIAL_OIL_CATALOG,
  essentialOilEntryById,
} from './essential-oil-catalog.js';
import { essentialOilCaution } from './fragrance.js';

/** The labelling list the app declares against (Annex III, cited in fragrance.ts). Only a
 * name on this list may appear in a catalog entry — a component that is not a labelling
 * allergen has no business in a list the maker will copy onto a label. */
const ANNEX_III = new Set([
  'Amyl cinnamal', 'Benzyl alcohol', 'Cinnamyl alcohol', 'Citral', 'Eugenol',
  'Hydroxycitronellal', 'Isoeugenol', 'Amylcinnamyl alcohol', 'Benzyl salicylate',
  'Cinnamal', 'Coumarin', 'Geraniol', 'Anise alcohol', 'Benzyl cinnamate', 'Farnesol',
  'Linalool', 'Benzyl benzoate', 'Citronellol', 'Limonene', 'Methyl 2-octynoate',
  'Alpha-isomethyl ionone', 'Evernia prunastri', 'Evernia furfuracea',
  'Butylphenyl methylpropional', 'Hexyl cinnamal', 'Lilial',
]);

describe('the essential-oil catalog', () => {
  it('names only substances that are actually on the labelling list', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      for (const a of e.allergens) expect(ANNEX_III.has(a), `${e.id} → ${a}`).toBe(true);
    }
  });

  it('has unique ids and names, and no empty entry', () => {
    const ids = ESSENTIAL_OIL_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = ESSENTIAL_OIL_CATALOG.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of ESSENTIAL_OIL_CATALOG) expect(e.name.trim()).not.toBe('');
  });

  it('carries the two the cold-process text singles out, and agrees with the old name test', () => {
    for (const id of ['clove', 'cinnamon']) {
      const e = essentialOilEntryById(id)!;
      expect(e.accelerates, id).toBe(true);
      expect(e.note, id).toBeTruthy();
      // The catalog and the name-based check cannot disagree about which oils these are.
      expect(essentialOilCaution(e.name), id).toBe(true);
    }
    // and nothing else claims to accelerate
    expect(ESSENTIAL_OIL_CATALOG.filter((e) => e.accelerates).map((e) => e.id)).toEqual(['clove', 'cinnamon']);
  });

  it('a note that quotes a rule says which products the rule is about', () => {
    // Bergamot's phototoxicity limits are LEAVE-ON limits; soap is rinse-off. A note that
    // borrowed them without saying so would have the app warning about the wrong product.
    const bergamot = essentialOilEntryById('bergamot')!;
    expect(bergamot.note).toMatch(/leave-on/);
    expect(bergamot.note).toMatch(/rinse-off soap is not what they are about/);
  });

  it('says what a pre-filled list is and is not', () => {
    expect(ESSENTIAL_OIL_ALLERGEN_CAUTION).toMatch(/not a declaration/);
    expect(ESSENTIAL_OIL_ALLERGEN_CAUTION).toMatch(/supplier's allergen declaration/);
  });

  it('lists what the composition source actually shows, per oil', () => {
    // Spot checks against Molecules 2021;26(3):666 Table 3 — see the module's source block.
    expect(essentialOilEntryById('lavender')!.allergens).toEqual(['Linalool']);
    expect(essentialOilEntryById('clove')!.allergens).toEqual(['Eugenol']);
    expect(essentialOilEntryById('cinnamon')!.allergens).toContain('Cinnamal');
    expect(essentialOilEntryById('lemongrass')!.allergens).toContain('Citral');
    // An oil whose principal components carry none of them says so rather than guessing.
    expect(essentialOilEntryById('tea-tree')!.allergens).toEqual([]);
    expect(essentialOilEntryById('cedarwood')!.allergens).toEqual([]);
    // Grapefruit's furanocoumarins are NOT the labelling allergen "Coumarin".
    expect(essentialOilEntryById('grapefruit')!.allergens).not.toContain('Coumarin');
  });
});
