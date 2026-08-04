// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PartialDilution } from './PartialDilution';
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
  onTargetMlChange: () => {},
  measuredPasteGrams: '',
  onMeasuredPasteGramsChange: () => {},
};

test('scales paste and water to the amount asked for', () => {
  render(<PartialDilution {...PROPS} targetMl="1000" />);
  // 1,000 of 3,883 ml ≈ 25.8% of the batch: 412 g paste, 618 g water.
  expect(screen.getByText('412 g')).toBeTruthy();
  expect(screen.getByText(/^618 g/)).toBeTruthy();
  expect(screen.getByText(/26% of the batch/)).toBeTruthy();
});

test('the water figure carries the other scale units, like the batch pour figure', () => {
  render(<PartialDilution {...PROPS} targetMl="1000" />);
  expect(screen.getByText(/618 g \(21\.8 oz \/ 1\.36 lb\)/)).toBeTruthy();
});

test('says so when more is asked for than the batch holds', () => {
  render(<PartialDilution {...PROPS} targetMl="9000" />);
  expect(screen.getByText(/figures above are the whole batch/i)).toBeTruthy();
  expect(screen.getByText('1,600 g')).toBeTruthy(); // all the paste
});

test('shows no figures until an amount is entered', () => {
  render(<PartialDilution {...PROPS} />);
  expect(screen.queryByText(/Paste to weigh/)).toBeNull();
});

test('renders nothing without a dilution', () => {
  const { container } = render(<PartialDilution {...PROPS} dilution={null} />);
  expect(container.innerHTML).toBe('');
});

test('refuses to size a portion when the paste is already more dilute than the target — but keeps the inputs visible so a measurement can be entered to escape the refusal', () => {
  // targetExceedsPaste clamps dilutionWaterGrams to 0, which erases the real cook water:
  // the batch's true mass and volume can no longer be recovered from the result, so the
  // portion %, the clamp threshold and the "more than the batch holds" message would all
  // be wrong (measured: 39% shown where the truth was 18.4%). Say so instead of computing —
  // but DilutionPanel uses the same measurement to override this exact flag (Task 5), so
  // the inputs must stay visible and editable: hiding them would leave no way to recover.
  render(
    <PartialDilution
      {...PROPS}
      dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
    />,
  );
  expect(screen.getByLabelText('Amount to make (ml)')).toBeTruthy();
  expect(screen.getByLabelText('Measured paste weight — whole batch (g)')).toBeTruthy();
  expect(screen.getByText(/already more dilute/i)).toBeTruthy();
});

test('a valid measured paste sizes a portion even when targetExceedsPaste is set — the measurement outranks the computed flag (Task 5)', () => {
  // targetExceedsPaste was derived from the recipe's ASSUMED cook water (dilutionWaterGrams
  // clamped to 0 here). The measured paste (1,500 g) is direct evidence against that
  // assumption and is valid — between the 1,200 g anhydrous floor and the 4,000 g solution
  // ceiling — so the portion must compute from it instead of refusing.
  render(
    <PartialDilution
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
    <PartialDilution
      {...PROPS}
     
      measuredPasteGrams="1480"
      targetMl="3883"
    />,
  );
  expect(screen.getByText('1,480 g')).toBeTruthy();
  expect(screen.getByText(/^2,520 g/)).toBeTruthy();
});

test('shows the water:paste ratio the reference dilutes by', () => {
  render(<PartialDilution {...PROPS} measuredPasteGrams="1600" targetMl="1942" />);
  expect(screen.getByText(/1\.5 : 1/)).toBeTruthy();
});

test('the water:paste ratio never renders as 0.0 beside a real water figure', () => {
  // Measured paste 3,900 g against a 4,000 g solution leaves only 100 g of water — a real,
  // nonzero figure — but a ratio of 100/3900 ≈ 0.0256 rounds to "0.0" at one decimal place,
  // which reads as "no water" beside a water-to-add figure that is not zero.
  render(<PartialDilution {...PROPS} targetMl="1000" measuredPasteGrams="3900" />);
  expect(screen.queryByText(/^0\.0 : 1/)).toBeNull();
});

test('flags how far the measured paste drifted from the predicted one', () => {
  render(<PartialDilution {...PROPS} measuredPasteGrams="1480" targetMl="1000" />);
  expect(screen.getByText(/120 g lighter than predicted/)).toBeTruthy();
  // DilutionPanel's batch row now uses the measurement too (see its own
  // batchDilutionWaterGrams), so this drift note must not claim otherwise.
  expect(screen.queryByText(/still use the predicted weight/i)).toBeNull();
  expect(screen.getByText(/batch figures above use your measurement too/i)).toBeTruthy();
});

test('without a measurement the computed paste carries the evaporation caveat', () => {
  render(<PartialDilution {...PROPS} targetMl="1000" />);
  expect(screen.getByText(/evaporat/i)).toBeTruthy();
});

test('labels the measurement as the WHOLE batch, not the portion', () => {
  // The subtitle primes "weigh out a portion", and the reference's own ratio method
  // weighs the portion — so an unqualified "measured paste weight" invites entering a
  // portion weight, which would silently over-dilute (a 500 g portion of a 1,600 g batch
  // reads as 7:1 water:paste instead of 1.5:1).
  render(<PartialDilution {...PROPS} targetMl="1000" />);
  expect(screen.getByLabelText('Measured paste weight — whole batch (g)')).toBeTruthy();
});

test('refuses a measurement below the anhydrous soap weight — not physically a paste', () => {
  // The paste always contains all the anhydrous soap (1,200 g here); solids do not
  // evaporate. A smaller reading is a mis-tare or a portion weight, and treating it as a
  // batch produced confident nonsense ("1,599 g lighter — water lost to the cook").
  render(<PartialDilution {...PROPS} targetMl="1000" measuredPasteGrams="900" />);
  expect(screen.getByText(/less than the .*soap this batch makes|below the/i)).toBeTruthy();
  expect(screen.queryByText(/Paste to weigh out/)).toBeNull();
});

test('explains rather than vanishing when the measured paste exceeds the target solution', () => {
  render(<PartialDilution {...PROPS} targetMl="1000" measuredPasteGrams="4100" />);
  expect(screen.getByText(/already weighs more than/i)).toBeTruthy();
});

describe('the measured-paste declaration (whole batch vs. what is left)', () => {
  test('defaults to the whole-batch declaration', () => {
    render(<PartialDilution {...PROPS} targetMl="1000" measuredPasteGrams="1480" />);
    expect(
      screen.getByRole('radio', { name: /the whole batch, before any dilution/i }),
    ).toHaveProperty('checked', true);
    expect(
      screen.getByRole('radio', { name: /what.s left after earlier dilutions/i }),
    ).toHaveProperty('checked', false);
  });

  test('a reading below the anhydrous floor is ACCEPTED once declared as what is left after earlier dilutions', () => {
    // 900 g is below the 1,200 g anhydrous floor and is refused in whole-batch mode
    // (see the test above) — but declared "remaining", it is not the whole batch, so
    // there is no floor to violate: the pot's own anhydrous soap is scaled down from the
    // measurement instead of assumed to be the recipe's full 1,200 g.
    render(
      <PartialDilution
        {...PROPS}
        targetMl="500"
        measuredPasteGrams="900"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.queryByText(/less than the .*soap this batch makes|below the/i)).toBeNull();
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
      <PartialDilution
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
      <PartialDilution
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

  test('the drift note does not claim the batch figures use a remaining-paste measurement', () => {
    // The whole-batch drift note ("battch figures above use your measurement too") is
    // false once the measurement is declared remaining — DilutionPanel's batch row does
    // not apply it (Commit 1's other guard). Must not repeat that claim here.
    render(
      <PartialDilution
        {...PROPS}
        targetMl="1000"
        measuredPasteGrams="1480"
        measuredPasteIsRemaining
      />,
    );
    expect(screen.queryByText(/batch figures above use your measurement too/i)).toBeNull();
  });
});
