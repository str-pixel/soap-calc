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
  // The tested dose is 0.1% each (1 ppt), not the 1% three craft books print — see the
  // insights.ts comment on high_pufa_post_cook_superfat. CP and LS must not disagree.
  expect(screen.getByText(/0\.1% BHT \+ 0\.1% sodium citrate/)).toBeTruthy();
  expect(screen.getByText(/no free lye left/)).toBeTruthy();
  expect(screen.getByText(/gel is just cosmetic/i)).toBeTruthy();
});


