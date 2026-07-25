// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SuperfatWaterPanel } from './SuperfatWaterPanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function Harness({
  process = 'cp' as ProcessId,
  initial,
}: {
  process?: ProcessId;
  initial?: Partial<RecipeSettings>;
} = {}) {
  const [settings, setSettings] = useState<RecipeSettings>({ ...DEFAULT_SETTINGS, ...initial });
  return <SuperfatWaterPanel settings={settings} setSettings={setSettings} process={process} />;
}

// A one-row post-cook superfat fully allocating a 5% budget, matching the HP process default.
const ONE_PCSF = {
  postCookSuperfatTotalPercent: '5',
  postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }],
};

test('renders the Superfat & water panel heading', () => {
  render(<Harness />);
  expect(screen.getByRole('heading', { name: 'Superfat & water' })).toBeTruthy();
});

test('editing the Superfat field updates settings state', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Superfat %') as HTMLInputElement;
  expect(input.value).toBe('5');
  fireEvent.change(input, { target: { value: '8' } });
  expect((screen.getByLabelText('Superfat %') as HTMLInputElement).value).toBe('8');
});

test('Superfat allows a negative min only for LS', () => {
  const { rerender } = render(<Harness process="cp" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('0');
  rerender(<Harness process="ls" />);
  expect(screen.getByLabelText('Superfat %').getAttribute('min')).toBe('-5');
});

test('changing the water method swaps the editable water-ratio field', () => {
  render(<Harness />);
  expect(screen.getByLabelText('Water % of oils')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Water method'), { target: { value: 'lye_concentration' } });
  expect(screen.getByLabelText('Lye concentration %')).toBeTruthy();
  expect(screen.queryByLabelText('Water % of oils')).toBeNull();
});

test('post-cook superfat controls render for HP (per-oil row + method)', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  expect(screen.getByLabelText('Post-cook superfat oil 1')).toBeTruthy();
  expect(screen.getByLabelText('Post-cook superfat % 1')).toBeTruthy();
  expect(screen.getByLabelText('Post-cook superfat method')).toBeTruthy();
});

test('post-cook superfat controls render for LS', () => {
  render(<Harness process="ls" initial={ONE_PCSF} />);
  expect(screen.getByLabelText('Post-cook superfat % 1')).toBeTruthy();
});

test('post-cook superfat controls are hidden for CP (no cook stage)', () => {
  render(<Harness process="cp" initial={ONE_PCSF} />);
  expect(screen.queryByLabelText('Post-cook superfat % 1')).toBeNull();
  expect(screen.queryByLabelText('Post-cook superfat method')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add post-cook superfat oil' })).toBeNull();
});

test('editing a post-cook superfat row % updates settings state', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  const input = screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement;
  fireEvent.change(input, { target: { value: '4' } });
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('4');
});

test('the post-cook superfat total is a single slider (not one per oil)', () => {
  const { container } = render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '5',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '2' },
        ],
      }}
    />,
  );
  // One total slider drives the budget; the oil rows are plain number inputs, no per-oil
  // sliders. Three range inputs total: Superfat, water, and the PCSF total (2 oils add none).
  expect(screen.getByLabelText('Post-cook superfat total %')).toBeTruthy();
  expect(container.querySelectorAll('input[type="range"]').length).toBe(3);
});

test('an oil % is capped at the remaining budget (sum can never exceed the total)', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '5',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '2' },
        ],
      }}
    />,
  );
  // Row 2 has only 2% headroom (5 total − 3 on row 1); typing 9 clamps to 2.
  const row2 = screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement;
  fireEvent.change(row2, { target: { value: '9' } });
  expect((screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement).value).toBe('2');
  // Row 1 is untouched (siblings are independent, never rescaled).
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('3');
});

test('lowering the total below the allocated sum trims the oils to fit', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatTotalPercent: '10',
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '6' },
          { oilId: 'jojoba-oil', percent: '4' },
        ],
      }}
    />,
  );
  // Drop the budget 10 → 5; the 6/4 split scales to 3/2 (proportional trim).
  fireEvent.change(screen.getByLabelText('Post-cook superfat total %'), { target: { value: '5' } });
  expect((screen.getByLabelText('Post-cook superfat % 1') as HTMLInputElement).value).toBe('3');
  expect((screen.getByLabelText('Post-cook superfat % 2') as HTMLInputElement).value).toBe('2');
});

test('each method shows a plain-language explanation that changes with the selection', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  // Subtract is the default — its explanation is shown.
  expect(screen.getByText(/trims the lye/i)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Post-cook superfat method'), { target: { value: 'append' } });
  expect(screen.getByText(/on top after the cook/i)).toBeTruthy();
});

test('Add oil appends a second post-cook superfat row', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  expect(screen.queryByLabelText('Post-cook superfat oil 2')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Add post-cook superfat oil' }));
  expect(screen.getByLabelText('Post-cook superfat oil 2')).toBeTruthy();
  expect(screen.getByLabelText('Post-cook superfat % 2')).toBeTruthy();
});

test('Remove drops a post-cook superfat row', () => {
  render(
    <Harness
      process="hp"
      initial={{
        postCookSuperfatOils: [
          { oilId: 'shea-butter', percent: '3' },
          { oilId: 'jojoba-oil', percent: '2' },
        ],
      }}
    />,
  );
  expect(screen.getByLabelText('Post-cook superfat oil 2')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Remove post-cook superfat row 1'));
  // One row left; the second row's controls are gone.
  expect(screen.queryByLabelText('Post-cook superfat oil 2')).toBeNull();
  expect(screen.getByLabelText('Post-cook superfat oil 1')).toBeTruthy();
});

test('the post-cook superfat method toggles, defaulting to subtract', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  const select = screen.getByLabelText('Post-cook superfat method') as HTMLSelectElement;
  expect(select.value).toBe('subtract');
  fireEvent.change(select, { target: { value: 'append' } });
  expect((screen.getByLabelText('Post-cook superfat method') as HTMLSelectElement).value).toBe('append');
});
