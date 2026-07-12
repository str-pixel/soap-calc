import { describe, expect, it } from 'vitest';
import { deriveChemistryFromProfile } from './fatty-acid-chemistry.js';

// Complete, representative profiles (fatty-acid % of oil).
const OLIVE = { oleic: 71, palmitic: 13, linoleic: 10, stearic: 3, linolenic: 1 }; // 98%
const COCONUT = {
  lauric: 48, myristic: 19, palmitic: 9, caprylic: 8, capric: 7, oleic: 6, stearic: 3, linoleic: 2,
}; // 102%

describe('deriveChemistryFromProfile', () => {
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
    expect(olive.iodineValue).toBeGreaterThan(70); // olive IV ~85
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
