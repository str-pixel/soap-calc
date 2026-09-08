import { describe, expect, it } from 'vitest';
import { catalogEntryById } from './additives.js';
import {
  COLORANT_CATALOG,
  COLORANT_FAMILY_LABELS,
  colorantEntryById,
  colorantsByFamily,
  colorantSharesMaterialWithAdditive,
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

  it('names exactly which pairings are one material, and which are buckets', () => {
    const oneToOne = COLORANT_CATALOG.filter(colorantSharesMaterialWithAdditive).map((e) => e.id);
    // Only these are the same jar under both sections; the rest pair with a BUCKET additive
    // entry ("Clay (bentonite, kaolin)", "Seeds (poppy, etc.)", "Dried botanicals, ground")
    // and must never be claimed equal — poppy seeds is the trap, unique here but a bucket there.
    expect(oneToOne.sort()).toEqual(['activated-charcoal', 'cocoa-powder', 'titanium-dioxide']);
    for (const id of ['kaolin-clay', 'red-clay', 'sage', 'poppy-seeds']) {
      expect(colorantSharesMaterialWithAdditive(colorantEntryById(id)!)).toBe(false);
    }
    // A colorant with no additive pairing at all is never a match.
    expect(colorantSharesMaterialWithAdditive(colorantEntryById('madder-root')!)).toBe(false);
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

  it('indigo carries the rate three independent sources agree on, and the caveat that made it hard', () => {
    // The first pass saw a 12x spread and shipped no rate. A second pass found three fetched
    // sources clustering at 1/4-1/2 tsp per pound of oils; the outlier was ONE supplier's own
    // concentrated grade, not a disagreement about ordinary indigo powder.
    const indigo = colorantEntryById('indigo')!;
    expect([indigo.tspPerLbLow, indigo.tspPerLbHigh]).toEqual([0.25, 0.5]);
    expect(indigo.note).toMatch(/test your own product/i);
    expect(indigo.note).toMatch(/concentrated grade/i);
    // It changes in both directions over time, so it is a shift, not a fade.
    expect(indigo.stability).toBe('shifts');
  });

  it('the keeping verdicts follow the sources, including where they overturned a guess', () => {
    // Turmeric was the contested one: a single site called it permanent, five practitioner
    // reports said it fades to cream within weeks. The majority wins.
    expect(colorantEntryById('turmeric')!.stability).toBe('fades');
    expect(colorantEntryById('annatto')!.stability).toBe('stable');
    expect(colorantEntryById('madder-root')!.stability).toBe('stable');
    // Alkanet does not fade first — it arrives grey and turns purple over the cure.
    expect(colorantEntryById('alkanet-root')!.stability).toBe('shifts');
    expect(colorantEntryById('spirulina')!.stability).toBe('fades');
    expect(colorantEntryById('iron-oxide')!.stability).toBe('stable');
    // Silence where no source gave an answer, rather than a guess.
    expect(colorantEntryById('calendula')!.stability).toBeUndefined();
    expect(colorantEntryById('carrot-puree')!.stability).toBeUndefined();
  });

  it('every shade ladder is ordered lightest first and stays inside its own dose band', () => {
    for (const e of COLORANT_CATALOG) {
      if (!e.shades?.length) continue;
      const doses = e.shades.map((r) => r.tspPerLb);
      expect(doses).toEqual([...doses].sort((a, b) => a - b));
      expect(e.shades.every((r) => r.colour.trim() !== '')).toBe(true);
      // A ladder without a band, or reaching past it, would contradict the guidance line.
      expect(e.tspPerLbLow).not.toBeNull();
      expect(doses[0]).toBeGreaterThanOrEqual(e.tspPerLbLow!);
      expect(doses[doses.length - 1]).toBeLessThanOrEqual(e.tspPerLbHigh!);
    }
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
    // A mica must be labelled for cold process (CP:9296-9302), and the note names WHY some
    // shift: it is the dye on the mica, not the mica, that fails at soap pH.
    expect(colorantEntryById('mica')!.note).toMatch(/labels for cold process/i);
    expect(colorantEntryById('mica')!.note).toMatch(/what dyed it/i);
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
