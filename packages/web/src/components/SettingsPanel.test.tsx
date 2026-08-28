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
        previewState={{ lines: [], batchOilGrams: '1000' } as never}
        getDraft={(_: string, c: string) => c}
        inputs={{
          batchInputId: 'batch-total',
          batchWeightInputId: 'batch-weight-total',
          setWeightUnit: () => {},
          handleBatchChange: () => {},
          commitBatchInput: () => {},
          handleBatchWeightChange: () => {},
          commitBatchWeightInput: () => {},
        } as never}
        batchWeightWithExtras={1204}
        recipeOilWeightGrams={1000}
        fixedBatchExtrasGrams={0}
      />
      <output aria-label="superfat-echo">{settings.superfatPercent}</output>
    </>
  );
}

test('dual lye type reveals the KOH blend field', () => {
  render(<Harness />);
  // Lye type is a segmented radio group now; each cell's accessible name is the full
  // LYE_TYPE_LABELS string the old <select>'s options carried.
  fireEvent.click(screen.getByRole('radio', { name: 'NaOH + KOH blend' }));
  expect(screen.getByLabelText('KOH % of alkali (by weight)')).toBeTruthy();
});

test('NaOH purity field is driven by config with correct min/max/step', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('radio', { name: 'NaOH + KOH blend' }));
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
  previewState: { lines: [], batchOilGrams: '1000' } as never,
  getDraft: (_: string, c: string) => c,
  inputs: {
    batchInputId: 'batch-total',
    batchWeightInputId: 'batch-weight-total',
    setWeightUnit: () => {},
    handleBatchChange: () => {},
    commitBatchInput: () => {},
    handleBatchWeightChange: () => {},
    commitBatchWeightInput: () => {},
  } as never,
  batchWeightWithExtras: 1204,
  recipeOilWeightGrams: 1000,
  fixedBatchExtrasGrams: 0,
};

describe('SettingsPanel lye gating', () => {
  it('LS process offers only KOH and dual (no plain NaOH bar option)', () => {
    render(<SettingsPanel {...baseProps} process="ls" settings={{ ...DEFAULT_SETTINGS, lyeType: 'koh' }} />);
    const group = screen.getByRole('radiogroup', { name: 'Lye type' });
    const options = within(group).getAllByRole('radio').map((o) => (o as HTMLInputElement).value);
    expect(options).toEqual(['koh', 'dual']);
  });

  it('CP process offers NaOH and dual', () => {
    render(<SettingsPanel {...baseProps} process="cp" settings={DEFAULT_SETTINGS} />);
    const group = screen.getByRole('radiogroup', { name: 'Lye type' });
    const options = within(group).getAllByRole('radio').map((o) => (o as HTMLInputElement).value);
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

test('batch basics (weight unit, total oil, total batch) render first in Settings', () => {
  render(<Harness />);
  const panel = screen.getByRole('heading', { name: 'Settings' }).closest('section')!;
  expect(screen.getByLabelText('Weight unit')).toBeTruthy();
  expect(screen.getByLabelText(/Total oil \(g\)/)).toBeTruthy();
  expect(screen.getByLabelText(/Total batch in g/)).toBeTruthy();
  // First ledger row in the panel is the batch basics, ahead of every other setting.
  const firstRow = panel.querySelector('.ledger__row')!;
  expect(firstRow.textContent).toContain('Weight unit');
});
