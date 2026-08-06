import { describe, expect, it } from 'vitest';
import { catalogEntryById, effectiveCatalogEntry } from './additives.js';
import { troubleshootingFor } from './troubleshooting.js';

describe('troubleshootingFor', () => {
  it('provides at least three troubleshooting entries per process, each with symptom/cause/fix', () => {
    for (const p of ['cp', 'hp', 'ls'] as const) {
      const entries = troubleshootingFor(p);
      expect(entries.length).toBeGreaterThanOrEqual(3);
      for (const e of entries) {
        expect(e.symptom).toBeTruthy();
        expect(e.cause).toBeTruthy();
        expect(e.fix).toBeTruthy();
      }
    }
  });

  it('blames a gelled/stringy LS dilution on sodium soaps or over-thickening — not on the dilution water', () => {
    // The two causes the reference actually gives: too high a NaOH share in a recipe heavy
    // in stearic/palmitic (those sodium soaps set to a semi-solid gel as the soap sits), and
    // salt or another thickener pushed past the peak of the salt curve. Low lauric/myristic
    // recipes are the most prone.
    //
    // Two earlier revisions of this entry both diagnosed the dilution water and disagreed
    // only about the direction — "over-diluted, use less", then "not enough water, add
    // more". Neither is what makes a soap gel. Diluting a paste before saponification
    // finishes IS a real fault, but it shows up as the oily layer in the next entry, not as
    // a gel, so it must not be smuggled back in here either.
    const gel = troubleshootingFor('ls').find((e) => /stringy|gelatin/i.test(e.symptom));
    expect(gel).toBeDefined();
    expect(gel!.cause).toMatch(/naoh|sodium/i);
    expect(gel!.cause).toMatch(/stearic|palmitic/i);
    expect(gel!.cause).toMatch(/salt|thicken/i);
    expect(gel!.fix).toMatch(/naoh|sodium/i);
    expect(gel!.fix).toMatch(/salt/i);
    expect(gel!.cause).not.toMatch(/over-?dilut/i);
    expect(gel!.fix).not.toMatch(/less water/i);
  });

  it('also names the over-concentration cause the app’s own dilution guide asserts', () => {
    // A too-concentrated dilution IS a water-side cause of this symptom — the entry used to
    // deny that path entirely by opening "not the water". The NaOH/stearic-palmitic cause
    // stays the LEAD cause; this is additive, not a replacement.
    const gel = troubleshootingFor('ls').find((e) => /stringy|gelatin/i.test(e.symptom))!;
    expect(gel.cause).toMatch(/maximum concentration|ceiling/i);
    expect(gel.fix).toMatch(/add water/i);
    // Still must not reintroduce the inverted "add water / less water" fix as the ONLY
    // remedy, and must not smuggle back the flatly wrong "not the water" denial.
    expect(gel.fix).not.toMatch(/less water/i);
  });

  it('describes the over-concentration path as undissolved soap, not as the soap setting', () => {
    // The concentration clause used to say a soap held above its ceiling "sets too" — a
    // claim inherited from LS_MINIMUM_DILUTION_GUIDE's old doc comment and supported
    // nowhere: the reference's below-minimum failure is supersaturation with soap left
    // over — lumps of undiluted paste or a thick, goopy layer on top (LS:1519, LS:1524,
    // LS:1610, LS:2181) — and it flatly denies the viscosity version (LS:1657 coconut
    // soaps thin as milk even at the minimum; LS:3585 the "preconceived (and incorrect)
    // notion"). Setting IS the right verb for the two causes the book does support — NaOH
    // (LS:2679) and salt — so the pin is scoped to the concentration sentence alone. Within
    // that sentence the banned-verb list is the same one DilutionPanel.test pins on the
    // panel's minimum-dilution paragraph (thickens / sets / solidifies / congeals /
    // hardens / gels): the scoping carries the NaOH/salt carve-out, not the verb list.
    const gel = troubleshootingFor('ls').find((e) => /stringy|gelatin/i.test(e.symptom))!;
    const concentrationSentence = gel.cause
      .split(/(?<=\.)\s+/)
      .find((s) => /maximum concentration/i.test(s))!;
    expect(concentrationSentence).toBeTruthy();
    expect(concentrationSentence).toMatch(/never dissolves|undissolved|lumps/i);
    expect(concentrationSentence).not.toMatch(
      /thickens|\bsets?\b|solidif|congeal|harden|\bgels?\b/i,
    );
  });

  it('runs the salt curve in the same direction as the rest of the app — the gel is the PEAK', () => {
    // The salt curve climbs to a peak and then declines: past the peak, MORE salt thins the
    // soap again. So a salt-caused gel means the recipe is sitting at the peak, and the
    // reference's remedy is to carry on ALONG the curve (accepting the reduced lather,
    // opacity and tacky feel a high-salt soap carries), not to back off it.
    //
    // A previous revision had this exactly inverted — it blamed the gel on being "past the
    // peak" and told the user to work "back down" the curve, which under its own cause
    // clause meant moving toward the peak, i.e. thicker. It also contradicted the two other
    // places the app states this same curve, which is what this test now ties together.
    const gel = troubleshootingFor('ls').find((e) => /stringy|gelatin/i.test(e.symptom))!;
    expect(gel.cause).toMatch(/peak of the salt curve/i);
    expect(gel.cause).not.toMatch(/past the peak/i);
    expect(gel.fix).not.toMatch(/back down|back off/i);
    // The catalog's statement of the same curve, pinned in agreement.
    const saltHazards = effectiveCatalogEntry(catalogEntryById('salt')!, 'ls').hazards ?? [];
    expect(saltHazards.join(' ')).toMatch(/more salt thins/i);
  });

  it('keeps the unfinished-paste cause on the oily-layer entry, where the reference puts it', () => {
    // Diluting before saponification finishes leaves unsaponified fat that floats as an oil
    // layer (and can read as a lye excess). Moving it off the gel entry was right; dropping
    // it from the app altogether was not — the clarity test before diluting is the
    // reference's named remedy and appears in the steps of every LS method.
    const oily = troubleshootingFor('ls').find((e) => /oily layer|floats/i.test(e.symptom))!;
    expect(oily.cause).toMatch(/dilut/i);
    expect(oily.fix).toMatch(/clarity test/i);
  });

  it('is process-gated — HP content differs from CP and LS content', () => {
    const hp = troubleshootingFor('hp');
    const cp = troubleshootingFor('cp');
    const ls = troubleshootingFor('ls');
    expect(hp).not.toBe(cp);
    expect(hp).not.toBe(ls);
    expect(hp.some((e) => /won't gel/.test(e.symptom))).toBe(true);
  });
});
