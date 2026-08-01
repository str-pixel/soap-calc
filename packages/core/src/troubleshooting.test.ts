import { describe, expect, it } from 'vitest';
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

  it('is process-gated — HP content differs from CP and LS content', () => {
    const hp = troubleshootingFor('hp');
    const cp = troubleshootingFor('cp');
    const ls = troubleshootingFor('ls');
    expect(hp).not.toBe(cp);
    expect(hp).not.toBe(ls);
    expect(hp.some((e) => /won't gel/.test(e.symptom))).toBe(true);
  });
});
