// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProcessGuidePanel } from './ProcessGuidePanel';

afterEach(cleanup);

test('HP-HTHP shows a firm temp, all 5 cook stages, and the over-mix caution', () => {
  render(<ProcessGuidePanel process="hp" processVariant="hp-hthp" />);
  expect(screen.getByText(/215 °F, ceiling 240 °F/)).toBeTruthy();
  expect(screen.queryByText(/≈/)).toBeNull();
  expect(screen.getByText('trace')).toBeTruthy();
  expect(screen.getByText('applesauce')).toBeTruthy();
  expect(screen.getByText('expansion')).toBeTruthy();
  expect(screen.getByText('mashed potato')).toBeTruthy();
  expect(screen.getByText('gel / neat')).toBeTruthy();
  expect(screen.getByText(/stop mixing once the batter reaches neat/)).toBeTruthy();
});

test('HP-fluid shows a hedged temp', () => {
  render(<ProcessGuidePanel process="hp" processVariant="hp-fluid" />);
  expect(screen.getByText(/≈.*°F.*\(estimated\)/)).toBeTruthy();
});

test('CP shows the soaping-temp note and no cook stages', () => {
  render(<ProcessGuidePanel process="cp" processVariant="cp" />);
  expect(screen.getByText(/comfortable working temperature/)).toBeTruthy();
  expect(screen.queryByText('trace')).toBeNull();
  expect(screen.queryByText(/stop mixing once the batter reaches neat/)).toBeNull();
});

// The per-variant hedged-temp case (a heated LS variant with an unverified in-cook target)
// no longer exists: LS collapsed to a single ambient variant (temp: null) whose method is
// now derived from the hold temperature — see core's ls-method.test.ts, which owns that
// ground (2026-08-01 LS temperature-method redesign, task 3).
test('LS shows the ambient no-cook note, like CP', () => {
  render(<ProcessGuidePanel process="ls" processVariant="ls" />);
  expect(screen.getByText(/comfortable working temperature/)).toBeTruthy();
  expect(screen.queryByText('trace')).toBeNull();
});

test('an invalid processVariant renders nothing instead of throwing', () => {
  expect(() =>
    render(
      <ProcessGuidePanel
        process="cp"
        processVariant={'bogus-variant' as unknown as import('../lib/process').ProcessVariantId}
      />,
    ),
  ).not.toThrow();
  expect(screen.queryByText('Process guide')).toBeNull();
});
