// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
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

test('refuses to size a portion when the paste is already more dilute than the target', () => {
  // targetExceedsPaste clamps dilutionWaterGrams to 0, which erases the real cook water:
  // the batch's true mass and volume can no longer be recovered from the result, so the
  // portion %, the clamp threshold and the "more than the batch holds" message would all
  // be wrong (measured: 39% shown where the truth was 18.4%). Say so instead of computing.
  render(
    <PartialDilution
      {...PROPS}
      dilution={{ ...RESULT, dilutionWaterGrams: 0, soapConcentrationPercent: 90, targetExceedsPaste: true }}
    />,
  );
  expect(screen.queryByLabelText('Amount to make (ml)')).toBeNull();
  expect(screen.getByText(/already more dilute/i)).toBeTruthy();
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
  expect(screen.getByLabelText(/whole batch/i)).toBeTruthy();
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
