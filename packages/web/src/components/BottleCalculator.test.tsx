// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { BottleCalculator } from './BottleCalculator';

afterEach(cleanup);

const PROPS = { bottleSizeMl: '500', onBottleSizeMlChange: () => {} };

test('counts whole bottles from the finished mass via the solution density', () => {
  // 4,805 g ÷ 1.03 g/ml = 4,665 ml; ÷ 500 = 9.33 → 9 whole bottles.
  render(<BottleCalculator finishedGrams={4805} {...PROPS} />);
  expect(screen.getByText('≈ Bottles filled (500 ml)')).toBeTruthy();
  expect(screen.getByText('9')).toBeTruthy();
});

test('names the part-bottle remainder the floor hides', () => {
  // 4,665 ml − 9 × 500 = 165 ml. Without this the count silently loses a third of a bottle.
  render(<BottleCalculator finishedGrams={4805} {...PROPS} />);
  expect(screen.getByText('165 ml')).toBeTruthy();
});

test('takes a bottle size and reports the change', () => {
  const onChange = vi.fn();
  render(<BottleCalculator finishedGrams={4805} bottleSizeMl="500" onBottleSizeMlChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Bottle size (ml)'), { target: { value: '250' } });
  expect(onChange).toHaveBeenCalledWith('250');
});

test('renders nothing before a dilution exists', () => {
  const { container } = render(<BottleCalculator finishedGrams={null} {...PROPS} />);
  expect(container.innerHTML).toBe('');
});

test('omits the count when the bottle size is blank or zero', () => {
  render(<BottleCalculator finishedGrams={4805} bottleSizeMl="" onBottleSizeMlChange={() => {}} />);
  expect(screen.queryByText(/Bottles filled/)).toBeNull();
});

test('never shows a remainder as large as a whole bottle', () => {
  // 1,544.5 g → 1,499.5 ml → 2 bottles and 499.5 ml over. Rounding that to "500 ml"
  // beside "Bottles filled (500 ml)" reads as an uncounted third bottle.
  render(<BottleCalculator finishedGrams={1544.5} {...PROPS} />);
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('499 ml')).toBeTruthy();
});
