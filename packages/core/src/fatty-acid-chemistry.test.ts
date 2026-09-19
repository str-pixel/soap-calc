import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile } from './fatty-acid-chemistry.js';
import { GLYCEROL_MOLAR_MASS, KOH_MOLAR_MASS, WATER_MOLAR_MASS } from './molar-masses.js';

describe('shared-constant drift guard', () => {
  it('derives SAP from the SHARED alkali mass — a correction to molar-masses.ts moves this oracle too', () => {
    // Pure tristearin from first principles, computed HERE from the shared constants:
    // if fatty-acid-chemistry ever regrows a private KOH copy, a molar-mass correction
    // desynchronizes the two and this cross-check fails (code-review 2026-08-01 — the
    // oracle previously held its own 56.1056 that molar-masses.test.ts could not see).
    const stearicMw = 284.48;
    const backbone = GLYCEROL_MOLAR_MASS - 3 * WATER_MOLAR_MASS;
    const expected = (3 * KOH_MOLAR_MASS) / (3 * stearicMw + backbone);
    const derived = deriveChemistryFromProfile({ stearic: 100 });
    expect(derived).not.toBeNull();
    expect(derived!.sapKoh).toBeCloseTo(expected, 12);
  });
});

// Complete, representative profiles (fatty-acid % of oil).
const OLIVE = { oleic: 71, palmitic: 13, linoleic: 10, stearic: 3, linolenic: 1 }; // 98%
const COCONUT = {
  lauric: 48, myristic: 19, palmitic: 9, caprylic: 8, capric: 7, oleic: 6, stearic: 3, linoleic: 2,
}; // 102%

// pracaxi-class profile: carries lignoceric (C24:0), which the model must map to reach 100%.
const PRACAXI = {
  oleic: 61, linoleic: 16, behenic: 8, arachidic: 4, lignoceric: 4, palmitic: 4, stearic: 3,
}; // 100%

describe('deriveChemistryFromProfile', () => {
  it('maps lignoceric (C24:0) so a pracaxi-class profile derives at full completeness', () => {
    const r = deriveChemistryFromProfile(PRACAXI);
    expect(r).not.toBeNull();
    expect(r!.mappedPercent).toBeCloseTo(100, 0); // fails at 96 if lignoceric is unmapped
  });

  it('derives olive SAP near its published ~0.190 KOH coefficient', () => {
    const r = deriveChemistryFromProfile(OLIVE);
    expect(r).not.toBeNull();
    expect(r!.sapKoh).toBeCloseTo(0.19, 2); // within 0.005
    expect(r!.mappedPercent).toBeCloseTo(98, 0);
  });

  it('derives coconut into the high-SAP lauric band (model estimate, ~3% under the lab 0.257)', () => {
    const r = deriveChemistryFromProfile(COCONUT)!;
    // The triglyceride model is an estimate, not a lab value; it lands ~0.249 for coconut.
    expect(r.sapKoh).toBeGreaterThan(0.24);
    expect(r.sapKoh).toBeLessThan(0.27);
    expect(r.sapKoh).toBeGreaterThan(deriveChemistryFromProfile(OLIVE)!.sapKoh);
  });

  it('derives an iodine value that rises with unsaturation (olive > coconut)', () => {
    const olive = deriveChemistryFromProfile(OLIVE)!;
    const coconut = deriveChemistryFromProfile(COCONUT)!;
    expect(olive.iodineValue).toBeGreaterThan(coconut.iodineValue);
    expect(olive.iodineValue).toBeGreaterThan(70); // olive oil-basis IV ~81
  });

  it('derives iodine on the OIL (triglyceride) basis: FA-basis sum × glyceryl factor', () => {
    // Pure oleic (C18:1, MW 282.46, 1 double bond): FA-basis IV = 100·253.809/282.46 = 89.86.
    // Triglyceride factor = 3·282.46 / (3·282.46 + 38.049) = 0.95702 → oil-basis IV ≈ 86.00.
    const r = deriveChemistryFromProfile({ oleic: 100 })!;
    const faBasis = (100 * 253.809) / 282.46;
    const factor = (3 * 282.46) / (3 * 282.46 + 38.049);
    expect(r.iodineValue).toBeCloseTo(faBasis * factor, 4);
    expect(r.iodineValue).toBeCloseTo(86.0, 1);
    expect(r.iodineValue).toBeLessThan(faBasis); // strictly below the FA-basis value
  });

  it('returns INS as round(sapKoh*1000 - iodineValue)', () => {
    const r = deriveChemistryFromProfile(OLIVE)!;
    expect(r.ins).toBe(Math.round(r.sapKoh * 1000 - r.iodineValue));
  });

  it('returns null when the mapped profile is below the 93% completeness threshold', () => {
    expect(deriveChemistryFromProfile({ oleic: 45 })).toBeNull(); // 45% mapped
    expect(deriveChemistryFromProfile({ oleic: 92 })).toBeNull(); // just under the threshold
  });

  it('derives at/above the 93% completeness threshold', () => {
    expect(deriveChemistryFromProfile({ oleic: 94 })).not.toBeNull();
  });
});

describe('iodine renormalization (deep-review)', () => {
  it('derives the same IV for the same substance regardless of profile completeness', () => {
    // Pure triolein described two ways: profiles summing to 94 and to 100 are the
    // same substance. SAP already renormalizes over mappedPercent; IV must too, or
    // the derived-IV oracle skews by up to ±7% across legal (≥93%) profiles.
    const at94 = deriveChemistryFromProfile({ oleic: 94 });
    const at100 = deriveChemistryFromProfile({ oleic: 100 });
    expect(at94).not.toBeNull();
    expect(at100).not.toBeNull();
    expect(at94!.sapKoh).toBeCloseTo(at100!.sapKoh, 10);
    expect(at94!.iodineValue).toBeCloseTo(at100!.iodineValue, 6);
    // and the absolute value stays the oil-basis figure (~86 for triolein)
    expect(at100!.iodineValue).toBeGreaterThan(85);
    expect(at100!.iodineValue).toBeLessThan(87);
  });
});

describe('mixture stoichiometry (mole-weighted mean molar mass)', () => {
  // Sci:2563: an oil's SAP "will depend on the percentages of its tags and their individual
  // saponification values" — a mass mixture's SAP is the mass-weighted mean of the components'.
  // Only the mole-weighted (harmonic) mean over a WEIGHT-% fatty-acid profile reproduces that.
  const backbone = GLYCEROL_MOLAR_MASS - 3 * WATER_MOLAR_MASS;
  const lauricMw = 200.32;
  const stearicMw = 284.48;
  const oleicMw = 282.46;
  const trilaurinMw = 3 * lauricMw + backbone;
  const tristearinMw = 3 * stearicMw + backbone;
  const trioleinMw = 3 * oleicMw + backbone;

  /** Equal MASSES of two pure triglycerides, expressed as the fatty-acid weight-% profile the
   * catalog stores (each TG contributes 3·MW_fa / MW_tg of its mass as fatty acid). */
  function equalMassProfile(a: { acid: string; faMw: number; tgMw: number }, b: { acid: string; faMw: number; tgMw: number }) {
    const faA = (0.5 * 3 * a.faMw) / a.tgMw;
    const faB = (0.5 * 3 * b.faMw) / b.tgMw;
    const total = faA + faB;
    return { [a.acid]: (100 * faA) / total, [b.acid]: (100 * faB) / total };
  }

  it('derives the mass-weighted mean SAP of equal masses of trilaurin and tristearin', () => {
    const expected = ((3 * KOH_MOLAR_MASS) / trilaurinMw + (3 * KOH_MOLAR_MASS) / tristearinMw) / 2;
    const profile = equalMassProfile(
      { acid: 'lauric', faMw: lauricMw, tgMw: trilaurinMw },
      { acid: 'stearic', faMw: stearicMw, tgMw: tristearinMw },
    );
    expect(deriveChemistryFromProfile(profile)!.sapKoh).toBeCloseTo(expected, 6);
  });

  it('derives the mass-weighted mean iodine value of equal masses of trilaurin and triolein', () => {
    // Trilaurin has no double bond; triolein's oil-basis IV is 3·253.809·100 / MW_tg.
    const expected = (0 + (3 * 253.809 * 100) / trioleinMw) / 2;
    const profile = equalMassProfile(
      { acid: 'lauric', faMw: lauricMw, tgMw: trilaurinMw },
      { acid: 'oleic', faMw: oleicMw, tgMw: trioleinMw },
    );
    expect(deriveChemistryFromProfile(profile)!.iodineValue).toBeCloseTo(expected, 6);
  });
});
