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

// A one-row post-cook superfat, matching what the HP/LS process defaults seed.
const ONE_PCSF = { postCookSuperfatOils: [{ oilId: 'olive-oil', percent: '5' }] };

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

test('the post-cook superfat method toggles between append and subtract', () => {
  render(<Harness process="hp" initial={ONE_PCSF} />);
  const select = screen.getByLabelText('Post-cook superfat method') as HTMLSelectElement;
  expect(select.value).toBe('append');
  fireEvent.change(select, { target: { value: 'subtract' } });
  expect((screen.getByLabelText('Post-cook superfat method') as HTMLSelectElement).value).toBe('subtract');
});
