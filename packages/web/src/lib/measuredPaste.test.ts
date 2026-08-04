import { describe, expect, it } from 'vitest';
import type { DilutionResult } from '@soap-calc/core';
import {
  correctedDilutionWaterGrams,
  measuredPasteIsValidFor,
  parseMeasuredPasteGrams,
} from './measuredPaste';

const DILUTION: DilutionResult = {
  anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
  dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
};

describe('parseMeasuredPasteGrams', () => {
  it('parses a finite positive number', () => {
    expect(parseMeasuredPasteGrams('1480')).toBe(1480);
  });

  it('returns undefined for blank, non-numeric, zero, or negative input', () => {
    expect(parseMeasuredPasteGrams('')).toBeUndefined();
    expect(parseMeasuredPasteGrams(undefined)).toBeUndefined();
    expect(parseMeasuredPasteGrams('  ')).toBeUndefined();
    expect(parseMeasuredPasteGrams('abc')).toBeUndefined();
    expect(parseMeasuredPasteGrams('0')).toBeUndefined();
    expect(parseMeasuredPasteGrams('-5')).toBeUndefined();
  });
});

describe('measuredPasteIsValidFor', () => {
  it('is valid between the anhydrous floor and the solution ceiling, inclusive', () => {
    expect(measuredPasteIsValidFor('1200', DILUTION)).toBe(true);
    expect(measuredPasteIsValidFor('4000', DILUTION)).toBe(true);
    expect(measuredPasteIsValidFor('1480', DILUTION)).toBe(true);
  });

  it('is invalid below the anhydrous floor or above the solution ceiling', () => {
    expect(measuredPasteIsValidFor('1199', DILUTION)).toBe(false);
    expect(measuredPasteIsValidFor('4001', DILUTION)).toBe(false);
  });

  it('is invalid when no usable number is given', () => {
    expect(measuredPasteIsValidFor('', DILUTION)).toBe(false);
    expect(measuredPasteIsValidFor(undefined, DILUTION)).toBe(false);
  });
});

describe('correctedDilutionWaterGrams', () => {
  it('falls back to the recipe-computed figure with no valid measurement', () => {
    expect(correctedDilutionWaterGrams(DILUTION, undefined)).toBe(2400);
    expect(correctedDilutionWaterGrams(DILUTION, '')).toBe(2400);
    expect(correctedDilutionWaterGrams(DILUTION, '900')).toBe(2400); // below solids: rejected
  });

  it('uses solutionGrams - measured for a valid measurement — the same arithmetic DilutionPanel and PortionDilutionResults apply', () => {
    // 4,000 - 1,480 = 2,520.
    expect(correctedDilutionWaterGrams(DILUTION, '1480')).toBe(2520);
  });
});

describe('measuredPasteIsValidFor with a remaining-paste declaration', () => {
  it('is never valid FOR THE BATCH ROW when the measurement is what is left, not the whole batch', () => {
    // 1,480 g is otherwise a perfectly valid whole-batch reading (between the 1,200 g
    // floor and the 4,000 g ceiling) — but a remaining-paste reading is not the batch,
    // and this helper backs the BATCH row (DilutionPanel, BatchSheet), not the portion.
    expect(measuredPasteIsValidFor('1480', DILUTION, true)).toBe(false);
  });

  it('is unaffected — still whatever it was before — when isRemaining is omitted or false', () => {
    expect(measuredPasteIsValidFor('1480', DILUTION)).toBe(true);
    expect(measuredPasteIsValidFor('1480', DILUTION, false)).toBe(true);
  });
});

describe('correctedDilutionWaterGrams with a remaining-paste declaration', () => {
  it('falls back to the recipe-computed figure — a remaining-paste reading must not correct the BATCH row', () => {
    expect(correctedDilutionWaterGrams(DILUTION, '1480', true)).toBe(2400);
  });

  it('is unaffected — still corrects — when isRemaining is omitted or false', () => {
    expect(correctedDilutionWaterGrams(DILUTION, '1480')).toBe(2520);
    expect(correctedDilutionWaterGrams(DILUTION, '1480', false)).toBe(2520);
  });
});
