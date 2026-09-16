import { describe, expect, it } from 'vitest';
import { inferCategory, LEGACY_TO_FNWL_ALIASES, normalizeOilName } from './normalize.js';

describe('inferCategory', () => {
  it('classifies mustard oil as triglyceride despite low saponifiable %', () => {
    expect(inferCategory('Mustard Oil, kachi ghani', 'mustard-oil-kachi-ghani')).toBe('triglyceride');
  });

  it('classifies rapeseed as triglyceride despite incomplete breakdown', () => {
    expect(inferCategory('Rapeseed Oil, unrefined canola', 'rapeseed-oil-canola')).toBe('triglyceride');
  });

  it('classifies jojoba as wax_ester by name', () => {
    expect(inferCategory('Jojoba Oil (a Liquid Wax Ester)', 'jojoba-oil-a-liquid-wax-ester')).toBe('wax_ester');
  });

  it('classifies beeswax as wax', () => {
    expect(inferCategory('Beeswax', 'beeswax')).toBe('wax');
  });
});

describe('LEGACY_TO_FNWL_ALIASES', () => {
  it('every alias key is already a normalized name (else the lookup is dead)', () => {
    for (const key of Object.keys(LEGACY_TO_FNWL_ALIASES)) {
      expect(key).toBe(normalizeOilName(key));
    }
  });
});

// Category was decided by the DISPLAY NAME, so three triglycerides were filed as non-oils: japan
// wax (SAP 215 mg KOH/g) and fully hydrogenated soy (192) because their common names contain
// "wax", and abyssinian (168) by an explicit id list. Saponification value is the measurement
// that actually separates the two groups, and it does so with a 56-point gap in this catalog:
// everything that genuinely cannot be broken into fatty acids sits at or below 106 (candelilla
// 49, tars 60, carnauba 87, jojoba 92, beeswax 94, lanolin 106) and every triglyceride at or
// above 162 (nutmeg butter). A name may label an ingredient; it may not overrule its chemistry.
describe('inferCategory decides on saponification value, not the name', () => {
  it('keeps calling the genuine waxes waxes — their SAP is far below the floor', () => {
    expect(inferCategory('Beeswax', 'beeswax', 0.094)).toBe('wax');
    expect(inferCategory('Candelilla Wax', 'candelilla-wax', 0.049)).toBe('wax');
    expect(inferCategory('Carnauba (Copernicia cerifera) wax', 'carnauba-wax', 0.087)).toBe('wax');
    expect(inferCategory('Lanolin liquid Wax', 'lanolin-liquid-wax', 0.106)).toBe('wax');
    expect(inferCategory('Jojoba Oil (a Liquid Wax Ester)', 'jojoba-oil-a-liquid-wax-ester', 0.092)).toBe('wax_ester');
  });

  it('calls a triglyceride a triglyceride even when its common name says "wax"', () => {
    expect(inferCategory('Japan Wax', 'japan-wax', 0.215)).toBe('triglyceride');
    expect(inferCategory('Soybean, fully hydrogenated (soy wax)', 'soybean-fully-hydrogenated', 0.192)).toBe('triglyceride');
  });

  it('overrules the hard-coded wax-ester list when SAP contradicts it', () => {
    // 168 is meadowfoam's 169, not jojoba's 92 — and the list's own comment says not to infer
    // this from an incomplete fatty-acid sum, which is exactly how it got there.
    expect(inferCategory('Abyssinian Oil', 'abyssinian-oil', 0.168)).toBe('triglyceride');
  });

  it('leaves tars and free acids to their names — SAP cannot tell those apart', () => {
    // A tar's SAP is a lye-consumption proxy, not an ester count; a free acid's is genuinely
    // high (one COOH per molecule, no glycerol) and would otherwise read as a triglyceride.
    expect(inferCategory('Pine Tar', 'pine-tar', 0.06)).toBe('tar');
    expect(inferCategory('Stearic Acid', 'stearic-acid', 0.1972)).toBe('free_acid');
    expect(inferCategory('Lauric Acid', 'lauric-acid', 0.28)).toBe('free_acid');
  });

  it('falls back to the name when no SAP is known', () => {
    expect(inferCategory('Beeswax', 'beeswax')).toBe('wax');
    expect(inferCategory('Olive Oil', 'olive-oil')).toBe('triglyceride');
  });
});
