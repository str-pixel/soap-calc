// @vitest-environment jsdom
import { afterEach, describe, expect, it, test, vi } from 'vitest';
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
        moldSizerInput={DEFAULT_MOLD_SIZER_INPUT} onMoldSizerChange={() => {}}
        liveOilBatchFraction={null} onApplySuggestedOilGrams={() => {}}
      />
      <output aria-label="superfat-echo">{settings.superfatPercent}</output>
    </>
  );
}

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

describe('post-cook superfat fields moved to Superfat & water', () => {
  // The %, oil, and method controls now live in SuperfatWaterPanel (see its test file);
  // SettingsPanel must not still render them, or they'd appear twice for HP/LS.
  it('are absent from SettingsPanel for hp', () => {
    render(<SettingsPanel {...baseProps} process="hp" settings={DEFAULT_SETTINGS} />);
    expect(screen.queryByLabelText('Post-cook superfat %')).toBeNull();
    expect(screen.queryByLabelText('Post-cook superfat oil')).toBeNull();
    expect(screen.queryByLabelText('Post-cook superfat method')).toBeNull();
  });

  it('are absent from SettingsPanel for ls', () => {
    render(
      <SettingsPanel {...baseProps} process="ls" settings={{ ...DEFAULT_SETTINGS, lyeType: 'koh' }} />,
    );
    expect(screen.queryByLabelText('Post-cook superfat %')).toBeNull();
  });
});

describe('cook vessel volume (HP vessel-size guard input)', () => {
  it('renders only for HP', () => {
    render(<SettingsPanel {...baseProps} process="hp" settings={DEFAULT_SETTINGS} />);
    expect(screen.getByLabelText('Cook vessel volume (L)')).toBeTruthy();
    cleanup();
    render(<SettingsPanel {...baseProps} process="cp" settings={DEFAULT_SETTINGS} />);
    expect(screen.queryByLabelText('Cook vessel volume (L)')).toBeNull();
    cleanup();
    render(<SettingsPanel {...baseProps} process="ls" settings={{ ...DEFAULT_SETTINGS, lyeType: 'koh' }} />);
    expect(screen.queryByLabelText('Cook vessel volume (L)')).toBeNull();
  });

  it('calls onVesselVolumeLitersChange when edited', () => {
    const onChange = vi.fn();
    render(
      <SettingsPanel
        {...baseProps}
        process="hp"
        settings={DEFAULT_SETTINGS}
        vesselVolumeLiters=""
        onVesselVolumeLitersChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Cook vessel volume (L)'), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith('4');
  });

  it('shows the computed multiple when supplied', () => {
    render(
      <SettingsPanel
        {...baseProps}
        process="hp"
        settings={DEFAULT_SETTINGS}
        vesselVolumeLiters="4"
        hpVesselMultiple={2.3456}
      />,
    );
    expect(screen.getByText(/2\.3.*batch volume/i)).toBeTruthy();
  });
});

test('process-notes textarea enforces the same cap normalizeSettings applies on load', () => {
  render(<Harness />);
  const notes = screen.getByPlaceholderText(/Trace notes/) as HTMLTextAreaElement;
  expect(notes.maxLength).toBe(20_000);
});

test('no longer hosts the Split liquid option (moved to the Superfat & water panel)', () => {
  render(<Harness />);
  expect(screen.queryByRole('heading', { name: 'Split liquid' })).toBeNull();
});
