// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LS_PRESERVATIVES } from '@soap-calc/core';
import type { WeightUnit } from '../lib/recipe';
import { PreservativeSnippet } from './PreservativeSnippet';

afterEach(cleanup);

// Diverges from App's wiring on purpose: id, custom name and dose are now RecipeSettings
// fields that App threads through one `setSettings` object, but the Harness holds three
// independent useStates instead. That means the reseed-on-pick this component performs
// (its onChange writes both id and dose in one handler) is exercised here whether or not
// App's own handler still uses the functional setSettings((s) => …) form it needs — a
// broken App reducer would still pass every test in this file, because setId/setDose
// never collide the way two writes into the same settings object can. Nothing here
// guards App's wiring; see the reseed-on-pick test in App.test.tsx for that.
function Harness({
  finishedGrams = 4000,
  basisScope,
  portionIsRecorded,
  weightUnit = 'g',
}: {
  finishedGrams?: number | null;
  basisScope?: 'batch' | 'portion';
  portionIsRecorded?: boolean;
  weightUnit?: WeightUnit;
}) {
  const [id, setId] = useState<string>(LS_PRESERVATIVES[0].id);
  const [customName, setCustomName] = useState('');
  const [dose, setDose] = useState(String(LS_PRESERVATIVES[0].defaultPct));
  return (
    <PreservativeSnippet
      finishedGrams={finishedGrams}
      basisScope={basisScope}
      portionIsRecorded={portionIsRecorded}
      weightUnit={weightUnit}
      preservativeId={id}
      onPreservativeIdChange={setId}
      preservativeCustomName={customName}
      onPreservativeCustomNameChange={setCustomName}
      dosePct={dose}
      onDosePctChange={setDose}
    />
  );
}

function picker(): HTMLSelectElement {
  return screen.getByLabelText('Which preservative') as HTMLSelectElement;
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

test('offers the four preservatives plus Custom… in one menu, anchor choice selected', () => {
  render(<Harness />);
  const options = Array.from(picker().options).map((o) => o.textContent);
  expect(options).toEqual([
    'Custom…',
    'Suttocide A',
    'Liquid Germall Plus',
    'Glydant Plus',
    'Phenoxyethanol',
  ]);
  expect(picker().value).toBe('suttocide-a');
});

test("Label-in-Name: the menu's accessible name is its visible caption", () => {
  // Inherited obligation from the radiogroup this replaced — the visible caption and the
  // accessible name must not diverge.
  render(<Harness />);
  expect(screen.getByText('Which preservative')).toBeTruthy();
  expect(picker()).toBeTruthy(); // getByLabelText('Which preservative') resolved it
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

test('a RECORDED Custom amount asks for the two fields that size it, not for an amount', () => {
  // Gradual dilution takes the "Amount to make (ml)" input off the panel entirely and
  // replaces it with the paste weighed out and the water poured in. Asking for an amount
  // there names a control the maker cannot see — and it was the snippet's normal state in
  // that mode, since nothing ever fills that field in.
  render(<Harness finishedGrams={null} basisScope="portion" portionIsRecorded />);
  expect(screen.getByText(/paste weighed out and the water added so far/i)).toBeTruthy();
  expect(screen.queryByText(/Enter an Amount to make/i)).toBeNull();
  expect(screen.queryByText(/Enter oils and a dilution target/)).toBeNull();
});

test('a recorded jar is still dosed and named as the custom amount it is', () => {
  // The flag changes the empty state and nothing else: the base row keeps the scope
  // toggle's own wording, because that is what the maker chose up the panel.
  render(<Harness finishedGrams={1300} basisScope="portion" portionIsRecorded />);
  expect(screen.getByText('≈ Finished product (custom amount)')).toBeTruthy();
  expect(screen.getByText('13 g')).toBeTruthy(); // 1% of the 1,300 g jar
});

test('picking another preservative reseeds the dose with ITS default and shows its facts', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: 'liquid-germall-plus' } });
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
  // 2% w/w of a 4,000 g basis: dose = basis × pct/(100−pct) = 4,000 × 2/98 = 81.63… → 82 g
  // (spec §3, decision 5 — the typed % is true of the bottle, not of the basis alone).
  expect(screen.getByText('82 g')).toBeTruthy();
  expect(screen.queryByText('40 g')).toBeNull();   // never the old clamped 1%
});

test("a dose above a supplier ceiling says whose maximum it is, and still computes", () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: 'liquid-germall-plus' } });
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
  expect(screen.getByRole('alert').textContent).toContain('less than 100%');
  expect(screen.queryByText('Preservative to add')).toBeNull();
});

test('a dose of exactly 100% is refused in the same words as over-100 — the formula divides by zero, not by a hair', () => {
  // lsPreservativeDoseTier moves 'impossible' to pct >= 100 (spec §3: the w/w formula
  // diverges at 100), so "100% or less" was self-refuting the moment 100 itself became
  // impossible — the copy has to say "less than 100%" for the boundary to be a true
  // statement of its own rule.
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '100' } });
  expect(screen.getByRole('alert').textContent).toContain('less than 100%');
  expect(screen.queryByText('Preservative to add')).toBeNull();
});

test('an impossible dose does not fall back to the enter-oils hint', () => {
  // Regression: the results gate must not special-case 'impossible' — finishedGrams is
  // already set (oils and a dilution ARE entered), so the empty-state hints must not
  // render just because the dose itself is refused.
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(doseInput(), { target: { value: '150' } });
  expect(screen.getByRole('alert').textContent).toContain('less than 100%');
  expect(screen.queryByText('Preservative to add')).toBeNull();
  expect(screen.queryByText(/Enter oils and a dilution target/)).toBeNull();
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
  fireEvent.change(picker(), { target: { value: 'glydant-plus' } });
  expect(screen.getByText(/will generally need the warning/)).toBeTruthy();
  // Germall: no categorical claim, but never silence — it contains a releaser, and the
  // note says which one and what to check it against
  fireEvent.change(picker(), { target: { value: 'liquid-germall-plus' } });
  expect(screen.queryByText(/will generally need the warning/)).toBeNull();
  expect(screen.getByText(/formaldehyde releaser \(diazolidinyl urea\)/)).toBeTruthy();
  expect(screen.getByText(/check released formaldehyde/)).toBeTruthy();
  // Phenoxyethanol releases nothing, so nothing about formaldehyde renders at all
  fireEvent.change(picker(), { target: { value: 'phenoxyethanol' } });
  expect(screen.queryByText(/formaldehyde/i)).toBeNull();
});

test('the copy owns the two framing claims: why a preservative, and that nothing is auto-added', () => {
  render(<Harness />);
  // need logic: growth is about water, not pH — and the paste's own dryness is stated
  // with the book's hedge (NEAR the no-growth line), never as categorically safe
  expect(screen.getByText(/whatever its pH/i)).toBeTruthy();
  expect(screen.getByText(/near the dryness that stops growth/i)).toBeTruthy();
  // saved with the recipe, but never counted in the oil, lye or batch arithmetic
  expect(screen.getByText(/never counted in the batch or lye figures/i)).toBeTruthy();
});

test('grams follow the app-wide weight unit', () => {
  render(<Harness finishedGrams={4000} weightUnit="oz" />);
  // 40 g ≈ 1.4 oz (formatWeight's magnitude-aware single decimal)
  expect(screen.getByText('1.4 oz')).toBeTruthy();
});

test('picking Custom… clears the dose — a dose typed for one product must not walk onto another', () => {
  render(<Harness finishedGrams={4000} />);
  expect(doseInput().value).toBe('1');
  fireEvent.change(picker(), { target: { value: '' } });
  expect(doseInput().value).toBe('');
  expect(screen.queryByText('Preservative to add')).toBeNull();
});

test('Custom… reveals a name field and suppresses every product-specific fact', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  expect(screen.getByLabelText('Name')).toBeTruthy();
  // no composition, no rated pH, no typical range, no formaldehyde note, no °C
  expect(screen.queryByText(/Sodium hydroxymethylglycinate/)).toBeNull();
  expect(screen.queryByText(/Rated pH/)).toBeNull();
  expect(screen.queryByText(/Typical /)).toBeNull();
  expect(screen.queryByText(/formaldehyde/i)).toBeNull();
  expect(screen.queryByText(/below 50 °C/)).toBeNull();
});

test('Custom… carries the standing note about what does not work at soap pH', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  expect(screen.getByText(/Few preservatives hold at soap's pH 9–10/)).toBeTruthy();
  expect(screen.getByText(/Organic-acid systems/)).toBeTruthy();
});

test('a custom dose still computes, and still refuses the impossible', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  fireEvent.change(doseInput(), { target: { value: '1.5' } });
  // 1.5% w/w of a 4,000 g basis: dose = 4,000 × 1.5/98.5 = 60.91… → 61 g (spec §3).
  expect(screen.getByText('61 g')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();     // no ceiling to breach
  fireEvent.change(doseInput(), { target: { value: '150' } });
  expect(screen.getByRole('alert').textContent).toContain('less than 100%');
});

test('Custom… suppresses product facts but never scope facts', () => {
  render(<Harness finishedGrams={257.5} basisScope="portion" />);
  fireEvent.change(picker(), { target: { value: '' } });
  fireEvent.change(doseInput(), { target: { value: '1' } });
  expect(screen.getByText('≈ Finished product (custom amount)')).toBeTruthy();
  expect(screen.getByText('2.6 g')).toBeTruthy();
});

test('switching back from Custom… to a product restores its own default dose', () => {
  render(<Harness finishedGrams={4000} />);
  fireEvent.change(picker(), { target: { value: '' } });
  fireEvent.change(picker(), { target: { value: 'glydant-plus' } });
  expect(doseInput().value).toBe('0.36');
  expect(screen.getByText(/DMDM hydantoin/)).toBeTruthy();
});
