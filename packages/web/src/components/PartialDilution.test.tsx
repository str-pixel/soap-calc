// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PartialDilution } from './PartialDilution';
import type { DilutionResult } from '@soap-calc/core';

afterEach(cleanup);

// 1,200 g anhydrous + 400 g cook water = 1,600 g paste; 2,400 g dilution water →
// 4,000 g solution = 3,883 ml at 1.03 g/ml.
const RESULT: DilutionResult = {
  anhydrousGrams: 1200, solutionGrams: 4000, totalWaterGrams: 2800,
  dilutionWaterGrams: 2400, glycerinGrams: 110, soapConcentrationPercent: 30, targetExceedsPaste: false,
};

const PROPS = { dilution: RESULT, weightUnit: 'g' as const };

test('scales paste and water to the amount asked for', () => {
  render(<PartialDilution {...PROPS} />);
  fireEvent.change(screen.getByLabelText('Amount to make (ml)'), { target: { value: '1000' } });
  // 1,000 of 3,883 ml ≈ 25.8% of the batch: 412 g paste, 618 g water.
  expect(screen.getByText('412 g')).toBeTruthy();
  expect(screen.getByText(/^618 g/)).toBeTruthy();
  expect(screen.getByText(/26% of the batch/)).toBeTruthy();
});

test('the water figure carries the other scale units, like the batch pour figure', () => {
  render(<PartialDilution {...PROPS} />);
  fireEvent.change(screen.getByLabelText('Amount to make (ml)'), { target: { value: '1000' } });
  expect(screen.getByText(/618 g \(21\.8 oz \/ 1\.36 lb\)/)).toBeTruthy();
});

test('says so when more is asked for than the batch holds', () => {
  render(<PartialDilution {...PROPS} />);
  fireEvent.change(screen.getByLabelText('Amount to make (ml)'), { target: { value: '9000' } });
  expect(screen.getByText(/whole batch/i)).toBeTruthy();
  expect(screen.getByText('1,600 g')).toBeTruthy(); // all the paste
});

test('shows no figures until an amount is entered', () => {
  render(<PartialDilution {...PROPS} />);
  expect(screen.queryByText(/Paste to weigh/)).toBeNull();
});

test('renders nothing without a dilution', () => {
  const { container } = render(<PartialDilution dilution={null} weightUnit="g" />);
  expect(container.innerHTML).toBe('');
});
