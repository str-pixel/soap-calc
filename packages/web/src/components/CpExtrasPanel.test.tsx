// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CpExtrasPanel } from './CpExtrasPanel';

afterEach(cleanup);

test('computes tsp→% of oil from a live input', () => {
  render(<CpExtrasPanel totalOilGrams={100} />);
  fireEvent.change(screen.getByLabelText('Teaspoons of additive'), { target: { value: '1' } });
  // 1 tsp * 4.1 g/tsp / 100 g oil = 4.1%
  expect(screen.getByText('4.10% of total oil weight')).toBeTruthy();
});

test('computes PPO→% of oil from a live input', () => {
  render(<CpExtrasPanel totalOilGrams={1000} />);
  fireEvent.change(screen.getByLabelText('PPO ounces per pound of oils'), {
    target: { value: '1' },
  });
  expect(screen.getByText('6.25% of total oil weight')).toBeTruthy();
});

test('renders the vanillin, antioxidant, and myth-buster notes', () => {
  render(<CpExtrasPanel totalOilGrams={1000} />);
  expect(screen.getByText(/darkens soap to tan\/brown/)).toBeTruthy();
  expect(screen.getByText(/BHT \+ 1% sodium citrate/)).toBeTruthy();
  expect(screen.getByText(/no free lye left/)).toBeTruthy();
  expect(screen.getByText(/gel phase is optional/)).toBeTruthy();
});
