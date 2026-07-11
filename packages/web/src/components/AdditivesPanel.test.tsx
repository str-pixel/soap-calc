// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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
    percentOfOil: oilGrams > 0 ? (grams / oilGrams) * 100 : 0,
  };
}

function optionValues(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);
}

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
