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
  percentOfOil: '10',
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

test('no shortfall warning when the floor is met', () => {
  renderPanel({
    splitLiquid: { ...ENABLED, presetKey: 'milk', name: 'Milk', addAt: 'lye' },
    lyeWaterStatus: { effectiveWaterGrams: 220, floorGrams: 135, shortfallGrams: 0 },
  });
  expect(screen.queryByRole('alert')).toBeNull();
});
