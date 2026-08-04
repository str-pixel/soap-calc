// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NeutralizePanel } from './NeutralizePanel';
import type { NeutralizationResult } from '@soap-calc/core';

afterEach(cleanup);

const RESULT: NeutralizationResult = {
  lyeExcessPercent: 2,
  excessKohGrams: 4,
  excessNaohGrams: 0,
  citricAcidGrams: 5,
  stearicAcidGrams: 22,
  dilutionWaterGrams: 20,
  targetPhLow: 9,
  targetPhHigh: 10.5,
};

test('renders the citric estimate, 1:4 water, and the caution', () => {
  render(<NeutralizePanel neutralization={RESULT} weightUnit="g" />);
  expect(screen.getByText('Citric acid (estimate)')).toBeTruthy();
  expect(screen.getByText('5 g')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('never');
});

test('shows the NaOH excess line only for dual lye', () => {
  render(<NeutralizePanel neutralization={{ ...RESULT, excessNaohGrams: 1 }} weightUnit="g" />);
  expect(screen.getByText('Excess NaOH')).toBeTruthy();
});

test('shows the stearic-acid alternative and its cannot-overdose note', () => {
  render(<NeutralizePanel neutralization={RESULT} weightUnit="g" />);
  expect(screen.getByText('Or stearic acid')).toBeTruthy();
  expect(screen.getByText('22 g')).toBeTruthy();
  expect(screen.getByText(/cannot be overdosed/)).toBeTruthy();
});

test('the cannot-overdose note names stearic acid explicitly, not just "it" — it sits right after the citric-acid alert and must not read as licensing an unmetered citric dose', () => {
  render(<NeutralizePanel neutralization={RESULT} weightUnit="g" />);
  const note = screen.getByText(/cannot be overdosed/);
  expect(note.textContent).toMatch(/^Stearic acid/);
});
