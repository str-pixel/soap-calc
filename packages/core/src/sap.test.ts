import { describe, expect, it } from 'vitest';
import {
  KOH_TO_NAOH_FACTOR,
  mgKohPerGramToSapKoh,
  mgKohPerGramToSapNaoh,
  parseSapRangeMgKoh,
  sapKohToSapNaoh,
} from './sap.js';

describe('SAP conversion (ISO 3657 / FNWL methodology)', () => {
  it('converts lab mg KOH/g to decimal coefficients', () => {
    expect(mgKohPerGramToSapKoh(190)).toBeCloseTo(0.19, 5);
    expect(mgKohPerGramToSapNaoh(190)).toBeCloseTo(0.13547, 4);
  });

  it('uses 1.4025 KOH-to-NaOH factor', () => {
    expect(KOH_TO_NAOH_FACTOR).toBe(1.4025);
    expect(sapKohToSapNaoh(0.257)).toBeCloseTo(0.1832, 3); // coconut
  });

  it('parses single value and ranges', () => {
    expect(parseSapRangeMgKoh('196')).toEqual({ min: 196, max: 196, mid: 196 });
    expect(parseSapRangeMgKoh('250 - 264').mid).toBeCloseTo(257, 5);
  });

  it('rejects malformed ranges instead of coercing empty segments to 0', () => {
    expect(() => parseSapRangeMgKoh('196-')).toThrow('Invalid SAP range');
    expect(() => parseSapRangeMgKoh('-185')).toThrow('Invalid SAP range');
    expect(() => parseSapRangeMgKoh('170-180-190')).toThrow('Invalid SAP range');
    expect(() => parseSapRangeMgKoh('')).toThrow('Invalid SAP range');
  });
});
