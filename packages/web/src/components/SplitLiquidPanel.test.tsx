// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SplitLiquidPanel } from './SplitLiquidPanel';
import type { SplitLiquidSettings } from '../lib/recipe';

afterEach(cleanup);

const ENABLED: SplitLiquidSettings = {
  enabled: true,
  presetKey: '',
  name: '',
  customWaterPercent: '',
  sizeMode: 'percent_of_oils',
  amount: '10',
  addAt: 'trace',
};

function renderPanel(overrides: Partial<Parameters<typeof SplitLiquidPanel>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <SplitLiquidPanel
      splitLiquid={ENABLED}
      totalOilGrams={1000}
      lyeGrams={135}
      weightUnit="g"
      waterMode="percent_of_oils"
      waterSuggestion={null}
      lyeWaterStatus={null}
      splitLiquidGrams={100}
      allocation={null}
      onChange={onChange}
      {...overrides}
    />,
  );
  return { onChange };
}

test('selecting a preset sets presetKey and fills the name', () => {
  const { onChange } = renderPanel();
  fireEvent.change(screen.getByLabelText('Liquid preset'), {
    target: { value: 'yogurt-greek' },
  });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ presetKey: 'yogurt-greek', name: 'Greek yogurt' }),
  );
});

test('switching back to custom clears the preset but keeps the typed name', () => {
  const { onChange } = renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'milk', name: 'oat milk' },
  });
  fireEvent.change(screen.getByLabelText('Liquid preset'), { target: { value: '' } });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ presetKey: '', name: 'oat milk' }),
  );
});

test('shows the sugar advisory for a sugary preset', () => {
  renderPanel({ splitLiquid: { ...ENABLED, presetKey: 'milk', name: 'Milk (dairy or plant)' } });
  expect(screen.getByText(/sugars can accelerate trace/i)).toBeTruthy();
});

test('warns when the lye solution is short of dissolving water', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)', addAt: 'lye' },
    lyeWaterStatus: { effectiveWaterGrams: 133.7, floorGrams: 135, shortfallGrams: 1.3 },
  });
  expect(screen.getByRole('alert').textContent).toMatch(/not enough water/i);
});

test('custom-liquid shortfall blames the lye water, not the liquid', () => {
  // Base water below the 1:1 floor (e.g. lye concentration typed above 50%): the
  // warning must not claim a pure-water custom liquid is "only 100% water".
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: '', name: 'herbal tea', addAt: 'lye' },
    lyeWaterStatus: { effectiveWaterGrams: 120, floorGrams: 135, shortfallGrams: 15 },
  });
  const alert = screen.getByRole('alert').textContent ?? '';
  expect(alert).toMatch(/not enough water/i);
  expect(alert).not.toMatch(/% water/);
});

test('preset shortfall names the liquid water fraction', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)', addAt: 'lye' },
    lyeWaterStatus: { effectiveWaterGrams: 133.7, floorGrams: 135, shortfallGrams: 1.3 },
  });
  expect(screen.getByRole('alert').textContent).toMatch(/only 68% water/i);
});

test('custom liquid shows an optional % water field; presets hide it', () => {
  const { onChange } = renderPanel({ splitLiquid: { ...ENABLED, presetKey: '', name: 'coconut cream' } });
  const field = screen.getByLabelText('% water (optional)');
  fireEvent.change(field, { target: { value: '55' } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ customWaterPercent: '55' }));
  cleanup();
  renderPanel({ splitLiquid: { ...ENABLED, presetKey: 'milk', name: 'Milk (dairy or plant)' } });
  expect(screen.queryByLabelText('% water (optional)')).toBeNull();
});

test('explains the technique and the add-at choice with info tips', () => {
  renderPanel();
  expect(screen.getByLabelText('About split liquid')).toBeTruthy();
  expect(screen.getByLabelText('About add at')).toBeTruthy();
});

test('shortfall warning explains the minimum in plain words, not "1:1 floor"', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'coconut-milk-canned', name: 'Coconut milk (canned)', addAt: 'lye' },
    lyeWaterStatus: { effectiveWaterGrams: 133.7, floorGrams: 135, shortfallGrams: 1.3 },
  });
  const alert = screen.getByRole('alert').textContent ?? '';
  expect(alert).toMatch(/equal parts water and lye/i);
  expect(alert).not.toMatch(/floor/i);
});

test('no shortfall warning when the floor is met', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'milk', name: 'Milk', addAt: 'lye' },
    lyeWaterStatus: { effectiveWaterGrams: 220, floorGrams: 135, shortfallGrams: 0 },
  });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('offers the four sizing modes, disabling budget modes outside percent-of-oils water', () => {
  renderPanel({ waterMode: 'lye_concentration' });
  const select = screen.getByLabelText('Sized by') as HTMLSelectElement;
  const rest = Array.from(select.options).find((o) => o.value === 'rest')!;
  const pctLiquid = Array.from(select.options).find((o) => o.value === 'percent_of_liquid')!;
  expect(rest.disabled).toBe(true);
  expect(pctLiquid.disabled).toBe(true);
  cleanup();
  renderPanel({ waterMode: 'percent_of_oils' });
  const select2 = screen.getByLabelText('Sized by') as HTMLSelectElement;
  expect(Array.from(select2.options).every((o) => !o.disabled)).toBe(true);
});

test('hides the amount field for rest sizing and shows the allocation line', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, sizeMode: 'rest', amount: '' },
    splitLiquidGrams: 192,
    allocation: { lyeWaterGrams: 138, targetLiquidGrams: 330 },
  });
  expect(screen.queryByLabelText('Amount')).toBeNull();
  expect(screen.getByText(/138 g lye water .* 192 g .* 330 g total liquid/i)).toBeTruthy();
});

test('recommends trace when a sugary preset is set to the lye water', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'milk', name: 'Milk (dairy or plant)', addAt: 'lye' },
  });
  expect(screen.getByText(/recommended: at trace/i)).toBeTruthy();
});

test('warns about thicker trace when a thick liquid displaces meaningful water', () => {
  // Heavy cream at 42% non-water: 200 g displaces 84 g of real water from a 330 g budget.
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'heavy-cream', name: 'Heavy cream', sizeMode: 'percent_of_liquid', amount: '60' },
    splitLiquidGrams: 200,
    allocation: { lyeWaterGrams: 130, targetLiquidGrams: 330 },
  });
  expect(screen.getByText(/thicker, faster trace/i)).toBeTruthy();
});
