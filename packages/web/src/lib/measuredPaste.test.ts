import { describe, expect, it } from 'vitest';
import type { DilutionResult } from '@soap-calc/core';
import {
  correctedDilutionWaterGrams,
  measuredPasteIsValidFor,
  measuredPasteRejectionFor,
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

describe('measuredPasteRejectionFor', () => {
  // One source for the three rejection rules, so the shell that owns the INPUT and the
  // portion results that consume the reading can never disagree about whether it is usable.
  it('rejects a whole-batch reading below the anhydrous solids floor, naming which rule fired', () => {
    const rejection = measuredPasteRejectionFor('900', DILUTION, false);
    expect(rejection.belowSolids).toBe(true);
    expect(rejection.exceedsSolution).toBe(false);
    expect(rejection.exceedsRemainingCeiling).toBe(false);
    expect(rejection.rejected).toBe(true);
    expect(rejection.accepted).toBe(false);
  });

  it('does not apply the solids floor to a reading declared as what is left', () => {
    // The whole point of the declaration: what remains after an earlier dilution can
    // legitimately weigh less than the recipe's whole anhydrous soap.
    const rejection = measuredPasteRejectionFor('900', DILUTION, true);
    expect(rejection.belowSolids).toBe(false);
    expect(rejection.rejected).toBe(false);
    expect(rejection.accepted).toBe(true);
  });

  it('rejects a reading heavier than the target solution under either declaration', () => {
    expect(measuredPasteRejectionFor('4100', DILUTION, false).exceedsSolution).toBe(true);
    expect(measuredPasteRejectionFor('4100', DILUTION, true).exceedsSolution).toBe(true);
  });

  it('rejects a remaining reading above the whole-batch ceiling and reports the basis it used', () => {
    // Predicted whole-batch paste: 1,200 anhydrous + (2,800 − 2,400) water already in the
    // paste = 1,600 g.
    const rejection = measuredPasteRejectionFor('2000', DILUTION, true);
    expect(rejection.exceedsRemainingCeiling).toBe(true);
    expect(rejection.wholeBatchPasteBasis).toBe(1600);
    // The boundary is accepted.
    expect(measuredPasteRejectionFor('1600', DILUTION, true).exceedsRemainingCeiling).toBe(false);
  });

  it('prefers a supplied corrected whole-batch basis over the water-only predicted figure', () => {
    // An alternative liquid's non-water solids are real mass the recipe never counts, so a
    // 1,650 g remainder is honest on a recipe whose true paste weighed 1,700 g.
    const rejection = measuredPasteRejectionFor('1650', DILUTION, true, 1700);
    expect(rejection.wholeBatchPasteBasis).toBe(1700);
    expect(rejection.exceedsRemainingCeiling).toBe(false);
    expect(rejection.accepted).toBe(true);
  });

  it('reports no measurement — and so no rejection — for a blank or unusable field', () => {
    for (const value of ['', '   ', undefined, 'abc', '0']) {
      const rejection = measuredPasteRejectionFor(value, DILUTION, false);
      expect(rejection.rejected).toBe(false);
      expect(rejection.accepted).toBe(false);
    }
    expect(measuredPasteRejectionFor('', DILUTION, false).hasMeasurement).toBe(false);
  });

  it('accepts a usable whole-batch reading and hands back the parsed grams', () => {
    const rejection = measuredPasteRejectionFor('1480', DILUTION, false);
    expect(rejection.accepted).toBe(true);
    expect(rejection.measuredGrams).toBe(1480);
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
