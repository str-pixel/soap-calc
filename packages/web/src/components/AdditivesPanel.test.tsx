// @vitest-environment jsdom
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADDITIVE_CATALOG } from '@soap-calc/core';
import { AdditivesPanel } from './AdditivesPanel';
import type { AdditiveLine } from '../lib/recipe';
import type { ComputedAdditive } from '../lib/calculateAdditives';

afterEach(cleanup);

function makeLine(overrides: Partial<AdditiveLine> = {}): AdditiveLine {
  return {
    key: 'a1',
    catalogId: '',
    name: 'Fragrance',
    amount: '2',
    basis: 'oil',
    unit: 'percent',
    addAt: 'trace',
    ...overrides,
  };
}

function makeComputed(line: AdditiveLine, oilGrams = 1000): ComputedAdditive {
  const amount = Number(line.amount);
  const grams = (oilGrams * amount) / 100;
  return {
    key: line.key,
    catalogId: line.catalogId,
    name: line.name.trim() || 'Additive',
    amount,
    unit: line.unit,
    basis: line.basis,
    grams,
    addAt: line.addAt,
  };
}

function optionValues(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);
}

describe('AdditivesPanel catalog picker', () => {
  it('renders all current unscoped catalog entries in the CP picker (no regression)', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Additive type');
    const renderedIds = optionValues(select).filter((v) => v !== '');
    // Unscoped entries only — process-scoped entries (e.g. HP's stearic/lauric/yogurt)
    // are correctly absent from the CP picker; that's the scoping feature working, not
    // a regression this test should catch.
    for (const entry of ADDITIVE_CATALOG.filter((e) => !e.processes)) {
      expect(renderedIds).toContain(entry.id);
    }
  });

  it('excludes HP-scoped entries (stearic, lauric, yogurt) from the CP picker', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Additive type');
    const renderedIds = optionValues(select).filter((v) => v !== '');
    expect(renderedIds).not.toContain('stearic');
    expect(renderedIds).not.toContain('lauric');
    expect(renderedIds).not.toContain('yogurt');
  });

  it('includes HP-scoped entries (stearic, lauric, yogurt) in the HP picker', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="hp"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Additive type');
    const renderedIds = optionValues(select).filter((v) => v !== '');
    expect(renderedIds).toContain('stearic');
    expect(renderedIds).toContain('lauric');
    expect(renderedIds).toContain('yogurt');
  });
});

describe('AdditivesPanel stage options', () => {
  it('CP renders 4 stage options (no after-cook)', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Add at');
    expect(optionValues(select)).toEqual(['lye', 'oils', 'trace', 'top']);
  });

  it('HP renders 5 stage options, labeling after_cook as "After cook"', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="hp"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Add at');
    expect(optionValues(select)).toEqual(['lye', 'oils', 'trace', 'top', 'after_cook']);
    const options = within(select).getAllByRole('option');
    const afterCook = options.find((o) => (o as HTMLOptionElement).value === 'after_cook');
    expect(afterCook?.textContent).toBe('After cook');
  });

  it('LS renders 5 stage options, labeling after_cook as "After dilution"', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="ls"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Add at');
    expect(optionValues(select)).toEqual(['lye', 'oils', 'trace', 'top', 'after_cook']);
    const options = within(select).getAllByRole('option');
    const afterCook = options.find((o) => (o as HTMLOptionElement).value === 'after_cook');
    expect(afterCook?.textContent).toBe('After dilution');
  });

  it('a line already set to after_cook under CP still offers it as a selected option (mismatched-select guard)', () => {
    render(
      <AdditivesPanel
        additives={[makeLine({ addAt: 'after_cook' })]}
        computed={[makeComputed(makeLine({ addAt: 'after_cook' }))]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    const select = screen.getByLabelText('Add at') as HTMLSelectElement;
    expect(select.value).toBe('after_cook');
    expect(optionValues(select)).toEqual(['lye', 'oils', 'trace', 'top', 'after_cook']);
  });

  it('selecting a stage calls onChange with the right value', () => {
    const onChange = vi.fn();
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="hp"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Add at'), { target: { value: 'after_cook' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0] as AdditiveLine[];
    expect(updated[0].addAt).toBe('after_cook');
  });
});

test('flags an amount over its unit ceiling (e.g. left at 500 after switching ppt → %)', () => {
  render(
    <AdditivesPanel
      additives={[makeLine({ amount: '500', unit: 'percent' })]}
      computed={[]}
      weightUnit="g"
      process="hp"
      onChange={() => {}}
    />,
  );
  expect(screen.getByRole('alert').textContent).toContain('Max 100%');
});

test('no over-ceiling hint for a valid amount', () => {
  render(
    <AdditivesPanel
      additives={[makeLine({ amount: '5', unit: 'percent' })]}
      computed={[makeComputed(makeLine({ amount: '5' }))]}
      weightUnit="g"
      process="hp"
      onChange={() => {}}
    />,
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

test('changing the dose mode updates the line basis and unit', async () => {
  const user = userEvent.setup();
  const additives = [
    { key: 'a', catalogId: '', name: 'X', amount: '3', basis: 'oil' as const, unit: 'percent' as const, addAt: 'trace' as const },
  ];
  const onChange = vi.fn();
  render(
    <AdditivesPanel additives={additives} computed={[]} weightUnit="g" process="hp" onChange={onChange} />,
  );
  const modeSelect = screen.getByLabelText('Dose mode');
  await user.selectOptions(modeSelect, 'oil-ppt');
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ key: 'a', basis: 'oil', unit: 'ppt' }),
  ]);
});

function doseModeValues(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
}

test('LS offers the solution dose modes; CP does not', () => {
  const additives = [makeLine()];
  const computed = [makeComputed(makeLine())];
  render(<AdditivesPanel additives={additives} computed={computed} weightUnit="g" process="ls" onChange={() => {}} />);
  expect(doseModeValues(screen.getByLabelText('Dose mode'))).toEqual(
    ['oil-percent', 'batch-percent', 'oil-ppt', 'batch-ppt', 'solution-percent', 'solution-ppt'],
  );
  cleanup();
  render(<AdditivesPanel additives={additives} computed={computed} weightUnit="g" process="cp" onChange={() => {}} />);
  expect(doseModeValues(screen.getByLabelText('Dose mode'))).toEqual(
    ['oil-percent', 'batch-percent', 'oil-ppt', 'batch-ppt'],
  );
});

describe('AdditivesPanel hazard chips', () => {
  it('renders hazard chips for a hazard-bearing catalog additive', () => {
    const line = makeLine({ catalogId: 'eugenol', name: 'Eugenol' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('can seize')).not.toBeNull();
  });

  it('renders no hazard chips for an additive without hazards', () => {
    const line = makeLine({ catalogId: 'chelator', name: 'Chelator (citrate, gluconate)' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('can seize')).toBeNull();
  });

  it('renders no hazard chips for a custom (non-catalog) line', () => {
    const line = makeLine({ catalogId: '', name: 'My custom blend' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText('can seize')).toBeNull();
  });
});

test('a stray solution line under CP still renders its dose-mode option (guard)', () => {
  const line = makeLine({ basis: 'solution', unit: 'percent' });
  render(<AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process="cp" onChange={() => {}} />);
  const select = screen.getByLabelText('Dose mode') as HTMLSelectElement;
  expect(select.value).toBe('solution-percent');
  expect(doseModeValues(select)).toContain('solution-percent');
});

test('a line already set to an LS-scoped catalogId (guar) under CP still offers it as a selected option (mismatched-select guard)', () => {
  const line = makeLine({ catalogId: 'guar', name: 'Guar gum' });
  render(
    <AdditivesPanel
      additives={[line]}
      computed={[makeComputed(line)]}
      weightUnit="g"
      process="cp"
      onChange={() => {}}
    />,
  );
  const select = screen.getByLabelText('Additive type') as HTMLSelectElement;
  expect(select.value).toBe('guar');
  expect(optionValues(select)).toContain('guar');
});

describe('per-row accessible names (deep-review)', () => {
  it('disambiguates every control by the additive name, like RecipeOilsPanel does for oils', () => {
    const a = makeLine({ key: 'a1', catalogId: 'sugar-sorbitol', name: 'Sugar / sorbitol' });
    const b = makeLine({ key: 'b2', name: 'oat milk' });
    render(
      <AdditivesPanel
        additives={[a, b]}
        computed={[makeComputed(a), makeComputed(b)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Amount for Sugar / sorbitol')).toBeTruthy();
    expect(screen.getByLabelText('Amount for oat milk')).toBeTruthy();
    expect(screen.getByLabelText('Dose mode for oat milk')).toBeTruthy();
    expect(screen.getByLabelText('Add at for oat milk')).toBeTruthy();
    expect(screen.getByLabelText('Remove oat milk')).toBeTruthy();
  });

  it('falls back to a row ordinal for unnamed additives', () => {
    const a = makeLine({ key: 'a1', name: '' });
    render(
      <AdditivesPanel
        additives={[a]}
        computed={[makeComputed(a)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Amount for additive 1')).toBeTruthy();
  });
});
