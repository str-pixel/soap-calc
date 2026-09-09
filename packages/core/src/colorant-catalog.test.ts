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
    for (const id of ['kaolin-clay', 'red-clay', 'calendula', 'poppy-seeds']) {
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
    // Pigments, from the coloring guide. The band holds the whole family: a black at the
    // bottom, a red at the top, which is what the entry's own note describes.
    expect(colorantEntryById('iron-oxide')).toMatchObject({ tspPerLbLow: 0.25, tspPerLbHigh: 2 });
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
    // it names the other denominator in words rather than shipping it as a rate
    expect(alkanet.note).toMatch(/to a pound of the oil you steep it in/i);
  });

  it('the oxide note carries the colour-by-colour spread the single rate hides', () => {
    // Black reads at 1/4-1/2 tsp PPO where a red wants 1.5-2 — an 8x spread inside one family.
    expect(colorantEntryById('iron-oxide')!.note).toMatch(/black/i);
    expect(colorantEntryById('iron-oxide')!.note).toMatch(/red/i);
  });

  it('the source warnings ride with the materials they belong to', () => {
    // Betalains do not survive the alkali (CP:9367-9372).
    expect(colorantEntryById('beet-root')!.note).toMatch(/never the red/i);
    // and the general caution names where those pigments actually end up
    expect(NATURAL_COLORANT_CAUTION).toMatch(/land on brown/i);
    // A mica must be labelled for cold process (CP:9293-9310), and the note names WHY some
    // shift: it is the dye on the mica, not the mica, that fails at soap pH.
    expect(colorantEntryById('mica')!.note).toMatch(/labelled for cold process/i);
    expect(colorantEntryById('mica')!.note).toMatch(/dye on the mica that decides/i);
    // And the general caution names both classic disappointments.
    expect(NATURAL_COLORANT_CAUTION).toMatch(/anthocyanins/i);
    expect(NATURAL_COLORANT_CAUTION).toMatch(/betalains/i);
  });

  it('the greens include one that actually holds, since every plant green fades', () => {
    const greens = COLORANT_CATALOG.filter((e) => e.family === 'green');
    expect(greens.some((e) => e.stability === 'fades')).toBe(true);
    const holds = greens.filter((e) => e.stability === 'stable');
    expect(holds.map((e) => e.id)).toEqual(['french-green-clay']);
    expect(holds[0].note).toMatch(/every plant green here fades/i);
  });

  it('the coated neon is the thing "Other" was describing, and it carries a rate', () => {
    const neon = colorantEntryById('neon-pigment')!;
    expect(neon.kind).toBe('other');
    // dry pigment at the bottom, the weaker liquid form at the top
    expect([neon.tspPerLbLow, neon.tspPerLbHigh]).toEqual([1, 3]);
    // the coating is why it behaves where a bare dye does not
    expect(neon.note).toMatch(/coat is why it behaves/i);
    expect(neon.stability).toBe('stable');
  });

  it('warns that much of what is sold as alkanet is a different root', () => {
    expect(colorantEntryById('alkanet-root')!.note).toMatch(/ratanjot/i);
  });

  it('a band whose source gives only a ceiling takes the book\'s general rate as its floor', () => {
    // "up to 3 tsp PPO" gives no low end, so the low is CP:9389-9391's 1 tsp per pound —
    // a cited figure rather than a guessed one.
    for (const id of ['spirulina']) {
      expect(colorantEntryById(id)!.tspPerLbLow).toBe(1);
      expect(colorantEntryById(id)!.tspPerLbHigh).toBe(3);
    }
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

describe('the colours that would not keep are gone', () => {
  it('drops the fading greens and the synthetic dyes the sources argue against', () => {
    // Removed on the maker's instruction: plant greens that fade out of the bar, and the
    // dyes and lakes the cold-process source itself advises against.
    for (const id of ['nettle', 'wheatgrass', 'spinach-powder', 'kelp', 'sage', 'avocado-puree', 'parsley', 'fdc-dye', 'lake-pigment']) {
      expect(colorantEntryById(id)).toBeUndefined();
    }
  });

  it('leaves a green that holds, and keeps a way to record a dye', () => {
    const greens = COLORANT_CATALOG.filter((e) => e.family === 'green');
    expect(greens.some((e) => e.stability === 'stable')).toBe(true);
    // Spirulina stays by request; it is now the only fading green left.
    expect(greens.filter((e) => e.stability === 'fades').map((e) => e.id)).toEqual(['spirulina']);
    // No dye is named any more, but the KIND survives: liquid soap steers to a
    // water-soluble dye, so a maker must still be able to record one as a custom row.
    expect(COLORANT_CATALOG.some((e) => e.kind === 'dye')).toBe(false);
  });
});

describe('the faders that stayed say how fast, where a source says', () => {
  it('turmeric and spirulina carry their own clocks', () => {
    // "after about 5 weeks it was just a dark creamy colour"
    expect(colorantEntryById('turmeric')!.note).toMatch(/around five weeks/i);
    // green through the cut and the first weeks of cure, then khaki tan
    expect(colorantEntryById('spirulina')!.note).toMatch(/first weeks of the cure/i);
  });

  it('paprika says it fades and does not invent a timeframe', () => {
    const note = colorantEntryById('paprika')!.note!;
    expect(note).toMatch(/it fades/i);
    expect(note).toMatch(/nobody puts a clock on how fast/i);
    expect(note).not.toMatch(/weeks|months/i);
  });
});
