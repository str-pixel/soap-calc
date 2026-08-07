// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LS_PRESERVATIVES, type LsPreservativeId } from '@soap-calc/core';
import type { WeightUnit } from '../lib/recipe';
import { PreservativeSnippet } from './PreservativeSnippet';

afterEach(cleanup);

// Mirrors App's wiring exactly: id + dose are sibling session states, and the RESEED on
// pick is the component's job (its pick handler writes both), not the harness's.
function Harness({
  finishedGrams = 4000,
  weightUnit = 'g',
}: {
  finishedGrams?: number | null;
  weightUnit?: WeightUnit;
}) {
  const [id, setId] = useState<LsPreservativeId>(LS_PRESERVATIVES[0].id);
  const [dose, setDose] = useState(String(LS_PRESERVATIVES[0].defaultPct));
  return (
    <PreservativeSnippet
      finishedGrams={finishedGrams}
      weightUnit={weightUnit}
      preservativeId={id}
      onPreservativeIdChange={setId}
      dosePct={dose}
      onDosePctChange={setDose}
    />
  );
}

function doseInput(): HTMLInputElement {
  return screen.getByLabelText(/Dose \(% of finished product\)/) as HTMLInputElement;
}

test('renders collapsed by default — a snippet, not an open panel', () => {
  const { container } = render(<Harness />);
  const details = container.querySelector('details');
  expect(details).toBeTruthy();
  expect(details!.hasAttribute('open')).toBe(false);
});

test('offers the four preservatives as a radio group, anchor choice selected', () => {
  render(<Harness />);
  for (const label of ['Suttocide A', 'Liquid Germall Plus', 'Glydant Plus', 'Phenoxyethanol']) {
    expect(screen.getByRole('radio', { name: label })).toBeTruthy();
  }
  expect((screen.getByRole('radio', { name: 'Suttocide A' }) as HTMLInputElement).checked).toBe(
    true,
  );
});

test("Label-in-Name: the group's accessible name leads with its visible caption", () => {
  render(<Harness />);
  const group = screen.getByRole('radiogroup');
  const visibleLegend = 'Which preservative';
  expect(group.textContent).toContain(visibleLegend);
  expect(group.getAttribute('aria-label')!.startsWith(visibleLegend)).toBe(true);
});

test('the dose is seeded with the default and computes grams from the finished mass', () => {
  render(<Harness finishedGrams={4000} />);
  expect(doseInput().value).toBe('1');
  expect(screen.getByText('Preservative to add')).toBeTruthy();
  // 1% of 4,000 g finished product
  expect(screen.getByText('40 g')).toBeTruthy();
  expect(screen.getByText('≈ Finished product')).toBeTruthy();
  expect(screen.getByText('4,000 g')).toBeTruthy();
});

test('picking another preservative reseeds the dose with ITS default and shows its facts', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  expect(doseInput().value).toBe('0.5');
  // 0.5% of 4,000 g
  expect(screen.getByText('20 g')).toBeTruthy();
  // the selected product's own facts: composition, rated pH, typical range, 50 °C stage
  expect(screen.getByText(/diazolidinyl urea/)).toBeTruthy();
  expect(screen.getByText(/Rated pH 3–8/)).toBeTruthy();
  expect(screen.getByText(/below 50 °C for Liquid Germall Plus/)).toBeTruthy();
});

test('a dose above an EU ceiling is hard-clamped, and the message names the EU as the authority', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '2' } });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('1%');
  expect(alert.textContent).toContain('EU legal maximum');
  // the grams figure uses the CLAMPED 1%, not the typed 2%
  expect(screen.getByText('40 g')).toBeTruthy();
  expect(screen.queryByText('80 g')).toBeNull();
});

test("a dose above a supplier ceiling clamps too, and the message says it is the supplier's", () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  fireEvent.change(doseInput(), { target: { value: '0.8' } });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('0.5%');
  expect(alert.textContent).toContain('supplier');
  expect(alert.textContent).not.toContain('EU legal maximum');
  expect(screen.getByText('20 g')).toBeTruthy();
});

test('a dose at or under the ceiling raises no clamp message', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '0.5' } });
  expect(screen.queryByRole('alert')).toBeNull();
  // 0.5% of 4,000 g
  expect(screen.getByText('20 g')).toBeTruthy();
});

test('without a dilution there are no figures — only the enter-oils-first hint', () => {
  render(<Harness finishedGrams={null} />);
  expect(screen.getByText(/Enter oils and a dilution target/)).toBeTruthy();
  expect(screen.queryByText('Preservative to add')).toBeNull();
  expect(screen.queryByText('≈ Finished product')).toBeNull();
});

test('the formaldehyde-label note renders for the two releasers that cross the EU threshold, and only those', () => {
  render(<Harness />);
  // Suttocide A (default) carries it
  expect(screen.getByText(/releases formaldehyde/)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Glydant Plus' }));
  expect(screen.getByText(/releases formaldehyde/)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  expect(screen.queryByText(/releases formaldehyde/)).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Phenoxyethanol' }));
  expect(screen.queryByText(/releases formaldehyde/)).toBeNull();
});

test('the copy owns the two framing claims: why a preservative, and that nothing is auto-added', () => {
  render(<Harness />);
  // need logic: growth is about water, not pH
  expect(screen.getByText(/whatever its pH/i)).toBeTruthy();
  // bench figure: the recipe itself is never touched
  expect(screen.getByText(/never added into the recipe/i)).toBeTruthy();
});

test('grams follow the app-wide weight unit', () => {
  render(<Harness finishedGrams={4000} weightUnit="oz" />);
  // 40 g ≈ 1.4 oz (formatWeight's magnitude-aware single decimal)
  expect(screen.getByText('1.4 oz')).toBeTruthy();
});
