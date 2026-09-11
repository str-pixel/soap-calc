import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_OIL_CATALOG,
  essentialOilCeiling,
  essentialOilEntryById,
} from './essential-oil-catalog.js';
import {
  EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT,
  essentialOilCaution,
  fragranceDoseAtCeiling,
  IFRA_CATEGORY_NINE_PERCENT,
  USUAL_DOSE_RANGE_PERCENT,
} from './fragrance.js';

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
  const ceiling = (id: string) => essentialOilCeiling(essentialOilEntryById(id)!);

  it('every constituent named in the catalog has a limit on record — a name without one is a data error', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      for (const c of e.constituents ?? []) {
        const known = c.substance in IFRA_CATEGORY_NINE_PERCENT || c.substance in EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT;
        expect(known, `${e.id} → ${c.substance}`).toBe(true);
        expect(c.percentOfOil, `${e.id} → ${c.substance}`).toBeGreaterThan(0);
      }
    }
  });

  it('pins the figures to their primary sources (IFRA 51st Amendment, IFRA Annex, SCCS/1681/25)', () => {
    // Clove: EU law's 0.001% methyl eugenol ÷ IFRA's typical 0.1% in clove bud oil → 1.0%.
    // Eugenol alone (4.9% ÷ 82%) would have allowed 6.0%; the trace binds first, and the
    // resolver — not a typed flag — says which table and which constituent won.
    expect(ceiling('clove')).toMatchObject({ percentOfProduct: 1.0, authority: 'EU law', substance: 'Methyl eugenol' });
    // Cinnamon bark: cinnamic aldehyde 0.49% ÷ 75%.
    expect(ceiling('cinnamon')!.percentOfProduct).toBeCloseTo(0.6533, 3);
    expect(ceiling('cinnamon')).toMatchObject({ authority: 'IFRA', substance: 'Cinnamal' });
    // Lemongrass: citral 1.2% ÷ 73%.
    expect(ceiling('lemongrass')!.percentOfProduct).toBeCloseTo(1.6438, 3);
    expect(ceiling('lemongrass')!.substance).toBe('Citral');
    // Ylang ylang: the oil's own standard, STD 084, Category 9 — under every constituent's figure.
    expect(ceiling('ylang-ylang')).toMatchObject({ percentOfProduct: 1.4, authority: 'IFRA', substance: null });
    // Tea tree: the SCCS's shower-gel figure, under the EU methyl-eugenol figure (2.0%).
    expect(ceiling('tea-tree')).toMatchObject({ percentOfProduct: 1.0, authority: 'SCCS', substance: null });
    // Geranium (geraniol 2.8% ÷ 17.7%) and Virginian cedarwood (cedrene 2.9% ÷ 30.2%) have
    // ceilings, but above anything a bar carries — the panel must not print them as "safe use".
    expect(ceiling('geranium')!.percentOfProduct).toBeCloseTo(15.82, 1);
    expect(ceiling('cedarwood')!.percentOfProduct).toBeCloseTo(9.60, 1);
  });

  it('a figure at or past 100% of the product is no ceiling at all', () => {
    // Lavender's geraniol would "cap" it at 583%, peppermint's carvone at 180%, bergamot's
    // citral at 250%: null, not a number nobody can reach.
    for (const id of ['lavender', 'peppermint', 'bergamot']) {
      expect(essentialOilEntryById(id)!.constituents?.length, id).toBeGreaterThan(0);
      expect(ceiling(id), id).toBeNull();
    }
    // and an oil IFRA's annex does not list has nothing to resolve
    for (const id of ['rosemary', 'eucalyptus', 'patchouli', 'sweet-orange']) {
      expect(essentialOilEntryById(id)!.constituents, id).toBeUndefined();
      expect(ceiling(id), id).toBeNull();
    }
  });

  it('the sentence behind a derived ceiling is built from the entry\'s own numbers', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      const c = essentialOilCeiling(e);
      if (!c) continue;
      expect(c.why, e.id).toMatch(/IFRA|EU law|scientific committee/);
      expect(c.why, e.id).not.toMatch(/supplier/i);
      // Spliced after "Up to X% —" and "X% is its ceiling —": no full stop of its own.
      expect(c.why, e.id).not.toMatch(/\.$/);
      if (c.substance === null) continue;
      const entry = e.constituents!.find((x) => x.substance === c.substance)!;
      const limit = c.authority === 'EU law' ? EU_ANNEX_III_RINSE_OFF_LIMIT_PERCENT[c.substance] : IFRA_CATEGORY_NINE_PERCENT[c.substance];
      expect(c.why, e.id).toContain(`${limit}%`);
      expect(c.why, e.id).toContain(`${entry.percentOfOil}%`);
      expect(c.percentOfProduct, e.id).toBeCloseTo(limit / (entry.percentOfOil / 100), 9);
    }
    expect(ceiling('clove')!.why).toBe('EU law (Annex III) caps methyl eugenol at 0.001% of a rinse-off product and clove bud oil typically carries 0.1% of it');
    expect(ceiling('cinnamon')!.why).toBe('IFRA caps cinnamaldehyde at 0.49% of a soap and cinnamon bark oil is typically 75% cinnamaldehyde');
    expect(ceiling('cedarwood')!.why).toBe('IFRA caps cedrene at 2.9% of a soap and Virginian cedarwood oil is typically 30.2% cedrene');
  });

  it('the ceilings that bind sit under the usual range in the basis the maker types in', () => {
    // A representative bar: 1000 g of oils, 1300 g cured. The ceiling solved back into oil
    // weight must stay under 6% for the row to hold the maker to it as "safe use".
    for (const id of ['clove', 'cinnamon', 'lemongrass', 'ylang-ylang', 'tea-tree']) {
      const dose = fragranceDoseAtCeiling(ceiling(id)!.percentOfProduct, 1300, 0, 0, 1000)!;
      expect(dose, id).toBeLessThan(USUAL_DOSE_RANGE_PERCENT.cp.high);
    }
    for (const id of ['geranium', 'cedarwood']) {
      const dose = fragranceDoseAtCeiling(ceiling(id)!.percentOfProduct, 1300, 0, 0, 1000)!;
      expect(dose, id).toBeGreaterThan(USUAL_DOSE_RANGE_PERCENT.cp.high);
    }
  });
});
