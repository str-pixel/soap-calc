// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SplitLiquidPanel } from './SplitLiquidPanel';
import type { SplitLiquidRow } from '../lib/recipe';

afterEach(cleanup);

let n = 0;
const ROW = (over: Partial<SplitLiquidRow> = {}): SplitLiquidRow => ({
  key: `row-${n++}`,
  presetKey: '',
  name: '',
  customWaterPercent: '',
  sizeMode: 'percent_of_oils',
  amount: '10',
  addAt: 'trace',
  ...over,
});

function renderPanel(overrides: Partial<Parameters<typeof SplitLiquidPanel>[0]> = {}) {
  const onChange = vi.fn();
  const rows = overrides.rows ?? [ROW()];
  render(
    <SplitLiquidPanel
      rows={rows}
      process="cp"
      resolvedRows={rows.map((row) => ({ row, grams: 100 }))}
      totalOilGrams={1000}
      lyeGrams={135}
      weightUnit="g"
      waterMode="percent_of_oils"
      waterSuggestion={null}
      lyeWaterStatus={null}
      allocation={null}
      acidExtraLye={null}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

test('adds and removes liquid rows', () => {
  const { onChange } = renderPanel({ rows: [] });
  fireEvent.click(screen.getByRole('button', { name: /add liquid/i }));
  expect(onChange).toHaveBeenCalled();
  const added = onChange.mock.calls[0][0] as SplitLiquidRow[];
  expect(added).toHaveLength(1);

  cleanup();
  const two = [ROW({ name: 'aloe' }), ROW({ name: 'milk' })];
  const second = renderPanel({ rows: two });
  fireEvent.click(screen.getAllByRole('button', { name: /remove liquid/i })[0]);
  const afterRemove = second.onChange.mock.calls[0][0] as SplitLiquidRow[];
  expect(afterRemove.map((r) => r.name)).toEqual(['milk']);
});

test('selecting a preset sets presetKey and fills the row name', () => {
  const { onChange } = renderPanel();
  fireEvent.change(screen.getByLabelText('Liquid preset'), {
    target: { value: 'yogurt-greek' },
  });
  const rows = onChange.mock.calls[0][0] as SplitLiquidRow[];
  expect(rows[0]).toMatchObject({ presetKey: 'yogurt-greek', name: 'Greek yogurt' });
});

test('only one rest row: the option is disabled on other rows', () => {
  renderPanel({ rows: [ROW({ sizeMode: 'rest', amount: '' }), ROW()] });
  const selects = screen.getAllByLabelText('Sized by') as HTMLSelectElement[];
  const restOptionOf = (s: HTMLSelectElement) =>
    Array.from(s.options).find((o) => o.value === 'rest')!;
  expect(restOptionOf(selects[0]).disabled).toBe(false);
  expect(restOptionOf(selects[1]).disabled).toBe(true);
});

test('budget sizing modes are disabled outside percent-of-oils water', () => {
  renderPanel({ waterMode: 'lye_concentration' });
  const select = screen.getByLabelText('Sized by') as HTMLSelectElement;
  expect(Array.from(select.options).find((o) => o.value === 'rest')!.disabled).toBe(true);
  expect(
    Array.from(select.options).find((o) => o.value === 'percent_of_liquid')!.disabled,
  ).toBe(true);
});

test('shows the allocation line across all rows', () => {
  const rows = [ROW({ name: 'goat milk', sizeMode: 'rest', amount: '' })];
  renderPanel({
    rows,
    resolvedRows: rows.map((row) => ({ row, grams: 192 })),
    allocation: { lyeWaterGrams: 138, targetLiquidGrams: 330 },
  });
  expect(screen.getByText(/138 g lye water .* 192 g .* 330 g total liquid/i)).toBeTruthy();
});

test('warns when the lye solution is short of dissolving water', () => {
  const rows = [ROW({ presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)', addAt: 'lye' })];
  renderPanel({
    rows,
    resolvedRows: rows.map((row) => ({ row, grams: 165 })),
    lyeWaterStatus: { effectiveWaterGrams: 133.7, floorGrams: 135, shortfallGrams: 1.3 },
  });
  expect(screen.getByRole('alert').textContent).toMatch(/not enough water/i);
});

test('recommends trace when a sugary preset is aimed at the lye water', () => {
  renderPanel({
    rows: [ROW({ presetKey: 'milk', name: 'Milk (dairy or plant)', addAt: 'lye' })],
  });
  expect(screen.getByText(/recommended: at trace/i)).toBeTruthy();
});

test('shows the auto-added extra lye line when acid rows are present', () => {
  renderPanel({
    rows: [ROW({ presetKey: 'vinegar', name: 'Vinegar (5%)' })],
    acidExtraLye: { naohGrams: 11.1, kohGrams: 0 },
  });
  expect(screen.getByText(/\+11 g NaOH added to offset/i)).toBeTruthy();
});

test('per-row preview names the stage', () => {
  renderPanel({ rows: [ROW({ name: 'goat milk', addAt: 'trace' })] });
  expect(screen.getByText(/goat milk: 100 g \(At trace\)/i)).toBeTruthy();
});

test('allocation ratio label reflects acid-adjusted lye', () => {
  const rows = [ROW({ name: 'milk', sizeMode: 'rest', amount: '' })];
  renderPanel({
    rows,
    resolvedRows: rows.map((row) => ({ row, grams: 192 })),
    lyeGrams: 133.2,
    allocation: { lyeWaterGrams: 129.8, targetLiquidGrams: 330 },
    acidExtraLye: { naohGrams: 3.4, kohGrams: 0 },
  });
  const line = screen.getByText(/0\.97 : 1/).textContent ?? '';
  expect(line).toMatch(/lye water/i);
  expect(line).not.toMatch(/\(1 : 1\)/);
});

test('CP defaults a new liquid to the rest of the liquid budget', () => {
  const { onChange } = renderPanel({ rows: [], process: 'cp' });
  fireEvent.click(screen.getByRole('button', { name: /add liquid/i }));
  const rows = onChange.mock.calls[0][0] as SplitLiquidRow[];
  expect(rows[0].sizeMode).toBe('rest');
});

test('CP falls back to % of oils when rest is taken or budget modes are unavailable', () => {
  const existing = [ROW({ sizeMode: 'rest', amount: '' })];
  const { onChange } = renderPanel({ rows: existing, process: 'cp' });
  fireEvent.click(screen.getByRole('button', { name: /add liquid/i }));
  expect((onChange.mock.calls[0][0] as SplitLiquidRow[])[1].sizeMode).toBe('percent_of_oils');

  cleanup();
  const second = renderPanel({ rows: [], process: 'cp', waterMode: 'lye_concentration' });
  fireEvent.click(screen.getByRole('button', { name: /add liquid/i }));
  expect((second.onChange.mock.calls[0][0] as SplitLiquidRow[])[0].sizeMode).toBe('percent_of_oils');
});

test('HP and LS default a new liquid to % of oil weight', () => {
  for (const process of ['hp', 'ls'] as const) {
    cleanup();
    const { onChange } = renderPanel({ rows: [], process });
    fireEvent.click(screen.getByRole('button', { name: /add liquid/i }));
    expect((onChange.mock.calls[0][0] as SplitLiquidRow[])[0].sizeMode).toBe('percent_of_oils');
  }
});
