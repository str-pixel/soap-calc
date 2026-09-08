import { describe, expect, it } from 'vitest';
import { catalogEntryById } from './additives.js';
import {
  COLORANT_CATALOG,
  COLORANT_FAMILY_LABELS,
  colorantEntryById,
  colorantsByFamily,
  NATURAL_COLORANT_CAUTION,
} from './colorant-catalog.js';

describe('the colorant catalog is internally sound', () => {
  it('has unique ids and a name for every entry', () => {
    const ids = COLORANT_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(COLORANT_CATALOG.every((e) => e.name.trim() !== '')).toBe(true);
    expect(colorantEntryById('madder-root')?.name).toBe('Madder root');
    expect(colorantEntryById('nope')).toBeUndefined();
  });

  it('every alsoAdditiveId points at a real additive entry, so the two sections agree', () => {
    const dangling = COLORANT_CATALOG
      .filter((e) => e.alsoAdditiveId && !catalogEntryById(e.alsoAdditiveId))
      .map((e) => `${e.id} -> ${e.alsoAdditiveId}`);
    expect(dangling).toEqual([]);
  });

  it('a stated band runs low to high, is stated as a pair, and never claims a rate of zero', () => {
    for (const e of COLORANT_CATALOG) {
      expect(e.tspPerLbLow === null).toBe(e.tspPerLbHigh === null);
      if (e.tspPerLbLow !== null) {
        expect(e.tspPerLbLow).toBeGreaterThan(0);
        expect(e.tspPerLbHigh!).toBeGreaterThanOrEqual(e.tspPerLbLow);
      }
    }
  });

  it('carries the sourced per-pound-of-oils rates, not a converted one', () => {
    // Pigments and dyes, from the coloring guide: 1 tsp PPO, a quarter of that for dyes.
    expect(colorantEntryById('iron-oxide')).toMatchObject({ tspPerLbLow: 1, tspPerLbHigh: 1 });
    expect(colorantEntryById('fdc-dye')).toMatchObject({ tspPerLbLow: 0.25, tspPerLbHigh: 0.25 });
    // Mica runs pastel to bold.
    expect(colorantEntryById('mica')).toMatchObject({ tspPerLbLow: 0.5, tspPerLbHigh: 2 });
    // Turmeric's low end really is a thirty-second of a teaspoon.
    expect(colorantEntryById('turmeric')!.tspPerLbLow).toBeCloseTo(0.03, 2);
  });

  it('indigo carries no rate — sources disagree by more than tenfold and the material varies', () => {
    const indigo = colorantEntryById('indigo')!;
    expect(indigo.tspPerLbLow).toBeNull();
    expect(indigo.tspPerLbHigh).toBeNull();
    expect(indigo.note).toMatch(/test your own product/i);
  });

  it('a material whose only sourced route is an infusion carries no per-pound rate', () => {
    // Direct alkanet powder grits and dulls; the sourced figure is per pound of INFUSING
    // oil, a different denominator, so it is named in the note and not shipped as a rate.
    const alkanet = colorantEntryById('alkanet-root')!;
    expect(alkanet.tspPerLbLow).toBeNull();
    expect(alkanet.note).toMatch(/infusion/i);
    expect(alkanet.note).toMatch(/per pound of infusing oil/i);
  });

  it('the oxide note carries the colour-by-colour spread the single rate hides', () => {
    // Black reads at 1/4-1/2 tsp PPO where a red wants 1.5-2 — an 8x spread inside one family.
    expect(colorantEntryById('iron-oxide')!.note).toMatch(/black/i);
    expect(colorantEntryById('iron-oxide')!.note).toMatch(/red/i);
  });

  it('the source warnings ride with the materials they belong to', () => {
    // Betalains do not survive the alkali (CP:9367-9372).
    expect(colorantEntryById('beet-root')!.note).toMatch(/never the red/i);
    // A mica must be labelled for cold process (CP:9296-9302).
    expect(colorantEntryById('mica')!.note).toMatch(/approved for cold process/i);
    // Dyes bleed and are unstable; the source advises against them (CP:9269-9272).
    expect(colorantEntryById('fdc-dye')!.note).toMatch(/bleeds/i);
    // And the general caution names both classic disappointments.
    expect(NATURAL_COLORANT_CAUTION).toMatch(/anthocyanins/i);
    expect(NATURAL_COLORANT_CAUTION).toMatch(/betalains/i);
  });

  it('groups for the picker: every group is non-empty, labelled, and holds every entry once', () => {
    const groups = colorantsByFamily();
    expect(groups.every((g) => g.entries.length > 0)).toBe(true);
    expect(groups.every((g) => g.label === COLORANT_FAMILY_LABELS[g.family])).toBe(true);
    expect(groups.flatMap((g) => g.entries).length).toBe(COLORANT_CATALOG.length);
    // The manufactured classes lead, the way the source presents them.
    expect(groups[0].family).toBe('multi');
    expect(groups[0].entries.map((e) => e.id)).toContain('mica');
  });
});
