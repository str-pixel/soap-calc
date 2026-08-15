/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Node 22+ defines its own (experimental, file-backed) global `localStorage` getter
// that shadows jsdom's implementation unless `--localstorage-file` is configured.
// Stub it with an in-memory fake instead, same as recipeStorage.test.ts.
function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('App process switch', () => {
  it('switches the lye options when the Liquid Soap tab is chosen', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const select = screen.getByLabelText(/lye type/i);
    const options = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(['koh', 'dual']);
  });

  it('keeps the global weight-unit selector\'s name unique app-wide on the Liquid Soap tab', async () => {
    // The dilution panel used to mount its own g/oz/lb switch, captioned "Weight unit" with
    // a qualified accessible name so this exact-string query stayed unambiguous. The switch
    // is gone — the global selector is the only unit control — and Liquid Soap is the one
    // process where the dilution panel is on screen, so this is where a resurrected local
    // control would collide. getByLabelText throws on ambiguity, which is the pin.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const globalSelector = screen.getByLabelText('Weight unit');
    expect(globalSelector.tagName).toBe('SELECT');
  });

  it('the dilution figures follow the app-wide weight unit', async () => {
    // The panel has no unit control of its own: the global selector is the only one, and
    // every dilution figure reads whatever it says.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const panel = screen.getByRole('heading', { name: 'Dilution' }).closest('section')!;
    const waterDd = () =>
      within(panel).getByText('Dilution water to add').nextElementSibling!.textContent ?? '';
    expect(waterDd()).toContain(' g');

    await userEvent.selectOptions(screen.getByLabelText('Weight unit'), 'oz');
    expect(waterDd()).toContain('oz');
    expect(waterDd()).not.toContain(' g');
  });

  it('kg mode renders kg on the panel figure and the printed sheet\'s dilution row alike', async () => {
    // kg used to be the one unit where screen and sheet split: the panel's local switch had
    // no kg radio and fell back to grams, while the printed BatchSheet always used the
    // app-wide unit — so a kg-mode maker saw grams on screen and kg on paper. With the
    // global selector as the only unit control, both surfaces quote the same figure in the
    // same unit, and this pins the agreement, not just the unit.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    await userEvent.selectOptions(screen.getByLabelText('Weight unit'), 'kg');

    const panel = screen.getByRole('heading', { name: 'Dilution' }).closest('section')!;
    const panelDd =
      within(panel).getByText('Dilution water to add').nextElementSibling!.textContent ?? '';
    expect(panelDd).toContain('kg');

    const sheet = document.querySelector('.batch-sheet') as HTMLElement;
    const sheetDd =
      within(sheet).getByText('Dilution water to add').nextElementSibling!.textContent ?? '';
    expect(sheetDd).toContain('kg');
    // Same unit AND the same figure: the sheet's row is exactly the panel's row.
    expect(sheetDd).toContain(panelDd);
  });

  it('shows CP extras (dose converters + notes) for Cold process but not Liquid Soap', async () => {
    render(<App />);
    expect(screen.getByText('CP extras')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    expect(screen.queryByText('CP extras')).toBeNull();
  });

  it('clears the measured paste when the recipe oils change', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    // The field's own visible label, which IS its accessible name — the input carries no
    // aria-label, so this one string serves the screen and the a11y tree alike. Exact rather
    // than a loose /Measured paste weight/i, which also matches the ratio caveat's
    // "enter it as Measured paste weight below" and throws on ambiguity.
    const measuredInput = screen.getByLabelText('Measured paste weight — the whole batch (g, optional)');
    await userEvent.type(measuredInput, '1500');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');

    // A measurement describes the batch as it was; changing an oil's weight changes the
    // batch, so a stale measurement must not silently keep driving the dilution figures.
    const [firstOilWeight] = screen.getAllByLabelText(/^Weight in/);
    await userEvent.clear(firstOilWeight);
    await userEvent.type(firstOilWeight, '500');
    await userEvent.tab();

    expect((measuredInput as HTMLInputElement).value).toBe('');
  });

  it('preserves the measured paste when switching to a process whose oils genuinely differ, but clears it on an in-process oils edit', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    // Edit an LS oil weight so LS's oils diverge from Cold process's starter oils — the
    // upcoming tab switch is then a genuine oils-content change, not just an identity
    // change (unlike the round-trip test above, which deliberately leaves oils untouched).
    const [firstOilWeight] = screen.getAllByLabelText(/^Weight in/);
    await userEvent.clear(firstOilWeight);
    await userEvent.type(firstOilWeight, '600');
    await userEvent.tab();

    let measuredInput = screen.getByLabelText('Measured paste weight — the whole batch (g, optional)');
    await userEvent.type(measuredInput, '1500');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');

    // Switch to Cold process — its oils genuinely differ from LS's now-edited oils — and
    // back. LS's own oils never changed, so the measurement must survive the round trip.
    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    measuredInput = screen.getByLabelText('Measured paste weight — the whole batch (g, optional)');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');

    // Now genuinely edit an LS oil weight — a real in-process change — which must still
    // clear the (now stale) measurement.
    const [lsOilWeight] = screen.getAllByLabelText(/^Weight in/);
    await userEvent.clear(lsOilWeight);
    await userEvent.type(lsOilWeight, '700');
    await userEvent.tab();
    expect((measuredInput as HTMLInputElement).value).toBe('');
  });

  it('preserves the measured paste across a process-tab round trip with unchanged oils', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    let measuredInput = screen.getByLabelText('Measured paste weight — the whole batch (g, optional)');
    await userEvent.type(measuredInput, '1500');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');

    // Switching away and back reloads the Liquid Soap workspace's own draft via
    // loadWorkspace → loadDraftSlot → JSON.parse, which allocates a brand-new `lines` array
    // even though the oils themselves never changed. That must not read as an oils edit.
    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));

    measuredInput = screen.getByLabelText('Measured paste weight — the whole batch (g, optional)');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');
  });
});

describe('the seeded ratio preset applies from the path the app actually opens on', () => {
  // App seeds waterPasteRatio to '2' and the saved target to 30%, so entering ratio mode
  // renders 2:1 ALREADY CHECKED beside "Not applied yet: every figure below — and the printed
  // batch sheet — still uses your saved 30% target". Both of these drive
  // the real App rather than the panel in isolation, because the seeding is App's and the
  // bug only exists at those seeded values: DilutionPanel's own tests have to be handed the
  // state that App creates for free.
  //
  // 1,200 g of anhydrous soap is not what the starter recipe makes, so the exact landing
  // percentage is read off the app rather than hardcoded — what is asserted is that the
  // saved target MOVED to whatever the ratio lands at, and that the split note cleared.
  async function enterRatioMode() {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const savedTarget = (
      within(panel).getByLabelText('Target soap concentration percent') as HTMLInputElement
    ).value;
    await userEvent.click(within(panel).getByLabelText('Water : paste ratio'));
    const preset = within(panel).getByRole('radio', { name: '2:1' }) as HTMLInputElement;
    // The whole premise: the preset the maker would reach for is already selected, and the
    // panel is telling them nothing below it has been applied.
    expect(preset.checked).toBe(true);
    expect(within(panel).getByText(/Not applied yet/i)).toBeTruthy();
    return { panel, preset, savedTarget };
  }

  async function assertApplied(panel: HTMLElement, savedTarget: string) {
    expect(within(panel).queryByText(/Not applied yet/i)).toBeNull();
    await userEvent.click(within(panel).getByLabelText('Target concentration'));
    const applied = (
      within(panel).getByLabelText('Target soap concentration percent') as HTMLInputElement
    ).value;
    expect(applied).not.toBe(savedTarget);
    expect(Number(applied)).toBeGreaterThan(0);
  }

  it('applies when the already-checked preset is clicked', async () => {
    const { panel, preset, savedTarget } = await enterRatioMode();
    await userEvent.click(preset);
    await assertApplied(panel, savedTarget);
  });

  it('applies when the already-checked preset is activated with Space', async () => {
    // fireEvent, not userEvent.keyboard(' '): jsdom synthesises a `click` on a checked radio
    // where Chromium (censused) fires only keydown and keyup, so a userEvent-driven Space
    // would go through the onClick handler and prove nothing about the keyboard path.
    const { panel, preset, savedTarget } = await enterRatioMode();
    preset.focus();
    fireEvent.keyDown(preset, { key: ' ', code: 'Space' });
    fireEvent.keyUp(preset, { key: ' ', code: 'Space' });
    await assertApplied(panel, savedTarget);
  });
});

describe('the preservative dose is a % of what the maker is actually making', () => {
  // THE SAFETY PIN. The snippet used to be handed the whole batch's finished mass in every
  // state, including Custom amount scope — where the Dilution panel prints portion figures
  // and deliberately shows no ≈ Finished product row at all. A maker drawing 250 ml off a
  // multi-kilo batch was told to weigh in the batch's dose, an order of magnitude past the
  // ceiling for the bottle actually in front of them.
  async function openSnippet() {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const snippet = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('details') as HTMLElement;
    return snippet;
  }

  function figure(snippet: HTMLElement, label: string): string {
    const item = Array.from(snippet.querySelectorAll('.results-grid__item')).find(
      (el) => el.querySelector('dt')?.textContent?.trim() === label,
    );
    return item?.querySelector('dd')?.textContent?.trim() ?? '';
  }

  function grams(text: string): number {
    return Number(text.replace(/[^\d.]/g, ''));
  }

  it('Custom amount doses the portion, not the batch', async () => {
    const snippet = await openSnippet();
    const batchBase = grams(figure(snippet, '≈ Finished product (whole batch)'));
    // The starter LS recipe makes kilos of diluted soap; the portion below is 250 ml of it.
    expect(batchBase).toBeGreaterThan(1000);

    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    await userEvent.type(screen.getByLabelText('Amount to make (ml)'), '250');

    // 250 ml at the solution density core uses (1.03 g/ml) is 257.5 g, whatever the recipe
    // is — the portion's own finished solution, not a share of the batch's.
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('258 g');
    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe('');
    // …and the dose follows it: 1% of 257.5 g. The batch's own 1% dose is >10 g, so this
    // assertion fails the moment the base reverts to the batch.
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(2.6, 1);
  });

  it('Whole batch scope is unchanged: the base is the batch, and it matches the panel', async () => {
    const snippet = await openSnippet();
    const base = grams(figure(snippet, '≈ Finished product (whole batch)'));
    const dilutionPanel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    // The starter recipe has no additives, so the panel shows no separate ≈ Finished
    // product row — its Finished solution row IS the finished product, and that is the
    // number the snippet must be dosing.
    const solution = grams(
      within(dilutionPanel).getByText('Finished solution').nextElementSibling!.textContent!,
    );
    expect(base).toBeCloseTo(solution, 0);
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(base * 0.01, 0);
  });

  it('a Custom amount larger than the batch names itself the whole batch', async () => {
    // Ask for more than exists and the portion CLAMPS: the panel says so twice — "That is
    // more than the batch holds — the figures above are the whole batch" and "100% of the
    // batch" — while the dose basis kept calling itself "(custom amount)" one line below.
    // The figure was right; the name was not, and the name is the maker's only signal for
    // which mass the % is of, so the two have to move together.
    const snippet = await openSnippet();
    const batchBase = figure(snippet, '≈ Finished product (whole batch)');

    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    await userEvent.type(screen.getByLabelText('Amount to make (ml)'), '100000000');

    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe(batchBase);
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('');
  });

  it('Custom amount + Gradual doses the jar that was recorded, not a target-derived one', async () => {
    // THE SAFETY PIN for the worst version of this bug. Custom amount resolved its dose
    // through the "Amount to make (ml)" field — the one input Gradual takes off the panel —
    // so a recorded 1,300 g jar was dosed against a portion sized from a stale amount, and
    // the snippet printed 21 g beside its own "1,300 g": 1.6% w/w in the jar the maker
    // actually has, past the EU ceiling for several listed preservatives.
    const snippet = await openSnippet();
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    // The stale amount that used to drive the dose in this mode.
    await userEvent.type(screen.getByLabelText('Amount to make (ml)'), '2000');
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Paste weighed out (g)'), '400');
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '900');

    const dilutionPanel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    // What the panel says is in the jar, and what the snippet says it is dosing: ONE figure,
    // on one screen. 400 g of paste plus 900 g of water is 1,300 g.
    const jar = within(dilutionPanel)
      .getByText('Finished so far (this jar)')
      .nextElementSibling!.textContent!.trim();
    expect(jar).toBe('1,300 g');
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe(jar);
    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe('');
    // 1% of 1,300 g. The 2,060 g the stale amount implies would print 21 g here.
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(13, 0);
  });

  it('Custom amount + Gradual doses a jar the weighed pot can actually hold', async () => {
    // The jar is a share of the batch's paste, and which batch that is decides whether a jar
    // exists at all: with the basis fixed to the recipe's PREDICTION, a maker whose cook lost
    // nothing — 1,800 g on the scale against a 1,666 g predicted pot — was told a 1,700 g jar
    // was "more paste than the batch holds", and the dose vanished with the readout. The
    // reading has to reach this resolution through App as well as through the panel, since the
    // dose is App's own call to it.
    const snippet = await openSnippet();
    await userEvent.type(
      screen.getByLabelText('Measured paste weight — the whole batch (g, optional)'),
      '1800',
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Paste weighed out (g)'), '1700');
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '300');

    // 1,700 g of paste plus 300 g of water, and 1% of it.
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('2,000 g');
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(20, 0);
  });

  it('Custom amount + Gradual asks for the fields it actually doses from', async () => {
    // With nothing recorded there is no jar to dose — and the ask has to name the two
    // fields on screen, not the "Amount to make" input this mode removes. That hint was the
    // normal state of the snippet in gradual mode, since nothing ever fills that field in.
    const snippet = await openSnippet();
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('');
    expect(within(snippet).getByText(/paste weighed out and the water added so far/i)).toBeTruthy();
    expect(within(snippet).queryByText(/Enter an Amount to make/i)).toBeNull();
    expect(screen.queryByLabelText('Amount to make (ml)')).toBeNull();
  });

  it('an unsized Custom amount falls back to the hint, never to the batch', async () => {
    // No amount typed yet: no portion exists, so there is nothing to dose. Quietly using
    // the batch here is exactly the bug — the maker would be reading a batch dose on a
    // screen showing no batch figures.
    const snippet = await openSnippet();
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe('');
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('');
    expect(within(snippet).getByText(/Amount to make/i)).toBeTruthy();
  });
});

describe('Whole batch + Gradual: one batch has one finished mass', () => {
  // THE SAFETY PIN for the split that no gradual test could see, because none of them ever
  // rendered a finished-product figure at all: `bottledSolutionGrams` only exists on the
  // <App/> path (useRecipeViewModel computes it), and every component-level gradual test
  // leaves it null.
  //
  // The panel's paste basis is target-independent — it counts from the pot the maker
  // weighed. `computeBottledSolutionGrams` was not: it chose its base with
  // measuredPasteIsValidFor, whose ceiling compares the reading against
  // dilution.solutionGrams — anhydrous ÷ the very percent gradual's write-back had just
  // produced. With no water recorded the pot IS the finished mass, so the two figures are the
  // same number up to the write-back's 2 dp rounding, and about half of the readings in the
  // window land the solution a hair UNDER the reading. There the base fell back to the
  // recipe's COMPUTED pot, and the screen carried two masses for one batch — "Finished so far
  // (weighed) 1,400 g" beside a 1,666 g finished product, a finished volume derived from the
  // second, and a preservative dose that is a percentage of it. That dose has a legal ceiling
  // (EU Annex V), so a 1% ask arriving as 1.19% of the pot the maker actually has is the
  // whole reason this feature exists.
  async function gradualLs() {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const snippet = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('details') as HTMLElement;
    return {
      panel,
      snippet,
      paste: screen.getByLabelText('Measured paste weight — the whole batch (g, optional)'),
      water: screen.getByLabelText('Water added so far (g)'),
    };
  }

  /** The value cell of a results-grid row inside `root`, as text ("1,400 g"), or ''. */
  function row(root: HTMLElement, label: string): string {
    const item = Array.from(root.querySelectorAll('.results-grid__item')).find(
      (el) => el.querySelector('dt')?.textContent?.trim() === label,
    );
    return item?.querySelector('dd')?.textContent?.trim() ?? '';
  }

  function num(text: string): number {
    return Number(text.replace(/[^\d.]/g, ''));
  }

  /** Gradual's own mass row, under whichever basis label the panel chose. */
  function potRow(panel: HTMLElement): string {
    return row(panel, 'Finished so far (weighed)') || row(panel, 'Finished so far (computed)');
  }

  it('the mass the preservative doses is the pot the panel counts from', async () => {
    const { panel, snippet, paste, water } = await gradualLs();
    // The starter LS recipe makes 1,222.15 g of anhydrous soap in a computed 1,666.15 g pot.
    // 1,400 g is a reading in the half of the window whose 2 dp write-back rounds UP:
    // 122215/1400 = 87.2964 → 87.30 → a solution of 1,399.94 g, a hair under the 1,400 g on
    // the scale. Zero water is not an exotic input — it is the reference's own starting
    // record (LS:1531).
    fireEvent.change(paste, { target: { value: '1400' } });
    fireEvent.change(water, { target: { value: '0' } });

    expect(potRow(panel)).toBe('1,400 g');
    // ONE mass, on one screen: what the panel says is in the pot is what the snippet says it
    // is dosing. The 1,666 g computed pot is what this printed before.
    expect(row(snippet, '≈ Finished product (whole batch)')).toBe(potRow(panel));
    // …and the volume the maker sizes bottles from follows it: 1,400 / 1.03 = 1,359 ml, not
    // the 1,618 ml the computed pot implies.
    expect(row(panel, '≈ Finished volume')).toBe('1,359 ml');
    // The dose is the harm. At the default 1% of finished product that is 14 g; against the
    // computed pot it was 17 g — 1.19% of the batch actually in front of the maker.
    expect(num(row(snippet, 'Preservative to add'))).toBeCloseTo(14, 0);
  });

  it('holds across the whole zero-water window, not just at one reading', async () => {
    // Which readings split depends on where 2 dp rounding lands, so a single fixture proves
    // the fix for one number and not for the rule. Every whole-gram reading from just above
    // the solids floor to the computed pot, driven through the real <App/>.
    const { panel, snippet, paste, water } = await gradualLs();
    fireEvent.change(water, { target: { value: '0' } });
    const anhydrous = num(row(panel, 'Paste (anhydrous)'));
    const computedPot = num(potRow(panel));
    expect(anhydrous).toBeGreaterThan(0);
    expect(computedPot).toBeGreaterThan(anhydrous);

    const split: string[] = [];
    let checked = 0;
    for (let reading = Math.ceil(anhydrous) + 1; reading <= computedPot; reading += 1) {
      fireEvent.change(paste, { target: { value: String(reading) } });
      // Skip the readings the WRITE-BACK's own [1, 99] clamp moves: a pot that light is over
      // 99% soap, so the saved target is capped below what was recorded and the app really is
      // pricing a different (heavier) solution than the record describes. The panel says so
      // in an alert of its own, which is the account this test is looking for everywhere
      // else; see the residual-fix report for why that corner is left as the clamp's.
      const clamped = Array.from(panel.querySelectorAll('[role="alert"]')).some((a) =>
        /outside the 1–99% range/.test(a.textContent ?? ''),
      );
      if (clamped) continue;
      checked += 1;
      if (potRow(panel) !== row(snippet, '≈ Finished product (whole batch)')) {
        split.push(`${reading} g: pot ${potRow(panel)} vs ${row(snippet, '≈ Finished product (whole batch)')}`);
      }
    }
    // The sweep has to have swept something — a helper that silently found no rows would
    // otherwise pass this test with an empty list.
    expect(checked).toBeGreaterThan(300);
    expect(split, `${split.length} readings show two masses for one batch`).toEqual([]);
  }, 60000);
});

describe('the dilution mode follows the recipe that arrives, in both directions', () => {
  // A recorded gradual dilution reopens in Gradual mode, because the water is recipe state
  // and the mode is not — without that, the record survives a reload and has nowhere to
  // appear. But the same key (workspaceGeneration) also fires on New recipe and on import,
  // and the effect only ever SET gradual: starting a new recipe after opening one with a
  // record left the panel in Gradual, with an empty field, no dilution rows, and a mode
  // restored for a record that no longer exists.
  async function ls() {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
  }

  async function chooseNewRecipe() {
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New recipe' }));
  }

  it('a new recipe leaves Gradual behind with the record it belonged to', async () => {
    await ls();
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    expect((screen.getByRole('radio', { name: /Gradual/ }) as HTMLInputElement).checked).toBe(true);

    await chooseNewRecipe();

    // Back to the panel's own default, exactly as a cold start opens.
    expect((screen.getByRole('radio', { name: 'Target concentration' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: /Gradual/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByLabelText('Target soap concentration percent')).toBeTruthy();
    expect(screen.queryByLabelText('Water added so far (g)')).toBeNull();
  });

  it('a process-tab round trip keeps the mode the maker chose', async () => {
    // workspaceGeneration bumps on a process switch as well as on New/import
    // (useRecipeStorage's setProcess), so a flat reset to the default here charged a maker
    // for glancing at another tab: choose Water : paste ratio, look at Cold process, come
    // back, and the panel had silently returned to Target concentration with the ratio's own
    // figures gone from the screen. Only Gradual is stale-able by an arriving recipe.
    await ls();
    await userEvent.click(screen.getByRole('radio', { name: 'Water : paste ratio' }));
    expect((screen.getByRole('radio', { name: 'Water : paste ratio' }) as HTMLInputElement).checked).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));

    expect((screen.getByRole('radio', { name: 'Water : paste ratio' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('Water to paste ratio')).toBeTruthy();
  });

  it('a recipe that HAS a record still opens in Gradual', async () => {
    // The direction that already worked, pinned so the reset above cannot swallow it: the
    // record is saved with the recipe and autosaved back on reload.
    await ls();
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    // The autosave debounce (500 ms) is what makes this a reload rather than a re-render:
    // the record has to be in storage before the second mount reads it.
    await new Promise((resolve) => setTimeout(resolve, 700));
    cleanup();
    render(<App />);
    expect((screen.getByRole('radio', { name: /Gradual/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('Water added so far (g)')).toHaveProperty('value', '1500');
  });
});

describe("the preservative pick reseeds the dose through App's own wiring", () => {
  // THE SAFETY PIN for App.tsx's three preservativeSnippet handlers (~573-583). The select's
  // onChange in PreservativeSnippet fires TWO writes in one synchronous handler — the id,
  // then the reseeded dose — both through App's single `setSettings`. The functional-updater
  // form `setSettings((s) => ({ ...s, ... }))` lets the second write build on the first; the
  // plain object-spread form `setSettings({ ...settings, ... })` used elsewhere in this file
  // reads the SAME pre-event `settings` closure for both calls, so whichever call is applied
  // last silently discards the other call's field. PreservativeSnippet.test.tsx's Harness
  // cannot catch this regression: its id and dose are two independent useStates, so both
  // writes land there no matter what App does (see that file's Harness comment). Only a test
  // that renders the real App exercises the real setSettings object.
  it('picking Liquid Germall Plus updates the select AND reseeds the dose to its own default', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));

    // An oil weight, so the snippet has a finished mass to dose against.
    const [firstOilWeight] = screen.getAllByLabelText(/^Weight in/);
    await userEvent.clear(firstOilWeight);
    await userEvent.type(firstOilWeight, '500');
    await userEvent.tab();

    const summary = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('summary') as HTMLElement;
    await userEvent.click(summary);

    const picker = screen.getByLabelText('Which preservative') as HTMLSelectElement;
    await userEvent.selectOptions(picker, 'liquid-germall-plus');

    // BOTH must hold. Under the object-spread break one of these two writes is clobbered —
    // whichever assertion fails first depends on which handler lost, but the app can never
    // legitimately show Liquid Germall Plus selected next to a dose that is not its own 0.5%
    // default (Suttocide A's 1% is double Germall's supplier maximum).
    expect(picker.value).toBe('liquid-germall-plus');
    const doseInput = screen.getByLabelText(
      /Dose \(% of finished product\)/,
    ) as HTMLInputElement;
    expect(doseInput.value).toBe('0.5');
  });
});

describe('the preservative sits inside the panel it doses against', () => {
  it('renders within the Dilution panel, not as a sibling beside it', async () => {
    // Structural, not cosmetic. The dose is a % of the finished mass the Dilution panel
    // computes, and while that was only a layout convention the snippet was moved out to
    // sit with Additives (2026-08-09) and moved back the next day — every test passing
    // both times, because nothing asserted the adjacency. This is that assertion.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const snippet = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('details') as HTMLElement;
    const enclosingPanel = snippet.closest('section.panel') as HTMLElement;
    expect(enclosingPanel).toBeTruthy();
    // The enclosing panel must be the Dilution panel itself — proven by its own content,
    // not by a class name that could drift.
    expect(enclosingPanel.textContent).toContain('Dilution water to add');
  });
});

describe('a mode the maker chose survives the arrivals a record used to override', () => {
  // workspaceGeneration bumps on a PROCESS TAB SWITCH as well as on load/import/new
  // (useRecipeStorage's setProcess), and the restore effect treated every bump as a recipe
  // arriving with a record to answer for. The reverse direction was already fixed for exactly
  // this reason ("a process-tab round trip keeps the mode the maker chose"); the forward one
  // charged the same glance to anyone who had recorded water.
  async function ls() {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
  }

  async function processRoundTrip() {
    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
  }

  it('keeps Target concentration after a tab round trip, with the record still on the recipe', async () => {
    await ls();
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    // Leaving Gradual to type an exact target is the whole reason the other two modes exist.
    await userEvent.click(screen.getByRole('radio', { name: 'Target concentration' }));
    await userEvent.clear(screen.getByLabelText('Target soap concentration percent'));
    await userEvent.type(screen.getByLabelText('Target soap concentration percent'), '25');

    await processRoundTrip();

    expect(
      (screen.getByRole('radio', { name: 'Target concentration' }) as HTMLInputElement).checked,
    ).toBe(true);
    // The field the maker was typing into is still the one on screen — the complaint the
    // effect's own comment raises about the other direction, in this one.
    expect(screen.getByLabelText('Target soap concentration percent')).toHaveProperty(
      'value',
      '25',
    );
  });

  it('still restores Gradual when the RECORD is the thing that changed', async () => {
    // The choice is answered to one record. A recipe arriving with a different one is a new
    // question, and the record has nowhere to appear unless the mode moves.
    await ls();
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    await userEvent.click(screen.getByRole('radio', { name: 'Target concentration' }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    cleanup();
    // A reload restores the record the maker opted out of, and the mode with it: the ref that
    // remembers the choice is session state, exactly like the mode itself.
    render(<App />);
    expect((screen.getByRole('radio', { name: /Gradual/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('does not pin the maker into Gradual for a record no surface would show', async () => {
    // '-100' is not a pour, and the shared parser says so — no sheet rows, no derived
    // percentage, no widened ceiling. The mode restore asked its own `.trim() !== ''` instead,
    // so this reopened in Gradual on every reload: a field the app refuses, and no figures.
    await ls();
    await userEvent.click(screen.getByRole('radio', { name: /Gradual/ }));
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '-100');
    await new Promise((resolve) => setTimeout(resolve, 700));
    cleanup();
    render(<App />);
    expect((screen.getByRole('radio', { name: /Gradual/ }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      (screen.getByRole('radio', { name: 'Target concentration' }) as HTMLInputElement).checked,
    ).toBe(true);
  });
});

describe('a recipe we cannot read is not a recipe we lost', () => {
  it('says the unreadable draft was kept, instead of opening silently on the starter', () => {
    // A draft written by a newer build (the maker rolled the app back) fails the
    // READABLE_VERSIONS gate: it is parked at `<key>:unreadable` and no draft comes back,
    // seeding the starter. Nothing read that backup key and nothing mentioned it, so the maker
    // met a generic 1,000 g recipe where their work was — and the starter's first autosave
    // landed on the live key ~500 ms later.
    localStorage.setItem(
      'soap-calc:draft:cp',
      JSON.stringify({ version: 99, name: 'Written by a newer build', lines: [], settings: {} }),
    );
    render(<App />);

    // The starter really is what loaded — the message is the only thing standing between
    // that and a silent swap.
    expect((screen.getByLabelText('Recipe name') as HTMLInputElement).value).toBe('Starter recipe');
    const status = screen.getByText(/could not be read/i);
    expect(status.getAttribute('role')).toBe('status');
    // "Could not read your saved recipe" alone reads as "your work is gone" and stops a
    // maker looking. The sentence has to carry the rescue, not just the failure.
    expect(status.textContent).toMatch(/kept/i);
  });
});
