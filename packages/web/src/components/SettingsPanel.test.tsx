// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import { DEFAULT_MOLD_SIZER_INPUT } from '../lib/moldSizer';

afterEach(cleanup);

function Harness() {
  const [settings, setSettings] = useState<RecipeSettings>(DEFAULT_SETTINGS);
  return (
    <>
      <SettingsPanel
        settings={settings} setSettings={setSettings} weightUnit="g"
        totalOilGrams={1000} lyeGrams={140} waterSuggestion={null}
        moldSizerInput={DEFAULT_MOLD_SIZER_INPUT} onMoldSizerChange={() => {}}
        liveOilBatchFraction={null} onApplySuggestedOilGrams={() => {}}
      />
      <output aria-label="superfat-echo">{settings.superfatPercent}</output>
    </>
  );
}

test('editing superfat updates settings state', () => {
  render(<Harness />);
  const input = screen.getByLabelText('Superfat %') as HTMLInputElement;
  expect(input.value).toBe('5');
  fireEvent.change(input, { target: { value: '8' } });
  expect(screen.getByLabelText('superfat-echo').textContent).toBe('8');
});

test('dual lye type reveals the KOH blend field', () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Lye type'), { target: { value: 'dual' } });
  expect(screen.getByLabelText('KOH % of alkali (by weight)')).toBeTruthy();
});

test('NaOH purity field is driven by config with correct min/max/step', () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Lye type'), { target: { value: 'dual' } });
  const input = screen.getByLabelText('NaOH purity %') as HTMLInputElement;
  expect(input.getAttribute('min')).toBe('1');
  expect(input.getAttribute('max')).toBe('100');
  expect(input.getAttribute('step')).toBe('0.1');
});
