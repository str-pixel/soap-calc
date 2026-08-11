import { describe, expect, it } from 'vitest';
import { calculateDilution, type DilutionResult } from '@soap-calc/core';
import {
  computedPotGramsFor,
  correctedDilutionWaterGrams,
  correctedPotGramsFor,
  measuredPasteDescribesPotFor,
  measuredPasteIsValidFor,
  measuredPasteRejectionFor,
  parseGradualWaterRecordGrams,
  parseMeasuredPasteGrams,
  subTenthPrecisionFingerprint,
  weighedOrComputedPotGramsFor,
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

  describe('and the corrected whole-batch paste, for an alternative liquid\'s solids', () => {
    // DILUTION is 1,200 g anhydrous into a 4,000 g solution, with 2,400 g of dilution water
    // — so the recipe's own (water-only) paste is 1,600 g. A 900 g split liquid at 50% water
    // puts 450 g of SOLIDS in that pot on top of the water already counted: the real paste is
    // 2,050 g, and 4,000 - 2,050 = 1,950 g is what reaches the target. calculateDilution
    // cannot see this — its solution is anhydrous + water with no room for solids — so the
    // uncorrected 2,400 g would land the batch 450 g past its target, and disagree with the
    // ratio block, which has always poured off the real paste.
    it('subtracts the corrected paste from the same solutionGrams the ratio block uses', () => {
      expect(correctedDilutionWaterGrams(DILUTION, '', false, 2050)).toBe(1950);
    });

    it('is exactly the recipe figure when there is nothing to correct', () => {
      // No split liquid: the corrected paste IS anhydrous + cook water (1,600 g), so this
      // reduces to dilutionWaterGrams with no special case.
      expect(correctedDilutionWaterGrams(DILUTION, '', false, 1600)).toBe(2400);
      // …and an absent/unusable basis takes the same path it always did.
      expect(correctedDilutionWaterGrams(DILUTION, '', false, null)).toBe(2400);
      expect(correctedDilutionWaterGrams(DILUTION, '', false, 0)).toBe(2400);
      expect(correctedDilutionWaterGrams(DILUTION, '', false, Number.NaN)).toBe(2400);
    });

    it('never returns a negative pour when the corrected paste is past the target solution', () => {
      // Reachable with targetExceedsPaste still FALSE: the flag is computed from water
      // alone, so a large low-water liquid can push the real paste over the solution while
      // the recipe believes there is water left to add.
      expect(correctedDilutionWaterGrams(DILUTION, '', false, 4500)).toBe(0);
    });

    it('is outranked by a valid measurement — the scale beats both computed bases', () => {
      expect(correctedDilutionWaterGrams(DILUTION, '1480', false, 2050)).toBe(2520);
    });

    it('still ignores a remaining-declared reading, and corrects the batch figure anyway', () => {
      // A "what's left" reading describes a smaller pot, so it cannot correct this BATCH
      // row — but the solids correction is a property of the recipe and still applies.
      expect(correctedDilutionWaterGrams(DILUTION, '1480', true, 2050)).toBe(1950);
    });
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

  it('rejects a WHOLE-BATCH reading heavier than the target solution, and refuses a remainder as a remainder', () => {
    expect(measuredPasteRejectionFor('4100', DILUTION, false).exceedsSolution).toBe(true);
    // The same 4,100 g declared "what's left". solutionGrams is anhydrous ÷ the target —
    // what the WHOLE batch's soap makes at that concentration — so it is not a bound on a
    // remainder, and the paragraph it drives ("lower the target concentration") answers a
    // mistake nobody made here. The ceiling that IS about a remainder owns it alone: 4,100 g
    // is more than the 1,600 g pot it would have to have come out of.
    const remaining = measuredPasteRejectionFor('4100', DILUTION, true);
    expect(remaining.exceedsSolution).toBe(false);
    expect(remaining.exceedsRemainingCeiling).toBe(true);
    // The verdict does not move — only which rule, and so which paragraph, owns it.
    expect(remaining.rejected).toBe(true);
    expect(remaining.accepted).toBe(false);
  });

  it('accepts a remainder above the solution but within the pot it came out of', () => {
    // The one case the two possible suppression scopes disagree about:
    // solutionGrams < measured <= wholeBatchPasteBasis. It needs a corrected pot heavier
    // than the solution (4,500 g against DILUTION's 4,000 g — a big low-water alternative
    // liquid), because the water-only fallback basis can never exceed solutionGrams.
    //
    // BEFORE: exceedsSolution fired alone, so `rejected` was true and the panel printed
    // "your paste already weighs more than the 4,000 g this target dilutes to … lower the
    // target concentration" — a refusal of a reading that is entirely possible (4,200 g
    // really can be left of a 4,500 g pot). AFTER: no rule fires, because none of them is
    // about this. What is out of reach is the TARGET, and by an inequality that does not
    // mention the reading at all — see the invariant asserted below, and the surfaces that
    // own it (PortionDilutionResults' measuredPasteAlreadyThinner, DilutionPanel's
    // pasteAlreadyPastTarget twin).
    const rejection = measuredPasteRejectionFor('4200', DILUTION, true, 4500);
    expect(rejection.exceedsSolution).toBe(false);
    expect(rejection.exceedsRemainingCeiling).toBe(false);
    expect(rejection.rejected).toBe(false);
    expect(rejection.accepted).toBe(true);
    // …and it still cannot correct the BATCH row, which is a separate gate and unmoved.
    expect(measuredPasteIsValidFor('4200', DILUTION, true, 4500)).toBe(false);
    expect(correctedDilutionWaterGrams(DILUTION, '4200', true, 4500)).toBe(0);
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

  it('reports no measurement — and so no rejection — for a blank or unparseable field', () => {
    // '0' is deliberately NOT in this list: it is a value the maker typed, and it is
    // rejected. See the nonPositive describe below for why, and for the distinction from
    // the blank field, where Number('') is also 0.
    for (const value of ['', '   ', undefined, 'abc']) {
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

describe('a reading that is not a weight at all', () => {
  // belowSolids and exceedsRemainingCeiling both self-disabled via `measured > 0`, and
  // `accepted` requires it too, so a typed -500 produced {rejected: false, accepted: false}
  // — no alert anywhere, and the batch row quietly falling back to the recipe's computed
  // figure with a physically impossible number still on screen above it. min={1} on a
  // type="number" input is only enforced on submit, and this form has no submit, so it is
  // typeable. Those `> 0` guards were written to exempt the BLANK field (Number('') === 0),
  // which hasMeasurement already covers.
  it('rejects zero and negative readings under either declaration', () => {
    for (const isRemaining of [false, true]) {
      for (const value of ['0', '-500', '-0.5']) {
        const rejection = measuredPasteRejectionFor(value, DILUTION, isRemaining);
        expect(rejection.nonPositive).toBe(true);
        expect(rejection.rejected).toBe(true);
        expect(rejection.accepted).toBe(false);
      }
    }
  });

  it('does not fire on a blank field, where Number() is also 0', () => {
    for (const value of ['', '   ', undefined]) {
      const rejection = measuredPasteRejectionFor(value, DILUTION, false);
      expect(rejection.nonPositive).toBe(false);
      expect(rejection.rejected).toBe(false);
    }
  });

  it('does not fire on an unparseable field', () => {
    const rejection = measuredPasteRejectionFor('abc', DILUTION, false);
    expect(rejection.nonPositive).toBe(false);
    expect(rejection.rejected).toBe(false);
  });

  it('owns the verdict alone, so only one alert can be on screen for it', () => {
    // A negative reading is trivially below the anhydrous floor too; without the existing
    // `> 0` guard on belowSolids they would both fire and the shell would render two
    // paragraphs for one reading.
    const rejection = measuredPasteRejectionFor('-500', DILUTION, false);
    expect(rejection.belowSolids).toBe(false);
    expect(rejection.exceedsSolution).toBe(false);
    expect(rejection.exceedsRemainingCeiling).toBe(false);
  });

  it('leaves every positive reading exactly as it was', () => {
    expect(measuredPasteRejectionFor('1480', DILUTION, false).nonPositive).toBe(false);
    expect(measuredPasteRejectionFor('1480', DILUTION, false).accepted).toBe(true);
    expect(measuredPasteRejectionFor('900', DILUTION, false).belowSolids).toBe(true);
    expect(measuredPasteRejectionFor('4100', DILUTION, false).exceedsSolution).toBe(true);
    expect(measuredPasteRejectionFor('2000', DILUTION, true).exceedsRemainingCeiling).toBe(true);
  });
});

describe('a reading finer than the scale reads', () => {
  // Browsers interpret a comma typed into <input type="number"> as a DECIMAL POINT — every
  // locale, Chromium included — so a maker typing 1,222 (twelve hundred twenty-two grams)
  // commits 1.222, and the app never sees the comma. The only fingerprint left is the
  // precision: no kitchen scale weighing a paste batch reads finer than 0.1 g, so a reading
  // with two or more typed decimal digits is not a scale reading. The floor caught the worst
  // of these by accident — 1.222 g is below the anhydrous soap — with an alert blaming the
  // scale's tare, the wrong diagnosis; an artifact above the floor (1480,25 → 1480.25) was
  // silently ACCEPTED, and every surface poured from it.
  it('rejects a reading with two or more typed decimal digits, under either declaration', () => {
    for (const isRemaining of [false, true]) {
      for (const value of ['1.222', '1480.25', '1480.50', '0.15']) {
        const rejection = measuredPasteRejectionFor(value, DILUTION, isRemaining);
        expect(rejection.subTenthPrecision).toBe(true);
        expect(rejection.rejected).toBe(true);
        expect(rejection.accepted).toBe(false);
      }
    }
  });

  it('judges the typed string, never the float', () => {
    // 1480.50 parses to exactly the float 1480.5 parses to — but a scale doesn't print
    // trailing zeros, and two typed decimals are the trap's shape whatever they round to.
    expect(measuredPasteRejectionFor('1480.50', DILUTION, false).subTenthPrecision).toBe(true);
    expect(measuredPasteRejectionFor('1480.5', DILUTION, false).subTenthPrecision).toBe(false);
    expect(measuredPasteRejectionFor('1480.5', DILUTION, false).accepted).toBe(true);
  });

  it('owns the verdict alone — the floor and both ceilings defer to it', () => {
    // 0.15 is far below the floor, 4100.25 above the solution, 2000.25 above a remaining
    // basis: each magnitude rule would fire, and each stands down, because a bound on a
    // number that is not a scale reading answers the wrong question — and its remedy
    // (re-tare, lower the target) is no help against a swallowed separator.
    const below = measuredPasteRejectionFor('0.15', DILUTION, false);
    expect(below.subTenthPrecision).toBe(true);
    expect(below.belowSolids).toBe(false);
    const above = measuredPasteRejectionFor('4100.25', DILUTION, false);
    expect(above.subTenthPrecision).toBe(true);
    expect(above.exceedsSolution).toBe(false);
    const remaining = measuredPasteRejectionFor('2000.25', DILUTION, true);
    expect(remaining.subTenthPrecision).toBe(true);
    expect(remaining.exceedsRemainingCeiling).toBe(false);
    for (const rejection of [below, above, remaining]) {
      expect(rejection.rejected).toBe(true);
      expect(rejection.accepted).toBe(false);
    }
  });

  it('defers to nonPositive — a sub-tenth reading that is not a weight at all keeps that verdict', () => {
    // A typed -0.55 or 0.00 is refused as a non-weight, whose remedy (enter what the scale
    // reads, or clear the field) subsumes this rule's; two paragraphs would say less.
    for (const value of ['-0.55', '0.00']) {
      const rejection = measuredPasteRejectionFor(value, DILUTION, false);
      expect(rejection.nonPositive).toBe(true);
      expect(rejection.subTenthPrecision).toBe(false);
      expect(rejection.rejected).toBe(true);
    }
  });

  it('does not fire on blank, unparseable, or tenth-and-coarser readings', () => {
    for (const value of ['', '   ', undefined, 'abc', '1.2.3', '1.23.4', '1480', '1480.5', '900', '4100']) {
      const rejection = measuredPasteRejectionFor(value, DILUTION, false);
      expect(rejection.subTenthPrecision).toBe(false);
    }
    // '1.23.4' carries two decimal digits but parses to NaN — junk stays junk, no rule
    // fires, no crash.
    expect(measuredPasteRejectionFor('1.23.4', DILUTION, false).rejected).toBe(false);
    // …and the readings the magnitude rules own still land exactly where they did.
    expect(measuredPasteRejectionFor('900', DILUTION, false).belowSolids).toBe(true);
    expect(measuredPasteRejectionFor('4100', DILUTION, false).exceedsSolution).toBe(true);
  });

  it('judges scientific notation by its typed decimal digits, not its magnitude', () => {
    // The number input's own grammar admits an exponent, so the rule must not crash on one.
    // Only DECIMAL DIGITS are the separator's fingerprint: 2e3 carries none and passes
    // through to the magnitude rules on its parsed 2,000 g — a fine whole-batch reading
    // here — while 1.25e3 carries two and is refused, whatever it multiplies out to. A
    // scale prints neither exponents nor hundredths; the typed characters are what this
    // rule reads, by design.
    const plain = measuredPasteRejectionFor('2e3', DILUTION, false);
    expect(plain.subTenthPrecision).toBe(false);
    expect(plain.accepted).toBe(true);
    const mantissa = measuredPasteRejectionFor('1.25e3', DILUTION, false);
    expect(mantissa.subTenthPrecision).toBe(true);
    expect(mantissa.rejected).toBe(true);
  });

  it('stops feeding every consumer: the gate refuses it and the pour falls back', () => {
    // measuredPasteIsValidFor backs DilutionPanel's batch row, the printed BatchSheet and
    // computeBottledSolutionGrams; correctedDilutionWaterGrams is the figure all three
    // pour. A refused reading must not correct any of them.
    expect(measuredPasteIsValidFor('1480.25', DILUTION)).toBe(false);
    expect(correctedDilutionWaterGrams(DILUTION, '1480.25')).toBe(2400); // the recipe's own figure
    expect(correctedDilutionWaterGrams(DILUTION, '1480.25', false, 2050)).toBe(1950); // the corrected pot
    // …while the tenth-precision reading it shadows still outranks both, exactly as before.
    expect(measuredPasteIsValidFor('1480.5', DILUTION)).toBe(true);
    expect(correctedDilutionWaterGrams(DILUTION, '1480.5')).toBe(4000 - 1480.5);
  });
});

describe('the paste floor counts solids that cannot boil off', () => {
  // DILUTION is 1,200 g anhydrous with 400 g of cook water (2,800 total − 2,400 dilution),
  // so its own water-only paste is 1,600 g. Put a 900 g alternative liquid at 50% water in
  // that pot and 450 g of it is SOLIDS: the real pot is 2,050 g, and the mass that cannot
  // leave during the cook is 1,200 + 450 = 1,650 g. A reading under that describes a pot
  // that cannot exist — the crock left on the scale, or a portion weighed instead of the
  // batch — and the anhydrous-only floor accepted every one of them down to 1,200 g.
  const COOK_WATER = 400;
  const SOLIDS = 450;
  const POT = DILUTION.anhydrousGrams + COOK_WATER + SOLIDS; // 2,050
  const FLOOR = DILUTION.anhydrousGrams + SOLIDS; // 1,650

  it('rejects a whole-batch reading between the anhydrous soap and the real floor', () => {
    // 1,400 g clears the old floor by 200 g and is still 250 g short of the pot's own
    // undissolvable contents.
    const rejection = measuredPasteRejectionFor('1400', DILUTION, false, POT, COOK_WATER);
    expect(rejection.belowSolids).toBe(true);
    expect(rejection.rejected).toBe(true);
    expect(rejection.accepted).toBe(false);
    // The figure the alert must quote, reported rather than re-derived by the surface.
    expect(rejection.solidsFloorGrams).toBe(FLOOR);
  });

  it('accepts the floor exactly, and rejects a hair below it', () => {
    expect(measuredPasteRejectionFor(String(FLOOR), DILUTION, false, POT, COOK_WATER).accepted).toBe(true);
    // A tenth of a gram — the finest reading a paste scale produces, so the finest string
    // the floor can ever be asked about: anything finer is subTenthPrecision's, not this
    // rule's (this used to probe FLOOR − 0.001, a string no scale can type any more).
    expect(
      measuredPasteRejectionFor(String(FLOOR - 0.1), DILUTION, false, POT, COOK_WATER).belowSolids,
    ).toBe(true);
  });

  it('still accepts a reading lighter than the recipe predicts — cook water is NOT in the floor', () => {
    // The case the whole feature exists for (LS:2172): the cook boils water off, so a paste
    // lighter than the computed 2,050 g pot is the expected, meaningful reading. Extending
    // the floor to cook water would reject exactly these.
    for (const reading of ['2049', '1800', '1651', String(FLOOR)]) {
      const rejection = measuredPasteRejectionFor(reading, DILUTION, false, POT, COOK_WATER);
      expect(rejection.belowSolids).toBe(false);
      expect(rejection.accepted).toBe(true);
    }
  });

  it('leaves the floor at the anhydrous soap when there are no solids to count', () => {
    // A recipe with no split liquid: the corrected pot IS anhydrous + cook water, so the
    // solids term is exactly zero and every reading down to 1,200 g is still accepted.
    const rejection = measuredPasteRejectionFor('1300', DILUTION, false, 1600, COOK_WATER);
    expect(rejection.solidsFloorGrams).toBe(DILUTION.anhydrousGrams);
    expect(rejection.accepted).toBe(true);
    expect(measuredPasteRejectionFor('1200', DILUTION, false, 1600, COOK_WATER).accepted).toBe(true);
    expect(measuredPasteRejectionFor('1199', DILUTION, false, 1600, COOK_WATER).belowSolids).toBe(true);
  });

  it('falls back to the anhydrous floor when either half of the corrected basis is missing', () => {
    // Both figures are needed to know the solids are there, so a caller that supplies one,
    // the other, or neither gets exactly the behaviour it had before.
    for (const args of [
      [undefined, undefined],
      [POT, undefined],
      [undefined, COOK_WATER],
      [null, COOK_WATER],
      [0, COOK_WATER],
      [Number.NaN, COOK_WATER],
      [POT, Number.NaN],
      [POT, null],
    ] as const) {
      const rejection = measuredPasteRejectionFor('1400', DILUTION, false, args[0], args[1]);
      expect(rejection.solidsFloorGrams).toBe(DILUTION.anhydrousGrams);
      expect(rejection.belowSolids).toBe(false);
      expect(rejection.accepted).toBe(true);
    }
    // …but ZERO cook water is a supplied figure, not a missing one, and the distinction is
    // real: a recipe whose only liquid is a zero-water alternative (all the glycerin, no lye
    // water) has cook water 0 and a pot that is nothing but soap and solids. Treating that 0
    // as "unknown" would drop the floor back to the anhydrous soap on exactly the recipe
    // whose solids are largest.
    const noCookWater = measuredPasteRejectionFor('1300', DILUTION, false, 1600, 0);
    expect(noCookWater.solidsFloorGrams).toBe(1600);
    expect(noCookWater.belowSolids).toBe(true);
  });

  it('never drops the floor BELOW the anhydrous soap, whatever pot it is handed', () => {
    // The clamp on the solids term, and the same Math.max(0, …) the other two derivations of
    // this quantity carry (DilutionPanel, computeBottledSolutionGrams). An incoherent pair —
    // a pot lighter than its own soap plus water — would otherwise make the solids negative
    // and take the original anhydrous guard away with it, so a 100 g reading on a
    // 1,200 g-soap batch would sail through.
    const rejection = measuredPasteRejectionFor('100', DILUTION, false, 1300, COOK_WATER);
    expect(rejection.solidsFloorGrams).toBe(DILUTION.anhydrousGrams);
    expect(rejection.belowSolids).toBe(true);
  });

  it('does not invent solids out of the targetExceedsPaste clamp on a recipe with none', () => {
    // The reason the solids come from cookWaterGrams rather than
    // totalWaterGrams − dilutionWaterGrams: once the clamp has fired that subtraction
    // recovers 0, not the real cook water (see calculateDilution's own note), so the cheaper
    // derivation would read 700 g of phantom solids on a recipe with no alternative liquid
    // at all and reject every reading under 1,900 g.
    const CLAMPED: DilutionResult = {
      anhydrousGrams: 1200, solutionGrams: 1500, totalWaterGrams: 300,
      dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 80,
      targetExceedsPaste: true,
    };
    const rejection = measuredPasteRejectionFor('1250', CLAMPED, false, 1200 + 700, 700);
    expect(rejection.solidsFloorGrams).toBe(1200);
    expect(rejection.belowSolids).toBe(false);
    expect(rejection.accepted).toBe(true);
  });

  it('leaves a remaining-declared reading alone — the floor is a whole-batch rule', () => {
    // What's left after an earlier dilution can legitimately weigh less than the batch's own
    // solids; raising the floor must not take that away.
    const rejection = measuredPasteRejectionFor('1400', DILUTION, true, POT, COOK_WATER);
    expect(rejection.belowSolids).toBe(false);
    expect(rejection.accepted).toBe(true);
  });

  it('moves the ceiling and the remaining-mode basis not at all', () => {
    // Only the floor changes: the solution ceiling and wholeBatchPasteBasis answer the same
    // way with the cook water supplied as without it.
    for (const cook of [COOK_WATER, undefined]) {
      expect(measuredPasteRejectionFor('4100', DILUTION, false, POT, cook).exceedsSolution).toBe(true);
      expect(measuredPasteRejectionFor('4000', DILUTION, false, POT, cook).exceedsSolution).toBe(false);
      expect(measuredPasteRejectionFor('2100', DILUTION, true, POT, cook).exceedsRemainingCeiling).toBe(true);
      expect(measuredPasteRejectionFor('2050', DILUTION, true, POT, cook).wholeBatchPasteBasis).toBe(POT);
    }
  });

  it('carries the same floor into every consumer, so nothing applies a reading the verdict refuses', () => {
    // measuredPasteIsValidFor backs DilutionPanel's batch row, the printed BatchSheet and
    // computeBottledSolutionGrams; correctedDilutionWaterGrams is the figure all three pour.
    // A reading the rejection verdict refuses must stop feeding them, and the pour must fall
    // back to the corrected pot rather than to the reading.
    expect(measuredPasteIsValidFor('1400', DILUTION, false, POT, COOK_WATER)).toBe(false);
    expect(correctedDilutionWaterGrams(DILUTION, '1400', false, POT, COOK_WATER)).toBe(
      DILUTION.solutionGrams - POT, // 1,950 — the unmeasured corrected pour, not 4,000 − 1,400
    );
    // …and an accepted reading still outranks both computed bases, exactly as before.
    expect(measuredPasteIsValidFor('1700', DILUTION, false, POT, COOK_WATER)).toBe(true);
    expect(correctedDilutionWaterGrams(DILUTION, '1700', false, POT, COOK_WATER)).toBe(2300);
  });

  it('makes a live pour beside an unreachable target impossible, not merely absent', () => {
    // 400 g of a zero-water liquid on a 1,200 g-anhydrous batch at an 80% target: the solids
    // exceed the target's whole 300 g water allowance, which is the same inequality that
    // puts the floor (1,600 g) above the ceiling (1,500 g). So the window is empty — there
    // is no reading at all that the panel can apply here, which is what makes DilutionPanel's
    // "never a total of none beside a live pour" invariant structural rather than incidental.
    const OVER: DilutionResult = {
      anhydrousGrams: 1200, solutionGrams: 1500, totalWaterGrams: 300,
      dilutionWaterGrams: 0, glycerinGrams: 100, soapConcentrationPercent: 80,
      targetExceedsPaste: true,
    };
    for (let reading = 1; reading <= 2000; reading++) {
      expect(measuredPasteIsValidFor(String(reading), OVER, false, 1930, 330)).toBe(false);
    }
    // The old floor accepted 301 of them, every one physically impossible.
    expect(measuredPasteIsValidFor('1400', OVER, false, 1930)).toBe(true);
  });

  it('gives a reading in the gap ONE refusal — the ceiling\'s — when the floor outruns it', () => {
    // The state the raised floor created and nothing used to answer for. Until the floor
    // counted solids it was strictly below the ceiling for any target under 100%
    // (solutionGrams is anhydrous ÷ the target), so the two rules could not both fire. Once
    // solids outweigh the target's WHOLE water allowance the floor sits above the ceiling,
    // and every reading between them broke both rules at once.
    //
    // The starter recipe under KOH with 400 g of glycerin, at a 78% target — the reported
    // repro, and reachable by typing one number: a 1,615.33 g floor against a 1,558.12 g
    // ceiling. A 1,580 g reading is in the gap. The panel printed both refusals, and their
    // remedies point opposite ways: the floor's says the reading is too LIGHT to be the
    // whole pot ("check the scale was tared"), the ceiling's says it is too HEAVY for the
    // target ("lower the target concentration").
    const GLYCERIN: DilutionResult = {
      anhydrousGrams: 1215.33, solutionGrams: 1215.33 / 0.78,
      totalWaterGrams: 1215.33 / 0.78 - 1215.33, dilutionWaterGrams: 1215.33 / 0.78 - 1215.33 - 330,
      glycerinGrams: 400, soapConcentrationPercent: 78, targetExceedsPaste: false,
    };
    const rejection = measuredPasteRejectionFor('1580', GLYCERIN, false, 1215.33 + 330 + 400, 330);
    expect(rejection.solidsFloorGrams).toBeCloseTo(1615.33, 2);
    expect(GLYCERIN.solutionGrams).toBeLessThan(rejection.solidsFloorGrams);
    // The ceiling wins: it is the rule whose remedy answers the mistake being made.
    expect(rejection.exceedsSolution).toBe(true);
    expect(rejection.belowSolids).toBe(false);
    // …and the verdict itself does not move. Nothing this exclusion touches becomes usable;
    // only the second paragraph goes.
    expect(rejection.rejected).toBe(true);
    expect(rejection.accepted).toBe(false);
  });

  it('sets exactly one rule flag per reading, under either declaration, with no exceptions', () => {
    // The exclusivity the module's doc asserts, swept rather than argued: the surfaces render
    // the four rules as four independent `&&` branches, so a reading that sets two flags puts
    // two paragraphs on screen. Each rule is checked at every boundary of every other, on
    // recipes with no solids, ordinary solids, and solids past the target's whole allowance.
    //
    // This sweep used to carry ONE asserted exception — exceedsSolution was not gated on the
    // declaration and exceedsRemainingCeiling did not exclude it, so a REMAINING reading
    // above both the solution and the pot set both flags and the panel stacked two
    // paragraphs, the wrong advice first. Closing it meant moving the remaining-mode ceiling,
    // which is what `!isRemaining` on exceedsSolution now does. The exception is gone rather
    // than narrowed: ANY pair showing up here is a regression.
    let accepted = 0;
    for (const [anhydrous, targetPct, cook, solids] of [
      [1200, 30, 400, 0], [1200, 30, 400, 450], [1200, 80, 330, 400],
      [1215.33, 78, 330, 400], [1215.33, 65, 330, 400], [500, 50, 100, 900],
      // The last four already put the pot above the whole target solution, which is the only
      // shape in which a remaining reading can sit above solutionGrams and still be within
      // the pot — and so the only one where suppressing exceedsSolution for the whole
      // declaration differs from suppressing it only alongside exceedsRemainingCeiling. The
      // invariant asserted on that class below is checked against them; a recipe added here
      // purely to reach it would be dead weight (one was, and was removed after a mutation
      // run showed nothing depended on it).
    ] as const) {
      const solutionGrams = anhydrous / (targetPct / 100);
      const d: DilutionResult = {
        anhydrousGrams: anhydrous, solutionGrams, totalWaterGrams: solutionGrams - anhydrous,
        dilutionWaterGrams: Math.max(0, solutionGrams - anhydrous - cook),
        glycerinGrams: 100, soapConcentrationPercent: targetPct,
        targetExceedsPaste: solutionGrams - anhydrous < cook,
      };
      const pot = anhydrous + cook + solids;
      for (const bound of [anhydrous, anhydrous + solids, solutionGrams, pot]) {
        for (const delta of [-1, -0.01, 0, 0.01, 1]) {
          for (const isRemaining of [false, true]) {
            // The ±0.01 deltas (and every non-integer bound String()ed) now double as the
            // precision rule's own sweep: those strings carry two or more decimal digits,
            // so subTenthPrecision claims them and every magnitude rule must stand down —
            // exactly the exclusivity this loop exists to prove.
            const r = measuredPasteRejectionFor(String(bound + delta), d, isRemaining, pot, cook);
            const fired = [
              r.nonPositive, r.subTenthPrecision, r.belowSolids, r.exceedsSolution,
              r.exceedsRemainingCeiling,
            ].filter(Boolean).length;
            // One reading, one refusal — under BOTH declarations now.
            expect(fired).toBeLessThanOrEqual(1);
            // …and the flags still add up to the verdict, so exclusivity is never bought by
            // dropping a refusal on the floor.
            expect(r.rejected).toBe(fired >= 1);
            // The one thing the remaining declaration's narrower ceiling lets through: a
            // remainder above the whole batch's target solution. It is only ever accepted
            // where the pot itself outweighs that solution — a remainder's own solution is
            // measured x solutionGrams / basis, short of the reading precisely when
            // basis > solutionGrams — so core's `potSolutionGrams - pasteGrams < 0` refuses
            // every reading in this class and nothing can silently compute from it. (No UI
            // surface reaches this: the declaration control is gone and every reading is a
            // whole-batch one. The property is asserted for the direct consumers the rule is
            // kept for — see MEASURED_PASTE_IS_REMAINING.)
            if (r.accepted && isRemaining && r.measuredGrams > solutionGrams) {
              accepted++;
              expect(r.wholeBatchPasteBasis).toBeGreaterThan(solutionGrams);
              expect(r.measuredGrams * (solutionGrams / r.wholeBatchPasteBasis)).toBeLessThan(
                r.measuredGrams,
              );
            }
          }
        }
      }
    }
    // That class is reachable, so the invariant above is not vacuous.
    expect(accepted).toBeGreaterThan(0);
  });
});

describe('subTenthPrecisionFingerprint — the swallowed-separator test, exported for the ml field', () => {
  // One regex, one module: DilutionPanel's "Amount to make (ml)" field has the same comma
  // trap as the measured-paste field (a typed 1,200 ml commits as 1.2 — a silent 1000×
  // shrink), and the same fingerprint catches it: a finite, positive raw string carrying
  // two or more typed decimal digits. Nobody asks for a portion to the hundredth of a
  // millilitre, just as no paste scale reads finer than 0.1 g.
  it('fires on a finite, positive raw string with two or more typed decimal digits', () => {
    for (const raw of ['1.200', '1.222', '1200.55', '0.15', '1.25e3']) {
      expect(subTenthPrecisionFingerprint(raw)).toBe(true);
    }
  });

  it('stays quiet on whole numbers, single decimals, junk, blanks and non-positives', () => {
    // '1200.5' is the load-bearing negative: one decimal is odd but honest, and must keep
    // computing — only two or more refuse.
    for (const raw of ['1200', '1200.5', '1.2', '2e3', '', '   ', 'abc', '1.23.4', '-1.25', '0.00']) {
      expect(subTenthPrecisionFingerprint(raw)).toBe(false);
    }
  });

  it('is the identical verdict measuredPasteRejectionFor reaches, so the two can never drift', () => {
    for (const raw of ['1.222', '1480.25', '1480.5', '1480', '2e3', '1.25e3', '-0.55', '1.23.4', '']) {
      expect(subTenthPrecisionFingerprint(raw)).toBe(
        measuredPasteRejectionFor(raw, DILUTION, false).subTenthPrecision,
      );
    }
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

describe('measuredPasteDescribesPotFor — the pot’s own rules, with no target in them', () => {
  it('agrees with measuredPasteIsValidFor on every reading under the ceiling', () => {
    for (const raw of ['1200', '1480', '2500', '3999.5', '4000']) {
      expect(measuredPasteDescribesPotFor(raw, DILUTION)).toBe(
        measuredPasteIsValidFor(raw, DILUTION),
      );
    }
  });

  it('keeps the three rules that describe the pot', () => {
    // Unparseable / blank / non-positive.
    expect(measuredPasteDescribesPotFor('', DILUTION)).toBe(false);
    expect(measuredPasteDescribesPotFor(undefined, DILUTION)).toBe(false);
    expect(measuredPasteDescribesPotFor('-500', DILUTION)).toBe(false);
    // A swallowed thousands separator is not a scale reading, whatever it multiplies out to.
    expect(measuredPasteDescribesPotFor('1480.25', DILUTION)).toBe(false);
    // Below the batch's own non-evaporable mass: not a whole-batch paste at all.
    expect(measuredPasteDescribesPotFor('900', DILUTION)).toBe(false);
    // …and the solids floor moves with an alternative liquid, exactly as it does for the
    // full gate: 1,200 g of soap + 450 g of solids in a 2,500 g pot.
    expect(measuredPasteDescribesPotFor('1500', DILUTION, 2500, 850)).toBe(false);
    expect(measuredPasteDescribesPotFor('1700', DILUTION, 2500, 850)).toBe(true);
  });

  it('drops the target-derived ceiling, and that is the whole difference', () => {
    // 4,500 g is heavier than the 4,000 g solution this target dilutes to — a claim about
    // the TARGET, which the derived modes do not have. The pot is still a possible pot.
    expect(measuredPasteIsValidFor('4500', DILUTION)).toBe(false);
    expect(measuredPasteDescribesPotFor('4500', DILUTION)).toBe(true);
  });

  it('is invariant to the target — the property the write-back loop needed', () => {
    // Gradual writes the concentration back, so `dilution` is rebuilt from the panel's own
    // output on the next render. A basis that moved with it could not settle: at 85.41% the
    // solution lands a hair under a weighed 1,405 g pot, which is exactly where the old gate
    // flipped and the app hung.
    const at30 = { ...DILUTION, solutionGrams: 4000, soapConcentrationPercent: 30 };
    const at8541 = { ...DILUTION, solutionGrams: 1404.99, soapConcentrationPercent: 85.41 };
    expect(measuredPasteDescribesPotFor('1405', at30)).toBe(true);
    expect(measuredPasteDescribesPotFor('1405', at8541)).toBe(true);
    // The full gate is the one that flips, and still should — it guards a pour figure.
    expect(measuredPasteIsValidFor('1405', at30)).toBe(true);
    expect(measuredPasteIsValidFor('1405', at8541)).toBe(false);
  });
});

describe('correctedPotGramsFor — one pot for the pour and for what gets bottled', () => {
  it('prefers the reading whenever it describes a possible pot', () => {
    expect(correctedPotGramsFor(DILUTION, '1480', false, 1600, 400)).toEqual({
      grams: 1480,
      fromMeasurement: true,
    });
  });

  it('falls back to the corrected pot when the reading does not describe one', () => {
    // Below the solids floor, and a swallowed separator: neither is a pot.
    expect(correctedPotGramsFor(DILUTION, '900', false, 1600, 400)).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
    expect(correctedPotGramsFor(DILUTION, '1480.25', false, 1600, 400)).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
  });

  it('is null when nothing knows the pot', () => {
    expect(correctedPotGramsFor(DILUTION, '')).toBeNull();
    expect(correctedPotGramsFor(DILUTION, '900')).toBeNull();
  });

  it('refuses a remaining reading, which is not the whole batch’s pot', () => {
    expect(correctedPotGramsFor(DILUTION, '1480', true, 1600, 400)).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
  });

  it('takes a reading its own write-back rounded the target down from', () => {
    // THE SPLIT this function exists for. A weighed 1,405 g pot with no water recorded writes
    // round2(120000/1405) = 85.41%, and 1,200 / 0.8541 is 1,404.9877 g — a hair UNDER the
    // reading. measuredPasteIsValidFor refuses it there, which is how the panel came to count
    // from 1,405 g while the bottled figure fell back to the computed 1,600 g pot.
    //
    // '0' is that record — the pot before any water at all (LS:1531), which is what wrote
    // 85.41% — and it is the argument that licenses the widening. Stated rather than assumed:
    // the widened ceiling belongs to a target a record produced, and this scenario is exactly
    // one of those.
    const at8541: DilutionResult = {
      ...DILUTION,
      solutionGrams: 1200 / 0.8541,
      soapConcentrationPercent: 85.41,
    };
    expect(measuredPasteIsValidFor('1405', at8541, false, 1600, 400)).toBe(false);
    expect(correctedPotGramsFor(at8541, '1405', false, 1600, 400, '0')).toEqual({
      grams: 1405,
      fromMeasurement: true,
    });
    // …and the recipe's own saved target answers identically for the same pot, which is the
    // agreement the whole feature turns on. Under solutionGrams the widening never comes into
    // it, so this arm holds with or without the record.
    const at30 = { ...DILUTION, solutionGrams: 4000, soapConcentrationPercent: 30 };
    expect(correctedPotGramsFor(at30, '1405', false, 1600, 400, '0')?.grams).toBe(1405);
    expect(correctedPotGramsFor(at30, '1405', false, 1600, 400)?.grams).toBe(1405);
  });

  it('still refuses a reading past the target by more than any rounding explains', () => {
    // The crockpot mistake: 4,500 g against a 4,000 g solution at 30% is 500 g over, where
    // the write-back's 2 dp rounding could account for at most 4,000 x 0.005/30 = 0.67 g.
    // Every target-derived figure must go on ignoring it — the panel's own alert tells the
    // maker to subtract the empty pot — so this falls back to the recipe's computed pot.
    // With a record and without: 500 g is past the ceiling either way.
    expect(correctedPotGramsFor(DILUTION, '4500', false, 1600, 400, '0')).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
    expect(correctedPotGramsFor(DILUTION, '4500', false, 1600, 400)).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
    // The bound, at both edges: 4,000.6 g is inside the rounding window, 4,000.8 g is not.
    // (Neither is typable at a scale's precision — this is the boundary, not a use case.)
    expect(correctedPotGramsFor(DILUTION, '4000.6', false, 1600, 400, '0')?.fromMeasurement).toBe(
      true,
    );
    expect(correctedPotGramsFor(DILUTION, '4000.8', false, 1600, 400, '0')?.fromMeasurement).toBe(
      false,
    );
  });

  it('widens the ceiling only for a recipe that carries a gradual record', () => {
    // THE LICENCE FOR THE WIDENING IS THE RECORD, and nothing else. Everything the bound
    // argues is about a target the app WROTE from a pot; where the maker typed 30%
    // themselves, or a ratio produced it, a reading past solutionGrams is the app's own named
    // mistake and the pre-existing ceiling stands. Applied unconditionally it reached the
    // printed batch sheet, where a reading inside the band clamped "Dilution water to add" to
    // "0 g" with no note beside it — measuredPasteIsValidFor still refused the reading, so the
    // measured-paste note stayed off, and the already-more-dilute note keys on the computed
    // pot, which is under the solution. See BatchSheet.test's own pins.
    for (const noRecord of [undefined, '', '   ', 'abc', '-100']) {
      expect(correctedPotGramsFor(DILUTION, '4000.6', false, 1600, 400, noRecord)).toEqual({
        grams: 1600,
        fromMeasurement: false,
      });
    }
    // A 0 g record is a record — the pot before any water is where gradual's own record
    // starts — so it licenses the widening exactly as a poured figure does. However it is
    // typed, and whatever whitespace the field carries.
    for (const record of ['0', '0.0', ' 0 ', '0.00']) {
      expect(correctedPotGramsFor(DILUTION, '4000.6', false, 1600, 400, record)).toEqual({
        grams: 4000.6,
        fromMeasurement: true,
      });
    }
    // A record of 250 g used to license it too, on the argument that the bound held for any
    // W. It does — but "the bound holds" is not "this record wrote this target", and the
    // licence has to be the second: 4,000.6 g of paste with 250 g of water poured into it is
    // 17.0% soap, not the 30% in force, so this pairing is a leftover record beside a target
    // the maker typed. See "the widened ceiling belongs to the target THIS record wrote".
    expect(correctedPotGramsFor(DILUTION, '4000.6', false, 1600, 400, ' 250 ')).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
  });

  it('is identical with and without a record for every reading under the solution', () => {
    // The band is the ONLY place the record can change an answer: at or below solutionGrams
    // both ceilings accept, above the widened bound both refuse. So concentration and ratio
    // mode are restored byte-for-byte, and gradual keeps what it had.
    for (const raw of ['1200', '1480', '2500', '3999.5', '4000', '4500', '9000']) {
      expect(correctedPotGramsFor(DILUTION, raw, false, 1600, 400)).toEqual(
        correctedPotGramsFor(DILUTION, raw, false, 1600, 400, '0'),
      );
    }
  });
});

describe('correctedDilutionWaterGrams past the target’s own solution', () => {
  it('pours nothing for a pot its own record put a hair over the solution', () => {
    // The gradual state: the pot IS the finished soap, so there is nothing left to add. This
    // used to fall through to the corrected-pot branch, which answers 0 here as well
    // (1,404.99 − 1,600 clamps) — the figure only moves where the computed pot is LIGHTER
    // than the solution, and it moves toward the pot the maker weighed. '0' is the record
    // that wrote 85.41% and licenses the widening; the second case is the one the record
    // actually moves, and it needs it.
    const at8541: DilutionResult = {
      ...DILUTION,
      solutionGrams: 1200 / 0.8541,
      soapConcentrationPercent: 85.41,
    };
    expect(correctedDilutionWaterGrams(at8541, '1405', false, 1600, 400, '0')).toBe(0);
    expect(correctedDilutionWaterGrams(at8541, '1405', false, 1300, 400, '0')).toBe(0);
  });

  it('is unchanged for a reading past the widened ceiling — the recipe answers, not the scale', () => {
    // 4,000 − 1,600: the recipe's own computed pot, exactly as before. A crockpot-sized
    // reading must not be able to zero the pour, record or no record.
    expect(correctedDilutionWaterGrams(DILUTION, '4500', false, 1600, 400, '0')).toBe(2400);
    expect(correctedDilutionWaterGrams(DILUTION, '4500', false, 1600, 400)).toBe(2400);
  });

  it('pours the recipe’s own figure inside the band when no record widened the target', () => {
    // The batch-sheet defect at its source: 4,000.6 g is inside the widened band, so with the
    // widening unconditional this clamped to 0 — a bare pour figure on the page carried to the
    // bench, with every note that could have explained it keyed on the other gate. In
    // concentration and ratio mode the target was not written from a pot, so the reading is
    // simply over it and the recipe's computed pot answers: 4,000 − 1,600.
    expect(correctedDilutionWaterGrams(DILUTION, '4000.6', false, 1600, 400)).toBe(2400);
    // …and with the record, which is the state the sheet prints its two record rows for, the
    // clamp is right and stays.
    expect(correctedDilutionWaterGrams(DILUTION, '4000.6', false, 1600, 400, '0')).toBe(0);
  });

  it('is unchanged for every reading the target can still take water to reach', () => {
    // The clamp is a no-op under solutionGrams, which is where the two gates agree — so this
    // change moves nothing for any reading the old gate accepted.
    for (const raw of ['1200', '1480', '2500', '3999.5', '4000']) {
      expect(correctedDilutionWaterGrams(DILUTION, raw, false, 1600, 400)).toBe(
        4000 - Number(raw),
      );
    }
  });
});

describe('the widened ceiling is exact at the boundary it attains', () => {
  // The bound is ATTAINED, not approached: equality holds exactly when the write-back's
  // rounding went up by the full half-cent and no water was recorded. So the comparison
  // sits on the boundary, and a form that inherits solutionGrams' own division error
  // refuses a record the reading itself produced — silently restoring the two-masses bug
  // the ceiling exists to prevent. Found by sweep at ~1 in 21,000 readings; zero on the
  // starter recipe, which is why nothing caught it.
  //
  // 105 g anhydrous in a 224 g pot is exactly 46.875%, which round2 takes UP to 46.88 —
  // the exact half-cent tie.
  const tie = calculateDilution({
    anhydrousGrams: 105,
    cookWaterGrams: 0,
    kohGrams: 20,
    naohGrams: 0,
    soapConcentrationPercent: 46.88,
  })!;

  it("accepts the reading that wrote this very target", () => {
    // '0' is the record that wrote it: 224 g of pot and no water at all. The widening is
    // licensed by that record, so the boundary case is stated with it in hand — which is the
    // only state the app can reach it in.
    const pot = correctedPotGramsFor(tie, '224', false, 224, 0, '0');
    expect(pot).not.toBeNull();
    expect(pot!.fromMeasurement).toBe(true);
    expect(pot!.grams).toBe(224);
  });

  it('still refuses a reading genuinely past the widened bound', () => {
    // 224 g is the heaviest pot that can write 46.88%; 260 g is well past it and must fall
    // back to the computed pot rather than being absorbed by a loose tolerance.
    const pot = correctedPotGramsFor(tie, '260', false, 224, 0, '0');
    expect(pot!.fromMeasurement).toBe(false);
  });
});

describe('parseGradualWaterRecordGrams — is there a record, and is it a scale reading', () => {
  it('takes zero, a poured figure and a padded string, and refuses blanks and junk', () => {
    // ZERO IS A RECORD (the pot before any water at all, LS:1531); blank is not, or an
    // untouched field would read as a record of nothing poured.
    expect(parseGradualWaterRecordGrams('0')).toBe(0);
    expect(parseGradualWaterRecordGrams(' 250 ')).toBe(250);
    expect(parseGradualWaterRecordGrams('')).toBeUndefined();
    expect(parseGradualWaterRecordGrams('   ')).toBeUndefined();
    expect(parseGradualWaterRecordGrams(undefined)).toBeUndefined();
    expect(parseGradualWaterRecordGrams('abc')).toBeUndefined();
    expect(parseGradualWaterRecordGrams('-100')).toBeUndefined();
  });

  it('refuses a swallowed thousands separator — 2,000 g of water is not 2 g', () => {
    // The same trap the measured-paste field and the "Amount to make (ml)" field are already
    // guarded against, on the field that records the pour: `<input type="number">` reads a
    // typed comma as a decimal point in every locale, so 2,000 arrives as '2.000' and the app
    // would record 2 g — deriving 76% instead of 33.8%, printing "Water actually added — 2 g"
    // on the sheet, and sizing a legally-capped preservative dose off a mass 2.25x wrong.
    // Two typed decimals are finer than any scale weighing a batch reads, so this is not a
    // reading at all and there is no record here to widen a ceiling or write a target.
    for (const raw of ['2.000', '1.500', '250.25']) {
      expect(subTenthPrecisionFingerprint(raw)).toBe(true);
      expect(parseGradualWaterRecordGrams(raw)).toBeUndefined();
    }
    // One decimal is odd but honest, and a scale really does read to 0.1 g — it stays a
    // record. '0.00' is zero however it was typed, and zero is where the record starts.
    expect(parseGradualWaterRecordGrams('250.5')).toBe(250.5);
    expect(parseGradualWaterRecordGrams('0.00')).toBe(0);
  });
});

describe('the widened ceiling belongs to the target THIS record wrote', () => {
  // The licence is not "a recipe carries a record somewhere" — `settings.gradualWaterGrams` is
  // recipe state that nothing clears when the maker leaves Gradual, while `dilutionMode` is
  // session state no consumer of this module can see. So the question the bound asks has to be
  // answerable from the record itself: could a pot of `measured` grams, plus the water this
  // record names, have written the target now in force?
  it('refuses the widening for a target a leftover record cannot have written', () => {
    // Record 2,000 g, then switch to Target concentration and type 30%: 4,000.6 g of paste
    // plus 2,000 g of water is 6,000.6 g, which is 20.0% soap and not the 30% in force. The
    // reading is simply past the target, which is the app's own named mistake — the recipe's
    // computed pot answers, exactly as it does with no record at all.
    expect(correctedPotGramsFor(DILUTION, '4000.6', false, 1600, 400, '2000')).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
    expect(correctedDilutionWaterGrams(DILUTION, '4000.6', false, 1600, 400, '2000')).toBe(2400);
  });

  it('still takes the reading that wrote the target, water and all', () => {
    // The state the widening exists for: a weighed 1,405 g pot with NO water recorded writes
    // round2(120000/1405) = 85.41%, whose solution (1,404.99 g) lands a hair under the reading.
    const at8541: DilutionResult = {
      ...DILUTION,
      solutionGrams: 1200 / 0.8541,
      soapConcentrationPercent: 85.41,
    };
    expect(correctedPotGramsFor(at8541, '1405', false, 1600, 400, '0')?.fromMeasurement).toBe(true);
    // With water in the record the widening is not needed and never bites: the solution the
    // record writes is the pot PLUS that water, so the reading is under it by the whole pour.
    // 1,400 g of paste and 200 g of water writes round2(120000/1600) = 75%, a 1,600 g solution.
    const at75: DilutionResult = { ...DILUTION, solutionGrams: 1600, soapConcentrationPercent: 75 };
    expect(correctedPotGramsFor(at75, '1400', false, 1600, 400, '200')).toEqual({
      grams: 1400,
      fromMeasurement: true,
    });
  });
});

describe('one pot resolution for the derived modes, shared by every surface', () => {
  // The panel's gradual/ratio basis and the printed sheet's "That record makes" row used to
  // hand-roll the same gate-then-fallback selection in two component modules, which is how the
  // sheet came to ask a different question than its own pour. One function, one answer.
  it('prefers a reading that describes a possible pot, and falls back to the computed one', () => {
    expect(weighedOrComputedPotGramsFor(DILUTION, '1400', 1600, 400)).toEqual({
      grams: 1400,
      fromMeasurement: true,
    });
    expect(weighedOrComputedPotGramsFor(DILUTION, '', 1600, 400)).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
    // Below the solids floor, and a swallowed separator: neither describes a pot.
    expect(weighedOrComputedPotGramsFor(DILUTION, '900', 1600, 400)?.fromMeasurement).toBe(false);
    expect(weighedOrComputedPotGramsFor(DILUTION, '1480.25', 1600, 400)?.fromMeasurement).toBe(
      false,
    );
    expect(weighedOrComputedPotGramsFor(null, '1400', 1600, 400)).toBeNull();
  });

  it('is TARGET-INDEPENDENT, unlike correctedPotGramsFor — the property the write-back needs', () => {
    // A crockpot-sized reading is absorbed here and refused there, and the difference is the
    // point: this basis is what gradual's own write-back is derived from, so a target-derived
    // ceiling on it would let the panel's output choose the panel's input (the render loop
    // measuredPasteDescribesPotFor documents). The pour and the bottled mass are measured
    // AGAINST a target, so they keep the ceiling.
    expect(weighedOrComputedPotGramsFor(DILUTION, '4500', 1600, 400)?.grams).toBe(4500);
    expect(correctedPotGramsFor(DILUTION, '4500', false, 1600, 400, '0')?.grams).toBe(1600);
  });

  it('falls back to the recipe’s own anhydrous + cook water with no corrected basis', () => {
    expect(computedPotGramsFor(DILUTION, undefined, 400)).toBe(1600);
    expect(computedPotGramsFor(DILUTION, 2050, 400)).toBe(2050);
    expect(computedPotGramsFor(null, 2050, 400)).toBeNull();
    expect(weighedOrComputedPotGramsFor(DILUTION, '', undefined, 400)).toEqual({
      grams: 1600,
      fromMeasurement: false,
    });
  });
});

describe('computedPotGramsFor refuses to produce a non-finite pot', () => {
  const D = {
    anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
    dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30,
    targetExceedsPaste: false,
  } as DilutionResult;

  it('treats a non-finite cook water as zero rather than poisoning the sum', () => {
    // `?? 0` catches null and undefined but not these; the pot then flows into the pour,
    // the bottled base and the jar's share.
    expect(computedPotGramsFor(D, null, NaN)).toBe(1200);
    expect(computedPotGramsFor(D, null, Infinity)).toBe(1200);
    expect(computedPotGramsFor(D, null, -Infinity)).toBe(1200);
  });

  it('still adds a real cook water', () => {
    expect(computedPotGramsFor(D, null, 400)).toBe(1600);
  });
});
