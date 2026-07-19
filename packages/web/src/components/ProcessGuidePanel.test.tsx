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

test('an LS variant shows a hedged temp and no cook stages', () => {
  render(<ProcessGuidePanel process="ls" processVariant="ls-lowtemp" />);
  expect(screen.getByText(/≈.*°F.*\(estimated\)/)).toBeTruthy();
  expect(screen.queryByText('trace')).toBeNull();
});
