import { describe, expect, it } from 'vitest';
import {
  calculateRecipeProperties,
  oilPropertiesFromFattyAcids,
} from './properties.js';

const COCONUT_FA = {
  lauric: 48,
  myristic: 19,
  palmitic: 9,
  caprylic: 8,
  capric: 7,
  oleic: 6,
  stearic: 2,
  linoleic: 2,
};

const OLIVE_FA = {
  oleic: 71,
  palmitic: 13,
  stearic: 3,
  linoleic: 10,
  linolenic: 1,
};

describe('oilPropertiesFromFattyAcids', () => {
  it('computes hardness from C12+ saturated acids only (C8/C10 soaps are too soluble to harden)', () => {
    const props = oilPropertiesFromFattyAcids(COCONUT_FA);
    expect(props.hardness).toBe(48 + 19 + 9 + 2);
    expect(props.cleansing).toBe(48 + 19 + 8 + 7);
  });
});

describe('calculateRecipeProperties', () => {
  const lookup = {
    'coconut-oil-76': {
      id: 'coconut-oil-76',
      propertiesAvailable: true,
      fattyAcids: COCONUT_FA,
    },
    'olive-oil': {
      id: 'olive-oil',
      propertiesAvailable: true,
      fattyAcids: OLIVE_FA,
    },
    'birch-tar': {
      id: 'birch-tar',
      propertiesAvailable: false,
    },
  };

  it('returns weighted recipe properties', () => {
    const result = calculateRecipeProperties(
      [
        { oilId: 'coconut-oil-76', weightGrams: 250 },
        { oilId: 'olive-oil', weightGrams: 750 },
      ],
      lookup,
    );

    expect(result.coveragePercent).toBeCloseTo(98.5, 1);
    expect(result.properties!.hardness).toBeGreaterThan(20);
    expect(result.properties!.condition).toBeGreaterThan(30);
  });

  it('reports partial coverage when specialty oils lack data', () => {
    const result = calculateRecipeProperties(
      [
        { oilId: 'olive-oil', weightGrams: 900 },
        { oilId: 'birch-tar', weightGrams: 100 },
      ],
      lookup,
    );

    expect(result.coveragePercent).toBeCloseTo(88.2, 1);
    expect(result.missingOilIds).toContain('birch-tar');
    expect(result.properties).not.toBeNull();
  });

  it('returns null properties when no oils have data', () => {
    const result = calculateRecipeProperties(
      [{ oilId: 'birch-tar', weightGrams: 100 }],
      lookup,
    );

    expect(result.properties).toBeNull();
    expect(result.coveragePercent).toBe(0);
    // Zero coverage still names which oils lack data.
    expect(result.missingOilIds).toContain('birch-tar');
  });

  it('reports an unknown oil id (absent from lookup) as missing', () => {
    const result = calculateRecipeProperties(
      [
        { oilId: 'olive-oil', weightGrams: 500 },
        { oilId: 'ghost-oil', weightGrams: 500 },
      ],
      lookup,
    );

    expect(result.missingOilIds).toContain('ghost-oil');
    expect(result.coveragePercent).toBeCloseTo(49, 1);
  });

  it('renormalizes properties over covered weight under partial coverage (not diluted to zero)', () => {
    const result = calculateRecipeProperties(
      [
        { oilId: 'olive-oil', weightGrams: 500 },
        { oilId: 'ghost-oil', weightGrams: 500 },
      ],
      lookup,
    );

    // Pure olive hardness = palmitic(13) + stearic(3) = 16, on the same 0-100 scale as
    // the guide band — NOT halved to 8 by the uncovered 50%.
    expect(result.properties!.hardness).toBeCloseTo(16, 5);
    // A single covered oil renormalizes to exactly its own profile.
    const soloOlive = calculateRecipeProperties([{ oilId: 'olive-oil', weightGrams: 500 }], lookup);
    expect(result.properties!.hardness).toBeCloseTo(soloOlive.properties!.hardness, 5);
  });
});

describe('conditioning includes docosenoic (corrected spelling)', () => {
  it('counts docosenoic toward conditioning', () => {
    const props = oilPropertiesFromFattyAcids({ oleic: 10, docosenoic: 16 });
    expect(props.condition).toBe(26);
  });
});

describe('palmitoleic and behenic are classified', () => {
  it('counts palmitoleic toward conditioning and behenic toward hardness/longevity', () => {
    const props = oilPropertiesFromFattyAcids({ palmitoleic: 12, behenic: 20, oleic: 5 });
    expect(props.condition).toBe(12 + 5); // palmitoleic + oleic
    expect(props.hardness).toBe(20); // behenic
    expect(props.longevity).toBe(20); // behenic
  });
});
