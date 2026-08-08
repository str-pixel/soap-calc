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
  basisScope,
  weightUnit = 'g',
}: {
  finishedGrams?: number | null;
  basisScope?: 'batch' | 'portion';
  weightUnit?: WeightUnit;
}) {
  const [id, setId] = useState<LsPreservativeId>(LS_PRESERVATIVES[0].id);
  const [dose, setDose] = useState(String(LS_PRESERVATIVES[0].defaultPct));
  return (
    <PreservativeSnippet
      finishedGrams={finishedGrams}
      basisScope={basisScope}
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
  expect(screen.getByText('≈ Finished product (whole batch)')).toBeTruthy();
  expect(screen.getByText('4,000 g')).toBeTruthy();
});

test('the base row names the scope it came from, and the portion scope is a different mass', () => {
  // The dose is a % of what is being made. Both scopes render a base row; only the label
  // says which mass it is, so the label is the maker's one signal that a 258 g figure
  // beside a 4,000 g batch is not a mistake.
  render(<Harness finishedGrams={257.5} basisScope="portion" />);
  expect(screen.getByText('≈ Finished product (custom amount)')).toBeTruthy();
  expect(screen.queryByText('≈ Finished product (whole batch)')).toBeNull();
  // 1% of 257.5 g — the portion's dose, not the batch's 40 g
  expect(screen.getByText('2.6 g')).toBeTruthy();
});

test('a Custom amount with nothing to dose asks for the amount, not for oils', () => {
  // The null here means "no portion yet", not "no recipe yet" — and the maker is looking at
  // a screen with no batch figures on it. Falling back to the batch's mass is the bug this
  // whole state exists to refuse.
  render(<Harness finishedGrams={null} basisScope="portion" />);
  expect(screen.getByText(/Amount to make/i)).toBeTruthy();
  expect(screen.queryByText(/Enter oils and a dilution target/)).toBeNull();
  expect(screen.queryByText(/≈ Finished product/)).toBeNull();
});

test('picking another preservative reseeds the dose with ITS default and shows its facts', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  expect(doseInput().value).toBe('0.5');
  // 0.5% of 4,000 g
  expect(screen.getByText('20 g')).toBeTruthy();
  // the selected product's own facts: composition, rated pH, typical range, 50 °C stage
  expect(screen.getByText(/Propylene glycol \+ diazolidinyl urea/)).toBeTruthy();
  expect(screen.getByText(/Rated pH 3–8/)).toBeTruthy();
  expect(screen.getByText(/below 50 °C for Liquid Germall Plus/)).toBeTruthy();
});

test('a dose above an EU ceiling is NOT clamped — the alert names the EU, the figure follows the typed dose', () => {
  // The inverse of the old assertion, deliberately: the maker owns the number. Nothing on
  // screen may be computed from a dose they did not type.
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '2' } });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('1%');
  expect(alert.textContent).toContain('EU legal maximum');
  expect(screen.getByText('80 g')).toBeTruthy();   // 2% of 4,000 g — the typed dose
  expect(screen.queryByText('40 g')).toBeNull();   // never the old clamped 1%
});

test("a dose above a supplier ceiling says whose maximum it is, and still computes", () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  fireEvent.change(doseInput(), { target: { value: '0.8' } });
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain('0.5%');
  expect(alert.textContent).toContain('supplier');
  expect(alert.textContent).not.toContain('EU legal maximum');
  expect(screen.getByText('32 g')).toBeTruthy();   // 0.8% of 4,000 g
});

test('a dose inside the typical range raises nothing', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '0.7' } });
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(/Below the typical/)).toBeNull();
  expect(screen.getByText('28 g')).toBeTruthy();   // 0.7% of 4,000 g
});

test('an under-dose is flagged as a plain note, not an alert', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '0.2' } });
  expect(screen.getByText(/Below the typical 0.5–1% for Suttocide A/)).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();  // plain note: it must not steal focus
  expect(screen.getByText('8 g')).toBeTruthy();    // 0.2% of 4,000 g — still computed
});

test('a dose over 100% is refused outright — no figure, because it is not a dose', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '150' } });
  expect(screen.getByRole('alert').textContent).toContain('100% or less');
  expect(screen.queryByText('Preservative to add')).toBeNull();
});

test('the ceiling alert echoes the dose canonically, not as typed', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '2.500' } });
  expect(screen.getByRole('alert').textContent).toContain('2.5%');
  expect(screen.getByRole('alert').textContent).not.toContain('2.500%');
});

test('without a dilution there are no figures — only the enter-oils-first hint', () => {
  render(<Harness finishedGrams={null} />);
  expect(screen.getByText(/Enter oils and a dilution target/)).toBeTruthy();
  expect(screen.queryByText('Preservative to add')).toBeNull();
  expect(screen.queryByText(/≈ Finished product/)).toBeNull();
});

test('every formaldehyde releaser says so — outright where the threshold is generally crossed, as a check for Germall, silence only where there is nothing to release', () => {
  render(<Harness />);
  // Suttocide A (default) and Glydant Plus: the label duty stated outright
  expect(screen.getByText(/will generally need the warning/)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Glydant Plus' }));
  expect(screen.getByText(/will generally need the warning/)).toBeTruthy();
  // Germall: no categorical claim, but never silence — it contains a releaser, and the
  // note says which one and what to check it against
  fireEvent.click(screen.getByRole('radio', { name: 'Liquid Germall Plus' }));
  expect(screen.queryByText(/will generally need the warning/)).toBeNull();
  expect(screen.getByText(/formaldehyde releaser \(diazolidinyl urea\)/)).toBeTruthy();
  expect(screen.getByText(/check released formaldehyde/)).toBeTruthy();
  // Phenoxyethanol releases nothing, so nothing about formaldehyde renders at all
  fireEvent.click(screen.getByRole('radio', { name: 'Phenoxyethanol' }));
  expect(screen.queryByText(/formaldehyde/i)).toBeNull();
});

test('the copy owns the two framing claims: why a preservative, and that nothing is auto-added', () => {
  render(<Harness />);
  // need logic: growth is about water, not pH — and the paste's own dryness is stated
  // with the book's hedge (NEAR the no-growth line), never as categorically safe
  expect(screen.getByText(/whatever its pH/i)).toBeTruthy();
  expect(screen.getByText(/near the dryness that stops growth/i)).toBeTruthy();
  // bench figure: the recipe itself is never touched
  expect(screen.getByText(/never added into the recipe/i)).toBeTruthy();
});

test('grams follow the app-wide weight unit', () => {
  render(<Harness finishedGrams={4000} weightUnit="oz" />);
  // 40 g ≈ 1.4 oz (formatWeight's magnitude-aware single decimal)
  expect(screen.getByText('1.4 oz')).toBeTruthy();
});
