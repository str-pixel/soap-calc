// @vitest-environment jsdom
import { afterEach, describe, expect, it, test } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { DEFAULT_SETTINGS, type RecipeSettings } from '../lib/recipe';
import { DEFAULT_MOLD_SIZER_INPUT } from '../lib/moldSizer';
import type { ProcessId } from '../lib/process';

afterEach(cleanup);

function Harness({ process = 'cp' as ProcessId }: { process?: ProcessId } = {}) {
  const [settings, setSettings] = useState<RecipeSettings>(DEFAULT_SETTINGS);
  return (
    <>
      <SettingsPanel
        process={process}
        settings={settings} setSettings={setSettings} weightUnit="g"
        totalOilGrams={1000} lyeGrams={140} waterSuggestion={null}
        moldSizerInput={DEFAULT_MOLD_SIZER_INPUT} onMoldSizerChange={() => {}}
        liveOilBatchFraction={null} onApplySuggestedOilGrams={() => {}}
      />
      <output aria-label="superfat-echo">{settings.superfatPercent}</output>
      <output aria-label="pcsf-echo">{settings.postCookSuperfatPercent}</output>
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

const noop = () => {};
const baseProps = {
  setSettings: noop,
  weightUnit: 'g' as const,
  totalOilGrams: 0,
  lyeGrams: 0,
  waterSuggestion: null,
  moldSizerInput: DEFAULT_MOLD_SIZER_INPUT,
  onMoldSizerChange: noop,
  liveOilBatchFraction: null,
  onApplySuggestedOilGrams: noop,
};

describe('SettingsPanel lye gating', () => {
  it('LS process offers only KOH and dual (no plain NaOH bar option)', () => {
    render(<SettingsPanel {...baseProps} process="ls" settings={{ ...DEFAULT_SETTINGS, lyeType: 'koh' }} />);
    const select = screen.getByLabelText(/lye type/i);
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['koh', 'dual']);
  });

  it('CP process offers NaOH and dual', () => {
    render(<SettingsPanel {...baseProps} process="cp" settings={DEFAULT_SETTINGS} />);
    const select = screen.getByLabelText(/lye type/i);
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['naoh', 'dual']);
  });
});

describe('post-cook superfat fields', () => {
  it('render for hp (% field + oil picker)', () => {
    render(<SettingsPanel {...baseProps} process="hp" settings={DEFAULT_SETTINGS} />);
    expect(screen.getByLabelText('Post-cook superfat %')).toBeTruthy();
    expect(screen.getByLabelText('Oil')).toBeTruthy();
  });

  it('render for ls', () => {
    render(
      <SettingsPanel
        {...baseProps}
        process="ls"
        settings={{ ...DEFAULT_SETTINGS, lyeType: 'koh' }}
      />,
    );
    expect(screen.getByLabelText('Post-cook superfat %')).toBeTruthy();
    expect(screen.getByLabelText('Oil')).toBeTruthy();
  });

  it('are hidden for cp', () => {
    render(<SettingsPanel {...baseProps} process="cp" settings={DEFAULT_SETTINGS} />);
    expect(screen.queryByLabelText('Post-cook superfat %')).toBeNull();
    expect(screen.queryByLabelText('Oil')).toBeNull();
  });

  it('editing post-cook superfat % updates settings state', () => {
    render(<Harness process="hp" />);
    const input = screen.getByLabelText('Post-cook superfat %') as HTMLInputElement;
    expect(input.value).toBe('0');
    fireEvent.change(input, { target: { value: '5' } });
    expect(screen.getByLabelText('pcsf-echo').textContent).toBe('5');
  });
});

test('HP shows the PCSF method toggle and updates it; CP hides it', () => {
  render(<Harness process="hp" />);
  const select = screen.getByLabelText('Post-cook superfat method') as HTMLSelectElement;
  expect(select.value).toBe('append');
  fireEvent.change(select, { target: { value: 'subtract' } });
  expect(select.value).toBe('subtract'); // controlled by the Harness settings state
  cleanup();
  render(<Harness process="cp" />);
  expect(screen.queryByLabelText('Post-cook superfat method')).toBeNull();
});
