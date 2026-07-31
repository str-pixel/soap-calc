import { describe, expect, it } from 'vitest';
import {
  ACETIC_ACID_MOLAR_MASS,
  CITRIC_ACID_MOLAR_MASS,
  GLYCEROL_MOLAR_MASS,
  KOH_MOLAR_MASS,
  NAOH_MOLAR_MASS,
} from './molar-masses.js';
import { catalogEntryById } from './additives.js';
import { alternativeLiquidPreset } from './alternative-liquids.js';

describe('molar masses — one source of truth', () => {
  it('matches the IUPAC-derived values', () => {
    expect(KOH_MOLAR_MASS).toBeCloseTo(39.0983 + 15.999 + 1.008, 3);
    expect(NAOH_MOLAR_MASS).toBeCloseTo(22.98977 + 15.999 + 1.008, 3);
    expect(GLYCEROL_MOLAR_MASS).toBeCloseTo(3 * 12.011 + 8 * 1.008 + 3 * 15.999, 3);
    expect(CITRIC_ACID_MOLAR_MASS).toBeCloseTo(6 * 12.011 + 8 * 1.008 + 7 * 15.999, 2);
    expect(ACETIC_ACID_MOLAR_MASS).toBeCloseTo(2 * 12.011 + 4 * 1.008 + 2 * 15.999, 2);
  });

  it('citric-acid additive factors derive exactly from the shared constants', () => {
    const factors = catalogEntryById('citric-acid')!.lyeNeutralization!;
    // 10-digit tolerance = float associativity only. A module carrying its own 56.105 vs
    // the shared 56.1056 differs at the 5th digit and still fails here.
    expect(factors.naohPerGram).toBeCloseTo((3 / CITRIC_ACID_MOLAR_MASS) * NAOH_MOLAR_MASS, 10);
    expect(factors.kohPerGram).toBeCloseTo((3 / CITRIC_ACID_MOLAR_MASS) * KOH_MOLAR_MASS, 10);
  });

  it('vinegar preset factors derive exactly from the shared constants', () => {
    const factors = alternativeLiquidPreset('vinegar')!.lyeNeutralization!;
    expect(factors.naohPerGram).toBeCloseTo((0.05 / ACETIC_ACID_MOLAR_MASS) * NAOH_MOLAR_MASS, 10);
    expect(factors.kohPerGram).toBeCloseTo((0.05 / ACETIC_ACID_MOLAR_MASS) * KOH_MOLAR_MASS, 10);
  });
});
