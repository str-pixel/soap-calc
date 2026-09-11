import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_OIL_ALLERGEN_CAUTION,
  ESSENTIAL_OIL_CATALOG,
  essentialOilCeilingWhy,
  essentialOilEntryById,
  essentialOilSafeMaxPercentOfProduct,
} from './essential-oil-catalog.js';
import { essentialOilCaution, USUAL_DOSE_MAX_PERCENT } from './fragrance.js';

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

describe('each oil\'s ceiling in soap, % of the finished product', () => {
  const ceiling = (id: string) => essentialOilSafeMaxPercentOfProduct(essentialOilEntryById(id)!);

  it('every ceiling on record resolves to a figure — a constituent named without a limit is a data error', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      if (!e.ceiling) continue;
      const c = essentialOilSafeMaxPercentOfProduct(e);
      expect(c, e.id).not.toBeNull();
      expect(c!, e.id).toBeGreaterThan(0);
      expect(essentialOilCeilingWhy(e), e.id).toBeTruthy();
    }
  });

  it('pins the figures to their primary sources (IFRA 51st Amendment, IFRA Annex, SCCS/1681/25)', () => {
    // Clove: EU law's 0.001% methyl eugenol ÷ IFRA's typical 0.1% in clove bud oil → 1.0%.
    // Eugenol alone (4.9% ÷ 82%) would have allowed 6.0%; the trace binds first.
    expect(ceiling('clove')).toBeCloseTo(1.0, 6);
    // Cinnamon bark: cinnamic aldehyde 0.49% ÷ 75%.
    expect(ceiling('cinnamon')).toBeCloseTo(0.6533, 3);
    // Lemongrass: citral 1.2% ÷ 73%.
    expect(ceiling('lemongrass')).toBeCloseTo(1.6438, 3);
    // Ylang ylang: the oil's own standard, STD 084, Category 9.
    expect(ceiling('ylang-ylang')).toBe(1.4);
    // Tea tree: the SCCS's shower-gel figure; IFRA has no standard for the oil.
    expect(ceiling('tea-tree')).toBe(1.0);
    // Geranium (geraniol 2.8% ÷ 17.7%) and Virginian cedarwood (cedrene 2.9% ÷ 30.2%) have
    // ceilings, but above anything a bar carries — the app must not print them as "safe use".
    expect(ceiling('geranium')).toBeCloseTo(15.82, 1);
    expect(ceiling('cedarwood')).toBeCloseTo(9.60, 1);
  });

  it('an oil with no restricted constituent at a level that bites has no ceiling', () => {
    for (const id of ['lavender', 'rosemary', 'peppermint', 'eucalyptus', 'patchouli', 'lemon', 'sweet-orange', 'grapefruit', 'bergamot']) {
      expect(essentialOilEntryById(id)!.ceiling, id).toBeUndefined();
      expect(ceiling(id), id).toBeNull();
    }
  });

  it('the sentence behind each ceiling names its authority and no supplier', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      if (!e.ceiling) continue;
      const why = e.ceiling.why;
      expect(why, e.id).toMatch(/IFRA|EU law|scientific committee/);
      expect(why, e.id).not.toMatch(/supplier/i);
      // The sentence is spliced after "Up to X% —" and "X% is its ceiling —": no full stop of its own.
      expect(why, e.id).not.toMatch(/\.$/);
    }
  });

  it('the ceilings that bind are all under the usual range, so the row can hold the maker to them', () => {
    // 6% of oil weight is ~4.7% of a cured bar; every binding ceiling sits well under it.
    for (const id of ['clove', 'cinnamon', 'lemongrass', 'ylang-ylang', 'tea-tree']) {
      expect(ceiling(id)!, id).toBeLessThan(USUAL_DOSE_MAX_PERCENT.cp);
    }
  });
});
