// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PortionDilutionResults } from './PortionDilutionResults';
import type { DilutionResult } from '@soap-calc/core';

afterEach(cleanup);

// 1,200 g anhydrous + 400 g cook water = 1,600 g paste; 2,400 g dilution water →
// 4,000 g solution = 3,883 ml at 1.03 g/ml.
const RESULT: DilutionResult = {
  anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
  dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
};

const PROPS = {
  dilution: RESULT,
  weightUnit: 'g' as const,
  targetMl: '',
  measuredPasteGrams: '',
  measuredPasteIsRemaining: false,
};

test('scales paste and water to the amount asked for', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  // 1,000 of 3,883 ml ≈ 25.8% of the batch: 412 g paste, 618 g water.
  expect(screen.getByText('412 g')).toBeTruthy();
  expect(screen.getByText(/^618 g/)).toBeTruthy();
  expect(screen.getByText(/26% of the batch/)).toBeTruthy();
});

test('the water figure shows a single unit, switchable from DilutionPanel above rather than shown all at once', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  expect(screen.getByText('618 g')).toBeTruthy();
});

test('says so when more is asked for than the batch holds', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="9000" />);
  expect(screen.getByText(/figures above are the whole batch/i)).toBeTruthy();
  expect(screen.getByText('1,600 g')).toBeTruthy(); // all the paste
});

test('shows no figures until an amount is entered', () => {
  render(<PortionDilutionResults {...PROPS} />);
  expect(screen.queryByText(/Paste to weigh/)).toBeNull();
});

test('says the paste is already more dilute than the target rather than computing a portion (the inputs that let a measurement override this moved to DilutionPanel)', () => {
  // targetExceedsPaste clamps dilutionWaterGrams to 0, which erases the real cook water:
  // the batch's true mass and volume can no longer be recovered from the result, so the
  // portion %, the clamp threshold and the "more than the batch holds" message would all
  // be wrong (measured: 39% shown where the truth was 18.4%). Say so instead of computing —
  // but DilutionPanel uses the same measurement to override this exact flag (Task 5).
  render(
    <PortionDilutionResults
      {...PROPS}
      dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
    />,
  );
  expect(screen.getByText(/already more dilute/i)).toBeTruthy();
});

describe('an undeclared alternative liquid makes "already more dilute" unknowable, here as much as in the shell', () => {
  // targetExceedsPaste is derived from the recipe's ASSUMED water content, so with an
  // alternative liquid whose % water was never declared the claim is not knowable —
  // DilutionPanel gates the identical sentence on (unknownLiquidGrams === 0 ||
  // overDilutionCertain) and hedges instead, and so does the printed sheet. Asserting it
  // here printed a flat "already more dilute" two paragraphs above the shell's own
  // "can't tell whether N% is reachable": same panel, same state, opposite verdicts.
  const OVER = {
    ...RESULT,
    dilutionWaterGrams: 0,
    soapConcentrationPercent: 90,
    targetExceedsPaste: true,
  };

  test('hedges instead of asserting when the liquid\'s water content is undeclared', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={OVER}
        unknownLiquidGrams={900}
        overDilutionCertain={false}
      />,
    );
    expect(screen.queryByText(/already more dilute/i)).toBeNull();
    expect(screen.getByText(/declared/i)).toBeTruthy();
    // Still no portion: the guard's computation is unchanged, only what it says.
    expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  });

  test('still asserts it when the verdict holds across the undeclared liquid\'s whole range', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={OVER}
        unknownLiquidGrams={900}
        overDilutionCertain
      />,
    );
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });

  test('asserts it when there is no undeclared liquid at all', () => {
    render(<PortionDilutionResults {...PROPS} dilution={OVER} unknownLiquidGrams={0} />);
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });
});

test('a valid measured paste sizes a portion even when targetExceedsPaste is set — the measurement outranks the computed flag (Task 5)', () => {
  // targetExceedsPaste was derived from the recipe's ASSUMED cook water (dilutionWaterGrams
  // clamped to 0 here). The measured paste (1,500 g) is direct evidence against that
  // assumption and is valid — between the 1,200 g anhydrous floor and the 4,000 g solution
  // ceiling — so the portion must compute from it instead of refusing.
  render(
    <PortionDilutionResults
      {...PROPS}
      dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
      measuredPasteGrams="1500"
      targetMl="1000"
    />,
  );
  expect(screen.queryByText(/already more dilute/i)).toBeNull();
  expect(screen.getByText('386 g')).toBeTruthy(); // paste to weigh out for a 1,000 ml portion
  expect(screen.getByText(/^644 g/)).toBeTruthy(); // water to add for that portion
});

test('a measured paste replaces the computed one and moves the water to match', () => {
  // Predicted paste is 1,600 g. Measured 1,480 g (the cook evaporated 120 g), so the
  // water must rise by the same 120 g to still reach the recipe's solution weight.
  render(
    <PortionDilutionResults
      {...PROPS}
     
      measuredPasteGrams="1480"
      targetMl="3883"
    />,
  );
  expect(screen.getByText('1,480 g')).toBeTruthy();
  expect(screen.getByText(/^2,520 g/)).toBeTruthy();
});

test('shows the water:paste ratio the reference dilutes by', () => {
  render(<PortionDilutionResults {...PROPS} measuredPasteGrams="1600" targetMl="1942" />);
  expect(screen.getByText(/1\.5 : 1/)).toBeTruthy();
});

test('the water:paste ratio never renders as 0.0 beside a real water figure', () => {
  // Measured paste 3,900 g against a 4,000 g solution leaves only 100 g of water — a real,
  // nonzero figure — but a ratio of 100/3900 ≈ 0.0256 rounds to "0.0" at one decimal place,
  // which reads as "no water" beside a water-to-add figure that is not zero.
  render(<PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="3900" />);
  expect(screen.queryByText(/^0\.0 : 1/)).toBeNull();
});

test('flags how far the measured paste drifted from the predicted one', () => {
  render(<PortionDilutionResults {...PROPS} measuredPasteGrams="1480" targetMl="1000" />);
  expect(screen.getByText(/120 g lighter than predicted/)).toBeTruthy();
  // DilutionPanel's batch row now uses the measurement too (see its own
  // batchDilutionWaterGrams), so this drift note must not claim otherwise.
  expect(screen.queryByText(/still use the predicted weight/i)).toBeNull();
  // Those figures are no longer "above" — they are behind the scope toggle, and only one
  // scope's figures are on screen at a time. Name the scope, not a position.
  expect(screen.getByText(/Whole batch scope uses your measurement too/i)).toBeTruthy();
  expect(screen.queryByText(/batch figures above/i)).toBeNull();
});

test('without a measurement the computed paste carries the evaporation caveat', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" />);
  expect(screen.getByText(/evaporat/i)).toBeTruthy();
});

test('refuses a measurement below the anhydrous soap weight — not physically a paste', () => {
  // The paste always contains all the anhydrous soap (1,200 g here); solids do not
  // evaporate. A smaller reading is a mis-tare or a portion weight, and treating it as a
  // batch produced confident nonsense ("1,599 g lighter — water lost to the cook").
  // The alert that says so now renders beside the INPUT, in DilutionPanel's shell, so it
  // reaches both scopes; this component only has to stop computing from the bad reading.
  render(<PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="900" />);
  expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('refuses a measured paste that exceeds the target solution — the alert for it lives beside the input', () => {
  render(<PortionDilutionResults {...PROPS} targetMl="1000" measuredPasteGrams="4100" />);
  expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

describe('the measured-paste declaration (whole batch vs. what is left)', () => {
  test('a reading below the anhydrous floor is ACCEPTED once declared as what is left after earlier dilutions', () => {
    // 900 g is below the 1,200 g anhydrous floor and is refused in whole-batch mode
    // (see the test above) — but declared "remaining", it is not the whole batch, so
    // there is no floor to violate: the pot's own anhydrous soap is scaled down from the
    // measurement instead of assumed to be the recipe's full 1,200 g.
    render(
      <PortionDilutionResults
        {...PROPS}
        targetMl="500"
        measuredPasteGrams="900"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    // Fraction is taken against the POT's own achievable volume (900 g remaining → 2,250 g
    // pot solution → 2,184 ml achievable), not the recipe's — see the worked-example test
    // below for why. 500/2,184 ≈ 0.229: 206 g paste, 309 g water.
    expect(screen.getByText('206 g')).toBeTruthy(); // paste to weigh out for the portion
    expect(screen.getByText(/^309 g/)).toBeTruthy(); // water to add for that portion
  });

  test('the worked-example fix: "Amount to make" makes that amount — a remaining reading scales to the POT\'s own volume, not the recipe\'s', () => {
    // 1,000 g anhydrous, 600 g cook water (1,600 g predicted whole-batch paste), 33%
    // target. 1,437 g is what is left in the pot after an earlier partial dilution.
    //
    // An earlier version of this test expected 524 g of water — that came from scaling
    // the requested 1,200 ml against the ORIGINAL RECIPE's full volume (≈2,942 ml), the
    // same fraction whole-batch mode uses. That is wrong: 524 g of water only reaches
    // ~1,078 ml, not the 1,200 ml asked for. The pot no longer holds the whole recipe, so
    // its own achievable volume is smaller (≈2,642 ml); scaling against THAT gives 653 g
    // paste and 583 g water — 1,236 g total, exactly 1,200 ml at 1.03 g/ml. Do not
    // restore 524 here.
    const anhydrousGrams = 1000;
    const cookWaterGrams = 600;
    const targetConcentration = 0.33;
    const predictedPasteGrams = anhydrousGrams + cookWaterGrams;
    const solutionGrams = anhydrousGrams / targetConcentration;
    const dilutionWaterGrams = solutionGrams - predictedPasteGrams;
    const totalWaterGrams = cookWaterGrams + dilutionWaterGrams;
    const dilution = {
      anhydrousGrams, totalWaterGrams, dilutionWaterGrams, solutionGrams,
      glycerinGrams: 0, soapConcentrationPercent: 33, targetExceedsPaste: false,
    };
    const { rerender } = render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1200"
        measuredPasteGrams="1437"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.getByText(/^583 g/)).toBeTruthy(); // water to add
    expect(screen.getByText('653 g')).toBeTruthy(); // paste to weigh out
    expect(screen.getByText('1,200 ml')).toBeTruthy(); // Makes — the amount actually asked for
    rerender(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1200"
        measuredPasteGrams="1437"
        measuredPasteIsRemaining={false}
      />,
    );
    // Whole-batch mode is unaffected by this fix — the pot IS the batch there, so the
    // same reading (mis-declared as the whole batch) still produces the old 650 g figure.
    expect(screen.getByText(/^650 g/)).toBeTruthy();
  });

  test('echoes the remaining reading in grams, not in the panel display unit', () => {
    // The measured-paste field is grams-only and lives in DilutionPanel's shell, whose own
    // rejection alerts already hardcode grams for the same reason. Quoting the reading back
    // as "scaled down from your 3.26 lb reading" makes the maker convert to recognise the
    // 1480 they just typed.
    render(
      <PortionDilutionResults
        {...PROPS}
        weightUnit="lb"
        targetMl="1000"
        measuredPasteGrams="1480"
        measuredPasteIsRemaining
      />,
    );
    const hint = screen.getByText(/scaled down from your/i);
    // Contiguous, so a stray JSX comment cannot silently swallow the spacing around it.
    expect(hint.textContent).toMatch(/from your 1,480 g reading/);
    expect(hint.textContent).not.toMatch(/3\.26 lb/);
  });

  test('the drift note does not claim the batch figures use a remaining-paste measurement', () => {
    // The whole-batch drift note ("battch figures above use your measurement too") is
    // false once the measurement is declared remaining — DilutionPanel's batch row does
    // not apply it (Commit 1's other guard). Must not repeat that claim here.
    render(
      <PortionDilutionResults
        {...PROPS}
        targetMl="1000"
        measuredPasteGrams="1480"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.queryByText(/Whole batch scope uses your measurement too/i)).toBeNull();
  });

  test('rejects a remaining reading heavier than the whole batch\'s own predicted paste — a remainder cannot exceed the whole', () => {
    // Review round 2, finding 2: RESULT's predicted whole-batch paste is 1,600 g
    // (1,200 g anhydrous + 400 g cook water). A 2,000 g "remaining" reading would
    // otherwise be accepted and scale to more soap than the entire batch ever contained —
    // physically impossible input must be refused, not silently computed. The alert naming
    // the ceiling now renders beside the input in DilutionPanel (which reaches both
    // scopes); what this component owes is refusing to compute.
    render(
      <PortionDilutionResults
        {...PROPS}
        targetMl="1000"
        measuredPasteGrams="2000"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('accepts a remaining reading exactly at the predicted whole-batch paste (the boundary)', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        targetMl="1000"
        measuredPasteGrams="1600"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.getByText(/Paste to weigh out/)).toBeTruthy();
  });

  test('the clamp message is mode-aware: remaining mode names the remaining paste, not the whole original batch', () => {
    // A remaining-mode clamped message reading "the figures above are the whole batch"
    // reads as the whole ORIGINAL batch, and sits right beside the "Treated as what's
    // left after earlier dilutions" hint just below it — the two disagreed in wording.
    const anhydrousGrams = 1000;
    const cookWaterGrams = 600;
    const targetConcentration = 0.33;
    const predictedPasteGrams = anhydrousGrams + cookWaterGrams;
    const solutionGrams = anhydrousGrams / targetConcentration;
    const dilutionWaterGrams = solutionGrams - predictedPasteGrams;
    const totalWaterGrams = cookWaterGrams + dilutionWaterGrams;
    const dilution = {
      anhydrousGrams, totalWaterGrams, dilutionWaterGrams, solutionGrams,
      glycerinGrams: 0, soapConcentrationPercent: 33, targetExceedsPaste: false,
    };
    // 2,800 ml exceeds what 1,437 g of remaining paste can ever make (≈2,642 ml) — see
    // the equivalent core test — so this clamps in remaining mode specifically.
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="2800"
        measuredPasteGrams="1437"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.getByText(/more than the remaining paste holds/i)).toBeTruthy();
    expect(screen.getByText(/figures above use all of it/i)).toBeTruthy();
    expect(screen.queryByText(/figures above are the whole batch/i)).toBeNull();
  });
});

describe('the whole-batch drift note and the remaining-mode ceiling quote the same paste figure (Commit 2)', () => {
  // Verified trace: 100 g anhydrous, 150 g cook water, 50% target. solutionGrams = 200,
  // totalWaterGrams = 100 < cook (150), so targetExceedsPaste clamps dilutionWaterGrams to
  // 0. Core's own predictedPasteGrams (anhydrous + max(0, totalWater - dilutionWater)) is
  // then 100 + 100 = 200 g — understated, because the clamp erased the 150 g of real cook
  // water. The view model's wholeBatchPasteGrams (anhydrous + cookWaterGrams, clamp-free)
  // is the true 250 g. Before the fix, the whole-batch drift note used the 200 g figure
  // while the remaining-mode ceiling used the 250 g figure — same batch, same reading, two
  // different "whole batch's paste" numbers depending only on which radio was selected.
  const dilution: DilutionResult = {
    anhydrousGrams: 100,
    solutionGrams: 200,
    totalWaterGrams: 100,
    dilutionWaterGrams: 0,
    glycerinGrams: 0,
    soapConcentrationPercent: 50,
    targetExceedsPaste: true,
  };
  const wholeBatchPasteGrams = 250;

  test('the whole-batch drift note quotes the clamp-free 250 g basis, not the clamped 200 g predicted figure', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="100"
        measuredPasteGrams="180"
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    // 180 − 250 = 70 g lighter. The old, buggy comparison (180 − 200) would have said 20 g.
    expect(screen.getByText(/70 g lighter than predicted/)).toBeTruthy();
    expect(screen.queryByText(/20 g lighter than predicted/)).toBeNull();
  });

  test('the remaining-mode ceiling refuses the same 300 g reading the drift note is measured against', () => {
    // The alert that NAMES the 250 g ceiling now renders beside the input in DilutionPanel
    // (both scopes reach it there) — see its own "quotes the corrected whole-batch basis"
    // and "names the clamp-free 250 g basis" pins. What this component owes is refusing to
    // compute from the reading at all.
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="100"
        measuredPasteGrams="300"
        measuredPasteIsRemaining
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a portion core refuses is explained, never left blank', () => {
  // The three rejection rules bound the READING against whole-batch figures, while
  // lsPartialDilution's own feasibility test depends on the RECIPE: it returns null
  // whenever the pot's paste already weighs more than the solution that pot's own soap
  // makes at the target (ls-yield's `potSolutionGrams - pasteGrams < 0`). A reading all
  // three rules accept can still land there — and `pasteAlreadyThinner` cannot explain it,
  // because that flag requires there to be NO valid measurement. Both render branches were
  // false and this component emitted an empty fragment: no figures, no alert, no reason.

  // 1,000 g anhydrous at a 33% target → a 3,030 g solution and 2,030 g of total water;
  // 1,900 g of cook water still leaves 130 g of dilution water, so targetExceedsPaste is
  // FALSE. But a split liquid's 200 g of non-water solids make the TRUE whole-batch paste
  // 3,100 g — heavier than the 3,030 g solution — so the batch really is already thinner
  // than 33%, which the recipe's own flag structurally cannot see. A 2,000 g "what's left"
  // reading is inside every bound: under the 3,030 g solution ceiling, under the 3,100 g
  // whole-batch ceiling, and the solids floor does not apply to a remaining reading.
  const anhydrousGrams = 1000;
  const cookWaterGrams = 1900;
  const solutionGrams = anhydrousGrams / 0.33;
  const totalWaterGrams = solutionGrams - anhydrousGrams;
  const dilutionWaterGrams = Math.max(0, totalWaterGrams - cookWaterGrams);
  const dilution: DilutionResult = {
    anhydrousGrams, solutionGrams, totalWaterGrams, dilutionWaterGrams,
    glycerinGrams: 0, soapConcentrationPercent: 33, targetExceedsPaste: false,
  };
  const wholeBatchPasteGrams = anhydrousGrams + cookWaterGrams + 200;

  test('says why an accepted reading still sizes no portion, instead of rendering nothing at all', () => {
    const { container } = render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="2000"
        measuredPasteIsRemaining
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.queryByText('Paste to weigh out')).toBeNull();
    expect(container.textContent?.trim()).not.toBe('');
    expect(screen.getByText(/no dilution water to divide up/i)).toBeTruthy();
    expect(screen.getByText(/already more dilute/i)).toBeTruthy();
  });

  test('explains the same blank when targetExceedsPaste is set and the remaining reading is valid', () => {
    // 1,200 g anhydrous at a 90% target → a 1,333 g solution, 133 g of total water against
    // 1,600 g of cook water, so targetExceedsPaste IS set and dilutionWaterGrams clamps to
    // 0. A 1,000 g "what's left" reading clears every rule (under the 1,333 g solution
    // ceiling, under the 2,800 g whole-batch ceiling), which turns pasteAlreadyThinner off
    // — and core still refuses, because 1,000 g of this paste makes only ~476 g of
    // solution at 90%.
    const overDilution: DilutionResult = {
      anhydrousGrams: 1200,
      solutionGrams: 1200 / 0.9,
      totalWaterGrams: 1200 / 0.9 - 1200,
      dilutionWaterGrams: 0,
      glycerinGrams: 0,
      soapConcentrationPercent: 90,
      targetExceedsPaste: true,
    };
    const { container } = render(
      <PortionDilutionResults
        {...PROPS}
        dilution={overDilution}
        targetMl="1000"
        measuredPasteGrams="1000"
        measuredPasteIsRemaining
        wholeBatchPasteGrams={2800}
      />,
    );
    expect(screen.queryByText('Paste to weigh out')).toBeNull();
    expect(container.textContent?.trim()).not.toBe('');
    expect(screen.getByText(/no dilution water to divide up/i)).toBeTruthy();
  });

  test('stays silent when the portion really does compute', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="1500"
        measuredPasteIsRemaining
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    // 1,500 g of this paste holds 484 g of soap → a 1,466 g solution, which is LESS than
    // the 1,500 g of paste... so this too is refused. Use the whole-batch declaration
    // instead, where the pot's solution is the recipe's own 3,030 g.
    cleanup();
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="2000"
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.getByText('Paste to weigh out')).toBeTruthy();
    expect(screen.queryByText(/no dilution water to divide up/i)).toBeNull();
  });
});

describe('the remaining-mode ceiling uses the TRUE whole-batch paste, not just the water-only predicted figure (round 3)', () => {
  // Review round 3: predictedPasteGrams (anhydrousGrams + cookWaterGrams) counts only the
  // WATER fraction of an alternative liquid — its non-water solids are real mass sitting
  // in the pot the recipe never counts. Round 2's ceiling used predictedPasteGrams and so
  // FALSELY rejected legitimate remaining readings above it whenever the recipe used a
  // split liquid. Same fixture as the equivalent core test: 1,000 g anhydrous, 500 g lye
  // water, 200 g split liquid at 50% water (100 g water, 100 g solids) — predicted
  // (water-only) paste 1,600 g, TRUE whole-batch paste 1,700 g. Target 33% soap.
  const anhydrousGrams = 1000;
  const cookWaterGrams = 600; // 500 g lye water + 100 g split-liquid water
  const targetConcentration = 0.33;
  const predictedPasteGrams = anhydrousGrams + cookWaterGrams; // 1,600
  const wholeBatchPasteGrams = predictedPasteGrams + 100; // 1,700 (100 g split-liquid solids)
  const solutionGrams = anhydrousGrams / targetConcentration;
  const dilutionWaterGrams = solutionGrams - predictedPasteGrams;
  const totalWaterGrams = cookWaterGrams + dilutionWaterGrams;
  const dilution = {
    anhydrousGrams, totalWaterGrams, dilutionWaterGrams, solutionGrams,
    glycerinGrams: 0, soapConcentrationPercent: 33, targetExceedsPaste: false,
  };

  test('accepts an honest 1,620 g remaining reading that the water-only 1,600 g ceiling would have falsely rejected', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="1620"
        measuredPasteIsRemaining
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/Paste to weigh out/)).toBeTruthy();
  });

  test('still rejects a reading above the TRUE whole-batch paste (the alert naming the 1,700 g basis is pinned in DilutionPanel)', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="3000"
        measuredPasteIsRemaining
        wholeBatchPasteGrams={wholeBatchPasteGrams}
      />,
    );
    expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  });

  test('without a supplied wholeBatchPasteGrams, falls back to the water-only predicted figure (no-split-liquid recipe, byte-identical to round 2)', () => {
    render(
      <PortionDilutionResults
        {...PROPS}
        dilution={dilution}
        targetMl="1000"
        measuredPasteGrams="1620"
        measuredPasteIsRemaining
      />,
    );
    // 1,620 g exceeds the uncorrected 1,600 g predicted paste, so without a corrected
    // basis this is (correctly, for a recipe with no split liquid) still rejected — the
    // same reading the test above accepts once the corrected 1,700 g basis is supplied.
    expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
  });
});
