import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_OIL_CATALOG,
  essentialOilCeiling,
  essentialOilEntryById,
  essentialOilStartingDose,
} from './essential-oil-catalog.js';
import {
  EU_LAW_RINSE_OFF_LIMIT_PERCENT,
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
        const known = c.substance in IFRA_CATEGORY_NINE_PERCENT || c.substance in EU_LAW_RINSE_OFF_LIMIT_PERCENT;
        expect(known, `${e.id} → ${c.substance}`).toBe(true);
        expect(c.percentOfOil, `${e.id} → ${c.substance}`).toBeGreaterThan(0);
      }
      // and a standard typed at 0 would be silently dropped by the resolver — never allowed in
      if (e.standard) expect(e.standard.percentOfProduct, e.id).toBeGreaterThan(0);
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
    // Lemon (7-methoxycoumarin's 0.01% ÷ 0.05%) and grapefruit (2-hexenal's 0.015% ÷ 0.03%)
    // resolve to 20% and 50%: real figures, far above the range, never printed as safe use.
    expect(ceiling('lemon')).toMatchObject({ percentOfProduct: 20, substance: '7-Methoxycoumarin' });
    expect(ceiling('grapefruit')!.percentOfProduct).toBeCloseTo(50, 6);
    // and the completed lists moved no winner
    expect(ceiling('ylang-ylang')!.substance).toBeNull();
    expect(ceiling('cinnamon')!.substance).toBe('Cinnamal');
    expect(ceiling('lemongrass')!.substance).toBe('Citral');
  });

  it('carries every annex row for the oil that has a limit on record, at the annex level', () => {
    // IFRA's Annex on contributions from other sources (51st Amendment), the rows for these
    // oils, transcribed 2026-09-11: substance as the app keys it (geranial + neral → Citral,
    // α- + β-cedrene → Cedrene, the stereo prefixes dropped, "cresol (unspecified)" → the one
    // isomer with a standard), level as a percent of the oil, the highest across the grades
    // and varieties the annex lists for the oil. Rows with no standard of their own (the
    // East Indian lemongrass's iso-geranial and iso-neral) are left out on both sides.
    const ANNEX_ROWS: Record<string, Record<string, number>> = {
      lemon: { Citral: 3.5, Citronellal: 0.1, Geraniol: 0.1, '7-Methoxycoumarin': 0.05 },
      grapefruit: { Citral: 0.1, Citronellal: 0.1, '2-Hexenal': 0.03 },
      bergamot: { Citral: 0.48, Geraniol: 0.04 },
      lavender: { '1-Octen-3-yl acetate': 1.04, Geraniol: 0.48, '2-Hexenal': 0.01 },
      peppermint: { Carvone: 0.1, 'cis-3-Hexenyl isovalerate': 0.1 },
      'tea-tree': { 'Methyl eugenol': 0.05, Cedrene: 0.03 },
      geranium: { Citronellol: 21.1, Geraniol: 17.7, Citral: 0.5, 'Citronellyl acetate': 0.5, Citronellal: 0.15, 'cis-3-Hexenyl isovalerate': 0.1 },
      'ylang-ylang': {
        'Benzyl benzoate': 7.81, 'Benzyl salicylate': 3.35, Farnesol: 2.35, Geraniol: 1.43, Isoeugenol: 0.99, Eugenol: 0.69,
        'Benzyl alcohol': 0.25, Estragole: 0.2, Citral: 0.12, 'Isoeugenyl acetate': 0.12, 'Benzyl cyanide': 0.05,
        'Methyl eugenol': 0.04, 'Benzyl cinnamate': 0.03, 'p-Cresol': 0.03, 'Cinnamic alcohol': 0.02,
      },
      lemongrass: { Citral: 73, Geraniol: 5.25, Citronellal: 0.51, Isoeugenol: 0.5, Citronellol: 0.25, 'Citronellyl acetate': 0.23, Eugenol: 0.2, 'Methyl eugenol': 0.05 },
      cedarwood: { Cedrene: 30.2, 'alpha-Bisabolol': 0.6 },
      clove: { Eugenol: 82, 'Methyl eugenol': 0.1 },
      cinnamon: {
        Cinnamal: 75, Eugenol: 2, 'Benzyl benzoate': 0.6, Coumarin: 0.6, 'o-Methoxycinnamaldehyde': 0.5, 'Cinnamic alcohol': 0.3,
        Benzaldehyde: 0.2, Safrole: 0.2, Isoeugenol: 0.02,
      },
    };
    for (const e of ESSENTIAL_OIL_CATALOG) {
      const rows = ANNEX_ROWS[e.id];
      if (!rows) { expect(e.constituents, e.id).toBeUndefined(); continue; }
      const carried = Object.fromEntries((e.constituents ?? []).map((c) => [c.substance, c.percentOfOil]));
      expect(carried, e.id).toEqual(rows);
    }
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
      const limit = c.authority === 'EU law' ? EU_LAW_RINSE_OFF_LIMIT_PERCENT[c.substance].percent : IFRA_CATEGORY_NINE_PERCENT[c.substance];
      expect(c.why, e.id).toContain(`${limit}%`);
      expect(c.why, e.id).toContain(`${entry.percentOfOil}%`);
      expect(c.percentOfProduct, e.id).toBeCloseTo(limit / (entry.percentOfOil / 100), 9);
    }
    expect(ceiling('clove')!.why).toBe('EU law (Annex III) caps methyl eugenol at 0.001% of a rinse-off product and clove bud oil typically carries 0.1% of it');
    // an Annex II substance is described as what it is: a prohibited one allowed as a natural trace
    const leaf = { id: 'x', name: 'Cinnamon leaf', allergens: [], constituents: [{ substance: 'Safrole', percentOfOil: 1.2 }] };
    expect(essentialOilCeiling(leaf)).toMatchObject({ percentOfProduct: 0.01 / 0.012, authority: 'IFRA' }); // the tie goes to IFRA, pushed first
    const euOnly = { id: 'y', name: 'Test', allergens: [], constituents: [{ substance: 'Methyl eugenol', percentOfOil: 0.1 }] };
    expect(essentialOilCeiling(euOnly)!.why).toMatch(/^EU law \(Annex III\) caps methyl eugenol/);
    expect(ceiling('cinnamon')!.why).toBe('IFRA caps cinnamaldehyde at 0.49% of a soap and cinnamon bark oil is typically 75% cinnamaldehyde');
    expect(ceiling('cedarwood')!.why).toBe('IFRA caps cedrene at 2.9% of a soap and Virginian cedarwood oil is typically 30.2% cedrene');
  });

  it('no ceiling sits in the band where the product basis and the dose basis would disagree about "above the usual range"', () => {
    // The row decides "above the usual range" on the ceiling's share of the product, once,
    // so the sentence never flips as the recipe fills in; the dose basis is heavier than the
    // product by up to ~1.4× for a bar and ~1.1× for a bottle, so a ceiling between high ÷
    // 1.4 and high could read either way. None does; a future entry there fails here.
    for (const e of ESSENTIAL_OIL_CATALOG) {
      const c = essentialOilCeiling(e);
      if (!c) continue;
      const { high } = USUAL_DOSE_RANGE_PERCENT.cp;
      expect(c.percentOfProduct < high / 1.4 || c.percentOfProduct > high, e.id).toBe(true);
      const ls = USUAL_DOSE_RANGE_PERCENT.ls.high;
      expect(c.percentOfProduct < ls / 1.1 || c.percentOfProduct > ls, e.id).toBe(true);
    }
  });

  it('every ceiling on record leaves at least half a point of room, so the start\'s sentence is true of its figure', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      const c = essentialOilCeiling(e);
      if (!c) continue;
      expect(0.8 * c.percentOfProduct, e.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('the ceilings that bind sit under the usual range in the basis the maker types in', () => {
    // A representative bar: 1000 g of oils, 1300 g cured. The ceiling solved back into oil
    // weight must stay under 6%, the top of the recipes, for the row to hold the maker to it.
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

describe('where a dose starts', () => {
  const start = (id: string, process: 'cp' | 'hp' | 'ls') => essentialOilStartingDose(essentialOilEntryById(id)!, process);

  it('a bar starts at the dose the cold-process text puts on the oil, else the floor of its recipes', () => {
    expect(start('lavender', 'cp')).toMatchObject({ percent: 3 });
    expect(start('lavender', 'cp').why).toMatch(/doses lavender oil at/);
    expect(start('lemon', 'cp').percent).toBe(6);
    expect(start('tea-tree', 'hp').percent).not.toBe(5); // the book's 5% sits over tea tree's ceiling — see below
    expect(start('eucalyptus', 'cp').percent).toBe(3);
    // the text's own figure for cinnamon bark, 0.1%, is far under its ceiling and stands
    expect(start('cinnamon', 'cp')).toMatchObject({ percent: 0.1 });
    expect(start('cinnamon', 'cp').why).toMatch(/the rate the cold-process text quotes for cinnamon bark oil/);
    // no book figure: the floor of the recipes
    expect(start('rosemary', 'cp')).toEqual({ percent: 3, why: "the floor of the cold-process text's bar recipes" });
    expect(start('geranium', 'cp').percent).toBe(3);
    expect(start('cedarwood', 'cp').percent).toBe(3);
  });

  it('a ceiling the base would sit at or over pulls the start down to four-fifths of it, rounded to the half point', () => {
    expect(start('clove', 'cp')).toMatchObject({ percent: 0.5 });        // 0.8 × 1.0 → 0.5
    expect(start('clove', 'cp').why).toMatch(/^well under its ceiling — four-fifths of the share of the finished soap/);
    expect(start('lemongrass', 'cp').percent).toBe(1);                  // 0.8 × 1.64 = 1.31 → 1.0
    expect(start('ylang-ylang', 'cp').percent).toBe(1);                 // 0.8 × 1.4 = 1.12 → 1.0
    expect(start('tea-tree', 'cp').percent).toBe(0.5);                  // 0.8 × 1.0 → 0.5, not the book's 5
  });

  it('a bottle starts at 1% (LS:13214-13215), under the same ceilings', () => {
    expect(start('lavender', 'ls')).toEqual({ percent: USUAL_DOSE_RANGE_PERCENT.ls.start, why: 'most oils need only 0.5–1% of a liquid soap for a potent scent' });
    expect(start('clove', 'ls').percent).toBe(0.5);
    expect(start('cinnamon', 'ls').percent).toBe(0.5);                  // 0.8 × 0.65 = 0.52 → 0.5
    expect(start('tea-tree', 'ls').percent).toBe(0.5);
    expect(start('geranium', 'ls').percent).toBe(1);
  });

  it('every start lands under the ceiling, in a representative bar and bottle', () => {
    for (const e of ESSENTIAL_OIL_CATALOG) {
      const c = essentialOilCeiling(e);
      if (!c) continue;
      // bar: 1000 g oils, 1300 g cured — the share is the dose × 1000 ÷ 1300
      const bar = start(e.id, 'cp').percent;
      expect((bar * 1000) / (1300 + bar * 10), e.id).toBeLessThan(c.percentOfProduct);
      // bottle: 1000 g solution, polysorbate at 1:1 — the share is g ÷ (1000 + 2g)
      const bottle = start(e.id, 'ls').percent;
      const g = bottle * 10;
      expect((100 * g) / (1000 + 2 * g), e.id).toBeLessThan(c.percentOfProduct);
    }
  });
});
