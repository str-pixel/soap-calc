import { describe, expect, it } from 'vitest';
import {
  ALLERGEN_ORIGINS,
  ADDITIVE_ALLERGEN_ORIGINS,
  COLORANT_ALLERGEN_ORIGINS,
  LIQUID_ALLERGEN_ORIGINS,
  OIL_ALLERGEN_ORIGINS,
  allergenOriginsFor,
  type AllergenOrigin,
} from './allergen-origins.js';
import { COLORANT_CATALOG } from './colorant-catalog.js';
import { ALTERNATIVE_LIQUID_GUIDE } from './alternative-liquids.js';
import { ADDITIVE_CATALOG } from './additives.js';

describe('what an ingredient is made from', () => {
  it('every origin it names is one the registry defines', () => {
    const known = new Set(Object.keys(ALLERGEN_ORIGINS));
    for (const map of [OIL_ALLERGEN_ORIGINS, ADDITIVE_ALLERGEN_ORIGINS, COLORANT_ALLERGEN_ORIGINS, LIQUID_ALLERGEN_ORIGINS]) {
      for (const [id, origins] of Object.entries(map)) {
        expect(origins.length, id).toBeGreaterThan(0);
        for (const o of origins) expect(known.has(o), `${id} → ${o}`).toBe(true);
      }
    }
  });

  it('points only at ingredients the app actually offers', () => {
    for (const id of Object.keys(COLORANT_ALLERGEN_ORIGINS)) {
      expect(COLORANT_CATALOG.some((e) => e.id === id), id).toBe(true);
    }
    for (const key of Object.keys(LIQUID_ALLERGEN_ORIGINS)) {
      expect(ALTERNATIVE_LIQUID_GUIDE.some((p) => p.key === key), key).toBe(true);
    }
    for (const id of Object.keys(ADDITIVE_ALLERGEN_ORIGINS)) {
      expect(ADDITIVE_CATALOG.some((e) => e.id === id), id).toBe(true);
    }
  });

  it('carries the rule where a regulator has stated one, and no rule where none exists', () => {
    // The two with something specific said about them in COSMETICS.
    expect(ALLERGEN_ORIGINS.insect.note).toMatch(/must be named on a cosmetic label/);
    expect(ALLERGEN_ORIGINS.peanut.note).toMatch(/0\.5 ppm/);
    // Plain provenance carries no invented advice.
    expect(ALLERGEN_ORIGINS['tree-nut'].note).toBeUndefined();
    // and the one nuance worth carrying stays short: it rides on a very common oil.
    expect(ALLERGEN_ORIGINS.coconut.note!.length).toBeLessThan(110);
    expect(ALLERGEN_ORIGINS.dairy.note).toBeUndefined();
  });

  it('groups a recipe by origin, names what carries it, and keeps one order', () => {
    const hits = allergenOriginsFor([
      { name: 'Coconut Oil, 76°F', origins: ['coconut'] },
      { name: 'Almond Oil, sweet', origins: ['tree-nut'] },
      { name: 'Black walnut powder', origins: ['tree-nut'] },
      { name: 'Milk (dairy or plant)', origins: ['dairy'] },
      { name: '', origins: ['dairy'] },
    ]);
    expect(hits.map((h) => h.origin)).toEqual(['tree-nut', 'coconut', 'dairy']);
    expect(hits[0].ingredients).toEqual(['Almond Oil, sweet', 'Black walnut powder']);
    expect(hits[2].ingredients).toEqual(['Milk (dairy or plant)']);
    // the same set always reads the same way round, whatever order it arrived in
    const other = allergenOriginsFor([
      { name: 'Milk (dairy or plant)', origins: ['dairy'] },
      { name: 'Almond Oil, sweet', origins: ['tree-nut'] },
    ]);
    expect(other.map((h) => h.origin)).toEqual(['tree-nut', 'dairy']);
  });

  it('says nothing about a recipe that carries nothing', () => {
    expect(allergenOriginsFor([{ name: 'Olive Oil', origins: [] }])).toEqual([]);
    expect(allergenOriginsFor([])).toEqual([]);
  });
});
