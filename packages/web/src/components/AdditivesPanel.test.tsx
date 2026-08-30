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

function makeComputed(
  line: AdditiveLine,
  extra?: { naohGrams: number; kohGrams: number },
): ComputedAdditive {
  const oilGrams = 1000;
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
    ...(extra ? { extraLye: extra } : {}),
  };
}

function optionValues(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);
}

/** The stage control is a segmented radio group now, not a select — its values come off
 * the radios, in DOM order, the way optionValues read a select's options. */
const stageValues = (): string[] =>
  Array.from(
    screen.getByRole('radiogroup', { name: /^Add at for / }).querySelectorAll('input[type="radio"]'),
  ).map((r) => (r as HTMLInputElement).value);

const stageChecked = (): string | undefined =>
  stageValues().find(
    (v) =>
      (screen
        .getByRole('radiogroup', { name: /^Add at for / })
        .querySelector(`input[value="${v}"]`) as HTMLInputElement).checked,
  );

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

  it('excludes HP-scoped entries (finished-soap, yogurt) from the CP picker', () => {
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
    expect(renderedIds).not.toContain('finished-soap');
    expect(renderedIds).not.toContain('yogurt');
  });

  it('includes HP-scoped entries (finished-soap, yogurt) in the HP picker', () => {
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
    expect(renderedIds).toContain('finished-soap');
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
    expect(stageValues()).toEqual(['lye', 'oils', 'trace', 'top']);
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
    expect(stageValues()).toEqual(['lye', 'oils', 'trace', 'top', 'after_cook']);
    // The cell abbreviates; the accessible name is the full, process-aware label.
    expect(screen.getByRole('radio', { name: 'After cook' })).toBeTruthy();
  });

  it('LS drops the bar-soap "On top" stage and labels after_cook "After dilution"', () => {
    render(
      <AdditivesPanel
        additives={[makeLine()]}
        computed={[makeComputed(makeLine())]}
        weightUnit="g"
        process="ls"
        onChange={() => {}}
      />,
    );
    // A bottle has no surface to decorate, and the reference rules out the additives the
    // stage exists for (LS:3067), so liquid soap offers four stages, not five.
    expect(stageValues()).toEqual(['lye', 'oils', 'trace', 'after_cook']);
    expect(screen.getByRole('radio', { name: 'After dilution' })).toBeTruthy();
  });

  it('the after-dilution CELL says "After dilution", not the bare step it comes after', () => {
    // Abbreviated to its last word, the cell read "ADD AT … DILUTION" — which tells the
    // maker to dose into the dilution water. The stage means the opposite: after the
    // dilution, into finished soap (the reference doses water-dispersible shea butter,
    // turkey red castor oil and extracts there — LS:3030, LS:3374, and the extracts entry
    // "at the very end of the dilution process"). The preposition IS the instruction.
    for (const [process, cell] of [
      ['ls', 'After dilution'],
      ['hp', 'After cook'],
    ] as const) {
      cleanup();
      render(
        <AdditivesPanel
          additives={[makeLine({ addAt: 'after_cook' })]}
          computed={[makeComputed(makeLine({ addAt: 'after_cook' }))]}
          weightUnit="g"
          process={process}
          onChange={() => {}}
        />,
      );
      // The span is aria-hidden (the input carries the name), so read the DOM text.
      const span = screen
        .getByRole('radiogroup', { name: /^Add at for / })
        .querySelector('input[value="after_cook"]')!.parentElement!.querySelector('span')!;
      expect(span.textContent).toBe(cell);
    }
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
    expect(stageChecked()).toBe('after_cook');
    expect(stageValues()).toEqual(['lye', 'oils', 'trace', 'top', 'after_cook']);
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
    fireEvent.click(screen.getByRole('radio', { name: 'After cook' }));
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
  const modeSelect = screen.getByLabelText(/^Dose mode/);
  await user.selectOptions(modeSelect, 'oil-ppt');
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ key: 'a', basis: 'oil', unit: 'ppt' }),
  ]);
});

describe('acid compensation line', () => {
  it('shows the compensation lye for a citric row', () => {
    const line = makeLine({ catalogId: 'citric-acid', name: 'Citric acid (anhydrous)', amount: '2', addAt: 'lye' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line, { naohGrams: 12.49, kohGrams: 0 })]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    const hint = screen.getByText(/added to lye/);
    // formatWeight uses displayDigits 0 for grams (weightUnits.ts) → "12 g", not "12.5 g" —
    // same rendering as SplitLiquidPanel's vinegar figure.
    expect(hint.textContent).toContain('+12 g NaOH');
    expect(hint.textContent).toContain('citrate');
    expect(hint.textContent?.toLowerCase()).not.toContain('ph');
  });

  it('shows no compensation line for additives without extraLye', () => {
    const line = makeLine({ catalogId: 'sugar-sorbitol', name: 'Sugar' });
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.queryByText(/added to lye/)).toBeNull();
  });
});

describe('empty-state copy is process-scoped', () => {
  it('mentions the citric auto-lye under LS too (offered there since the LS audit)', () => {
    render(<AdditivesPanel additives={[]} computed={[]} weightUnit="g" process="ls" onChange={() => {}} />);
    expect(screen.getByText(/citric acid's compensation lye is added automatically/)).toBeTruthy();
  });

  it('mentions the citric auto-lye under CP', () => {
    render(<AdditivesPanel additives={[]} computed={[]} weightUnit="g" process="cp" onChange={() => {}} />);
    // getByText throws if the copy is absent — the assert is the retrieval itself.
    expect(screen.getByText(/citric acid's compensation lye is added automatically/)).toBeTruthy();
  });
});

function doseModeValues(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
}

test('LS offers the solution dose modes; CP does not', () => {
  const additives = [makeLine()];
  const computed = [makeComputed(makeLine())];
  render(<AdditivesPanel additives={additives} computed={computed} weightUnit="g" process="ls" onChange={() => {}} />);
  expect(doseModeValues(screen.getByLabelText(/^Dose mode/))).toEqual(
    ['oil-percent', 'batch-percent', 'oil-ppt', 'batch-ppt', 'solution-percent', 'solution-ppt'],
  );
  cleanup();
  render(<AdditivesPanel additives={additives} computed={computed} weightUnit="g" process="cp" onChange={() => {}} />);
  expect(doseModeValues(screen.getByLabelText(/^Dose mode/))).toEqual(
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
  const select = screen.getByLabelText(/^Dose mode/) as HTMLSelectElement;
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
    const a = makeLine({ key: 'a1', catalogId: 'sugar-sorbitol', name: 'Sugar' });
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
    expect(screen.getByLabelText('Amount for Sugar')).toBeTruthy();
    expect(screen.getByLabelText('Amount for oat milk')).toBeTruthy();
    expect(screen.getByLabelText('Dose mode for oat milk')).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Add at for oat milk' })).toBeTruthy();
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

describe('name field only for custom rows (duplicate-name fix)', () => {
  it('hides the name input for a catalog row whose name matches the catalog entry', () => {
    const line = makeLine({ catalogId: 'clay', name: 'Clay (bentonite, kaolin)' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Name for Clay (bentonite, kaolin)')).toBeNull();
  });

  it('shows the name input for a custom row', () => {
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
    expect(screen.getByLabelText('Name for My custom blend')).toBeTruthy();
  });

  it('hides the name input for a catalog row even when its name differs (renaming is what Custom is for)', () => {
    const line = makeLine({ catalogId: 'clay', name: 'Rose clay' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line)]}
        weightUnit="g"
        process="cp"
        onChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Name for Rose clay')).toBeNull();
  });
});

describe('dose-unit reseeding (second wave)', () => {
  it('resets the unit to percent when switching from a ppt entry to a %-dosed entry', () => {
    const onChange = vi.fn();
    const line = makeLine({ key: 'e1', catalogId: 'eugenol', name: 'Eugenol', unit: 'ppt', amount: '2' });
    render(
      <AdditivesPanel
        additives={[line]}
        computed={[makeComputed(line)]}
        weightUnit="g"
        process="cp"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Additive type for Eugenol'), {
      target: { value: 'sugar-sorbitol' },
    });
    const updated = onChange.mock.calls.at(-1)![0][0];
    expect(updated.catalogId).toBe('sugar-sorbitol');
    expect(updated.unit).toBe('percent');
  });
});

describe('per-process dose resolution (HP audit)', () => {
  it('shows the HP range and stage hint for sodium lactate under HP, the base under CP', () => {
    const line = makeLine({ catalogId: 'sodium-lactate', name: 'Sodium lactate', amount: '1' });
    const { unmount } = render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="hp" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 3–4% of oil weight/)).toBeTruthy();
    unmount();
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 0.5–2% of oil weight/)).toBeTruthy();
  });

  it('picking sodium lactate under HP seeds the trace stage; under CP the lye stage', () => {
    for (const [process, stage] of [['hp', 'trace'], ['cp', 'lye']] as const) {
      let latest: AdditiveLine[] = [];
      const line = makeLine({ name: '' });
      const { unmount } = render(
        <AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process={process} onChange={(a) => { latest = a; }} />,
      );
      fireEvent.change(screen.getByLabelText(/^Additive type/), { target: { value: 'sodium-lactate' } });
      expect(latest[0].addAt).toBe(stage);
      unmount();
    }
  });
});

describe('free-fatty-acid guidance (HP + LS audits)', () => {
  it('tells HP (5–8%) and LS (5–10%) users to dose free fatty acids as oils; silent under CP', () => {
    for (const [process, range] of [['hp', '5–8%'], ['ls', '5–10%']] as const) {
      const r = render(
        <AdditivesPanel additives={[]} computed={[]} weightUnit="g" process={process} onChange={() => {}} />,
      );
      expect(screen.getByText(/stearic, lauric, myristic/i).textContent).toContain(range);
      r.unmount();
    }
    render(<AdditivesPanel additives={[]} computed={[]} weightUnit="g" process="cp" onChange={() => {}} />);
    expect(screen.queryByText(/stearic, lauric, myristic/i)).toBeNull();
  });
});

describe('dose-basis seeding and display (LS audit)', () => {
  it('picking pearlizer under LS seeds the solution basis; sodium lactate stays oil-based', () => {
    for (const [id, basis] of [['pearlizer', 'solution'], ['sodium-lactate', 'oil']] as const) {
      let latest: AdditiveLine[] = [];
      const line = makeLine({ name: '' });
      const { unmount } = render(
        <AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process="ls" onChange={(a) => { latest = a; }} />,
      );
      fireEvent.change(screen.getByLabelText(/^Additive type/), { target: { value: id } });
      expect(latest[0].basis).toBe(basis);
      unmount();
    }
  });

  it('the typical-range hint names the basis: solution under LS fragrance, oils under CP', () => {
    const line = makeLine({ catalogId: 'fragrance', name: 'Fragrance / essential oil', amount: '1' });
    const { unmount } = render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="ls" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 0.5–3% of diluted solution/)).toBeTruthy();
    unmount();
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.getByText(/Typical 2–6% of oil weight/)).toBeTruthy();
  });

  it('a stray solution row under CP points at the dose mode, not a dilution field CP lacks', () => {
    // Import preserves basis 'solution' regardless of process (normalizeAdditiveLine), so a
    // CP recipe can carry one. Telling a CP user to "set the soap concentration" is a dead
    // end — CP has no such field. Same spirit as the panel's mismatched-select guards:
    // stray process-scoped state renders inertly but honestly.
    //
    // computed={[]} is the REAL pipeline state: computeRecipeAdditives drops a
    // solution-basis line when there is no solution weight, so no row is emitted at all.
    // The previous version of this test hand-built {…makeComputed(line), grams: 0}, a row
    // the pipeline cannot produce, which is why the hint it pinned had never rendered.
    const line = makeLine({ catalogId: '', name: 'Pearlizer', amount: '5', basis: 'solution' });
    render(
      <AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.queryByText(/soap concentration/i)).toBeNull();
    expect(screen.getByText(/only liquid soap has/i)).toBeTruthy();
  });

  it('leaves the LS no-dilution case to the Dilution panel rather than duplicating it here', () => {
    // Under LS the DilutionPanel renders on the same screen and already asks for a
    // concentration; a second copy inside the additive row said the same thing twice and
    // misfired when the recipe had no oils (dilution is null even at a valid 30%).
    const line = makeLine({ catalogId: 'pearlizer', name: 'Pearlizer (glycol stearate)', amount: '5', basis: 'solution' });
    render(
      <AdditivesPanel additives={[line]} computed={[]} weightUnit="g" process="ls" onChange={() => {}} />,
    );
    expect(screen.queryByText(/only liquid soap has/i)).toBeNull();
  });

  it('salt shows the salt-curve hazard under LS and the crumble hazard under CP', () => {
    const line = makeLine({ catalogId: 'salt', name: 'Table salt (NaCl)', amount: '4' });
    const { unmount } = render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="ls" onChange={() => {}} />,
    );
    expect(screen.getByText(/salt curve/)).toBeTruthy();
    unmount();
    render(
      <AdditivesPanel additives={[line]} computed={[makeComputed(line)]} weightUnit="g" process="cp" onChange={() => {}} />,
    );
    expect(screen.getByText(/crumbly/)).toBeTruthy();
  });
});
