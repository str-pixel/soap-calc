// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MoldSizerPanel } from './MoldSizerPanel';
import { DEFAULT_MOLD_SIZER_INPUT } from '../lib/moldSizer';

afterEach(cleanup);

test('defaults to the rectangular shape with length/width/height fields', () => {
  render(
    <MoldSizerPanel
      input={DEFAULT_MOLD_SIZER_INPUT}
      weightUnit="g"
      oilBatchFraction={null}
      onChange={() => {}}
      onApply={() => {}}
    />,
  );
  expect(screen.getByText(/^Length/)).toBeTruthy();
  expect(screen.getByText(/^Width/)).toBeTruthy();
  expect(screen.queryByText(/^Radius/)).toBeNull();
});

test('switching to cylinder swaps in a radius field and drops width', () => {
  const onChange = vi.fn();
  render(
    <MoldSizerPanel
      input={DEFAULT_MOLD_SIZER_INPUT}
      weightUnit="g"
      oilBatchFraction={null}
      onChange={onChange}
      onApply={() => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText('Cylinder'));
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_MOLD_SIZER_INPUT, moldShape: 'cylinder' });
});

test('shows radius and height inputs and computes a suggested weight for a cylinder', () => {
  render(
    <MoldSizerPanel
      input={{
        ...DEFAULT_MOLD_SIZER_INPUT,
        moldShape: 'cylinder',
        radius: '4',
        height: '10',
      }}
      weightUnit="g"
      oilBatchFraction={null}
      onChange={() => {}}
      onApply={() => {}}
    />,
  );
  expect(screen.getByText(/^Radius/)).toBeTruthy();
  expect(screen.queryByText(/^Length/)).toBeNull();
  expect(screen.getByText(/Suggested oil weight/)).toBeTruthy();
});

test('waste factor above 50% explains itself instead of silently hiding the suggestion', () => {
  render(
    <MoldSizerPanel
      input={{ ...DEFAULT_MOLD_SIZER_INPUT, mode: 'bars', barCount: '10', barWeight: '100', wasteFactorPercent: '60' }}
      weightUnit="g"
      oilBatchFraction={0.72}
      onChange={() => {}}
      onApply={() => {}}
    />,
  );
  expect(screen.getByText(/above 50/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Apply to batch' })).toBeNull();
});

test('a non-finite waste factor does not show the over-50 alert beside a live suggestion', () => {
  render(
    <MoldSizerPanel
      input={{ ...DEFAULT_MOLD_SIZER_INPUT, mode: 'bars', barCount: '10', barWeight: '100', wasteFactorPercent: '1e999' }}
      weightUnit="g"
      oilBatchFraction={0.72}
      onChange={() => {}}
      onApply={() => {}}
    />,
  );
  expect(screen.queryByText(/above 50/i)).toBeNull();
});
