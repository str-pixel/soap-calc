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
