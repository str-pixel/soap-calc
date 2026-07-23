// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { SuperfatWaterPanel } from './SuperfatWaterPanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function Harness({ process = 'cp' as ProcessId }: { process?: ProcessId } = {}) {
  const [settings, setSettings] = useState<RecipeSettings>(DEFAULT_SETTINGS);
  return <SuperfatWaterPanel settings={settings} setSettings={setSettings} process={process} />;
}

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
