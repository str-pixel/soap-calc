/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor, render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { loadDraft } from './lib/recipeStorage';
import userEvent from '@testing-library/user-event';
import { preservativeDoseGrams } from '@soap-calc/core';
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

// Shared by the preservative and gradual describes below — one copy, module scope.
function row(root: HTMLElement, label: string): string {
  const item = Array.from(root.querySelectorAll('.results-grid__item')).find(
    (el) => el.querySelector('dt')?.textContent?.trim() === label,
  );
  return item?.querySelector('dd')?.textContent?.trim() ?? '';
}

function num(text: string): number {
  return Number(text.replace(/[^\d.]/g, ''));
}

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

describe('a ratio preset applies from the path the app actually opens on', () => {
  // App used to seed waterPasteRatio to '2' beside a saved 30% target, so entering ratio mode
  // rendered 2:1 ALREADY CHECKED — and re-asserting a checked radio fires no `change` event,
  // so the one move the screen invited was inert. Both cases here drove the real App rather
  // than the panel in isolation, because the seeding was App's and the bug only existed at
  // those seeded values.
  //
  // The mode, the seed and the radios are all gone (spec §2: the presets are one-shot
  // buttons, and nothing claims one of them describes the current plan). What is left of
  // that pair is the claim underneath: from the state the app actually opens in, pressing a
  // preset moves the saved target. Driven through App, still, because the plan value it
  // writes over is App's own seed.
  it('moves the saved target from the seeded state, by mouse and by keyboard alike', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const targetField = () =>
      within(panel).getByLabelText('Target soap concentration percent') as HTMLInputElement;
    const seeded = targetField().value;

    await userEvent.click(within(panel).getByRole('button', { name: '2:1' }));
    const afterClick = targetField().value;
    expect(afterClick).not.toBe(seeded);
    expect(Number(afterClick)).toBeGreaterThan(0);
    // And it says what it did, in the caption pattern §2 names.
    expect(within(panel).getByText(new RegExp(`2:1 → ${afterClick}%`))).toBeTruthy();

    // The keyboard path. In a real browser a button is activated by Space and Enter
    // natively — that guarantee is what retires the three-handler machinery the radio
    // group needed to be operable at all, and the exploratory e2e spec exercises it
    // against real Chromium. Here, jsdom provides no native activation: userEvent
    // synthesizes the click for Space/Enter, so this test pins the handler's behaviour,
    // not the browser's.
    const preset = within(panel).getByRole('button', { name: '3:1' });
    preset.focus();
    await userEvent.keyboard('{ }');
    const afterSpace = targetField().value;
    expect(afterSpace).not.toBe(afterClick);
    expect(Number(afterSpace)).toBeGreaterThan(0);
    expect(within(panel).getByText(new RegExp(`3:1 → ${afterSpace}%`))).toBeTruthy();
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
    // is — the portion's own finished solution, not a share of the batch's. The row is the
    // INCLUSIVE figure (fix 3): 257.5 + the 1% w/w dose (2.6 g) → 260 g.
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('260 g');
    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe('');
    // …and the dose follows it: 1% w/w of 257.5 g. The batch's own dose is >10 g, so this
    // assertion fails the moment the base reverts to the batch.
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(2.6, 1);
  });

  it('Whole batch scope is unchanged: the base is the batch, and the row is the basis plus the dose', async () => {
    const snippet = await openSnippet();
    const base = grams(figure(snippet, '≈ Finished product (whole batch)'));
    const dose = grams(figure(snippet, 'Preservative to add'));
    const dilutionPanel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    // The starter recipe has no additives, so bottledSolutionGrams === dilution.solutionGrams
    // — the panel's chemistry-only "Finished solution" row is the snippet's dosing BASIS,
    // never printed as-is (fix 3): the snippet's own "≈ Finished product" row is that basis
    // PLUS the dose, the same inclusive figure the panel's own same-named row would quote.
    const solution = grams(
      within(dilutionPanel).getByText('Finished solution').nextElementSibling!.textContent!,
    );
    expect(base).toBeCloseTo(solution + dose, 0);
    // Exact w/w by construction: dose / finished is exactly 0.01, whichever mass "base" is.
    expect(dose).toBeCloseTo(base * 0.01, 0);
  });

  it('the seeded default weighs what it says, chosen or not — one mass under one name', async () => {
    // The starter recipe carries the real, legal Suttocide A default (recipe.ts:165-168)
    // with `preservativeSetByUser` still false. Liquid soap is water-based and needs a
    // preservative, so that seed is the app's RECOMMENDATION and the snippet shows its
    // grams unconditionally — therefore the mass wiring must count it too. Gating the mass
    // on the flag once made the panel print 4,000 g beside the snippet's 4,040 g under the
    // identical name "≈ Finished product"; this pins the correction from both sides.
    const snippet = await openSnippet();
    const dose = grams(figure(snippet, 'Preservative to add'));
    expect(dose).toBeGreaterThan(0);
    const dilutionPanel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    // The row now appears for the starter recipe: the dose makes the bottled mass exceed
    // the chemistry-only solution, which is exactly what that row exists to report.
    const panelFinished = grams(figure(dilutionPanel, '≈ Finished product'));
    const snippetFinished = grams(figure(snippet, '≈ Finished product (whole batch)'));
    expect(panelFinished).toBeGreaterThan(0);
    expect(panelFinished).toBeCloseTo(snippetFinished, 0);
  });

  it('the bottle the maker weighs is the basis plus the dose it was promised, once chosen (spec §3, fix 2 + fix 3)', async () => {
    // THE SAFETY PIN for the inclusive figure. Fix 2 scopes it: the panel's row only carries
    // the dose once `preservativeSetByUser` is true. Touch the controls without changing the
    // choice — switch away and back — so the flag flips true while the product and its 1%
    // default dose land exactly where they started. Fix 3 makes the snippet's OWN row quote
    // that same inclusive figure — one name, one mass — so the two are no longer merely
    // related by "+dose", they are the SAME number.
    const snippet = await openSnippet();
    const summary = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('summary') as HTMLElement;
    await userEvent.click(summary);
    const picker = screen.getByLabelText('Which preservative') as HTMLSelectElement;
    await userEvent.selectOptions(picker, 'liquid-germall-plus');
    await userEvent.selectOptions(picker, 'suttocide-a');

    const inclusive = grams(figure(snippet, '≈ Finished product (whole batch)'));
    const dose = grams(figure(snippet, 'Preservative to add'));
    const dilutionPanel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const finishedProductRow = within(dilutionPanel).getByText('≈ Finished product');
    const finished = grams(finishedProductRow.nextElementSibling!.textContent!);
    // One name, one mass (fix 3): the snippet's own row and the panel's are the same figure.
    expect(finished).toBe(inclusive);
    // And that figure is the preservative-free basis plus the dose (spec §3) — never the
    // basis alone. Exact w/w: the typed 1% is true of the BOTTLE, so dose / finished is
    // exactly 0.01, not the ~0.0099 a naive basis-only % would give.
    expect(dose / finished).toBeCloseTo(0.01, 4);
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

  it('a recorded jar is what Custom amount doses, not a target-derived portion', async () => {
    // THE SAFETY PIN for the worst version of this bug. Custom amount resolved its dose
    // through the "Amount to make (ml)" field — the one input Gradual takes off the panel —
    // so a recorded 1,300 g jar was dosed against a portion sized from a stale amount, and
    // the snippet printed 21 g beside its own "1,300 g": 1.6% w/w in the jar the maker
    // actually has, past the EU ceiling for several listed preservatives.
    const snippet = await openSnippet();
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    // The stale amount that used to drive the dose. It is still on screen until the jar
    // resolves, which is what makes this the live version of the bug rather than a museum
    // piece: both ways of describing one jar are reachable at once, and the recorded one
    // wins (spec §2's portion precedence).
    await userEvent.type(screen.getByLabelText('Amount to make (ml)'), '2000');
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
    // The snippet's own row is the INCLUSIVE figure (fix 3: the jar plus the dose it
    // implies), not a bare echo of the panel's basis-only jar readout — but it is still the
    // jar the maker actually recorded that is being dosed, not the 2,060 g the stale amount
    // implies: 1,300 + the 1% w/w dose (13 g) → 1,313 g.
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('1,313 g');
    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe('');
    // 1% w/w of 1,300 g. The 2,060 g the stale amount implies would print 21 g here.
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(13, 0);
  });

  it('doses a jar the weighed pot can actually hold', async () => {
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
    await userEvent.type(screen.getByLabelText('Paste weighed out (g)'), '1700');
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '300');

    // 1,700 g of paste plus 300 g of water is a 2,000 g jar; the row is that basis PLUS the
    // 1% w/w dose (fix 3) — 2,000 + 20 → 2,020 g.
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('2,020 g');
    expect(grams(figure(snippet, 'Preservative to add'))).toBeCloseTo(20, 0);
  });

  it('a jar too heavy for the batch doses nothing, not the plan sizing grid', async () => {
    // THE DIVERGENCE the jar-truthiness gate missed. The panel suppresses the plan sizing
    // grid and the jar readout on `governs === 'record'` (DilutionPanel.tsx's
    // `portionJarGoverns`, resolveDilution.ts's portion arm since Phase 2b), not on whether a
    // jar actually resolved — and the two disagree exactly here: both fields are typed (so
    // `governs` is `'record'`) but the paste weighed out is heavier than the whole batch's own
    // paste, so resolveDilution refuses the jar (`record` is null). Keying App's dose on the
    // resolved `record`'s truthiness alone fell through to
    // `portionDilutionFor`, which sized a portion from the stale "Amount to make (ml)" still
    // on screen — a plan-sized dose while the panel showed neither the plan grid nor a jar,
    // a mass nowhere on screen. 4,000 g of paste against this recipe's ~1,666 g whole batch
    // paste is the refusal; 250 ml stale in "Amount to make" is what the plan sizing used to
    // dose instead.
    const snippet = await openSnippet();
    const dilutionPanel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    await userEvent.type(screen.getByLabelText('Amount to make (ml)'), '250');
    await userEvent.type(screen.getByLabelText('Paste weighed out (g)'), '4000');
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '300');

    // The panel's own refusal is on screen — this is live, not a museum piece.
    expect(
      within(dilutionPanel).getByText(/more paste than the batch holds/i),
    ).toBeTruthy();
    // No dose figure renders anywhere: not the plan-sized portion the stale amount implies,
    // and not a jar figure either — there is no mass on screen for either to be a % of.
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('');
    expect(figure(snippet, '≈ Finished product (whole batch)')).toBe('');
    expect(figure(snippet, 'Preservative to add')).toBe('');
  });

  it('asks for the fields it actually doses from, once a jar record is started', async () => {
    // With a jar HALF recorded there is no jar to dose — and the ask has to name the two
    // fields the maker is filling in, not the "Amount to make" input they are not using.
    // (The mode gate this replaces made the record the assumption for the whole screen; the
    // maker's own first keystroke is what says it now.)
    const snippet = await openSnippet();
    await userEvent.click(screen.getByRole('radio', { name: 'Custom amount' }));
    await userEvent.type(screen.getByLabelText('Paste weighed out (g)'), '400');
    expect(figure(snippet, '≈ Finished product (custom amount)')).toBe('');
    expect(within(snippet).getByText(/paste weighed out and the water added so far/i)).toBeTruthy();
    expect(within(snippet).queryByText(/Enter an Amount to make/i)).toBeNull();
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

describe('Whole batch, with a record: one batch has one finished mass', () => {
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
    // What the panel says is in the pot is what the snippet DOSES — the pot, never the
    // 1,666 g computed pot this printed before. The snippet's own row is the INCLUSIVE
    // figure (fix 3: the pot plus its own advisory dose, 1,400 + 14 → 1,414 g), so it is no
    // longer a bare echo of the pot text, but it is still built from the same 1,400 g.
    expect(row(snippet, '≈ Finished product (whole batch)')).toBe('1,414 g');
    // …and the volume the maker sizes bottles from follows it, dose included: the seeded 1%
    // Suttocide A is the app's recommendation for a water-based product and weighs what the
    // snippet says it does, chosen or not — (1,400 + 1,400x1/99) / 1.03 = 1,373 ml, not the
    // 1,359 ml the pot alone would give.
    expect(row(panel, '≈ Finished volume')).toBe('1,373 ml');
    // The snippet's OWN advisory dose is unaffected by the flag — it always shows the maker
    // a worked example from the typed %, gated on neither the tier nor the choice: 1,400×1/99
    // ≈ 14 g. It is the mass that bottles that follows the choice, not this figure.
    expect(num(row(snippet, 'Preservative to add'))).toBeCloseTo(14, 0);
  });

  it('once the maker has chosen a preservative, the mass it doses actually bottles', async () => {
    // The inclusive counterpart to the test above: the same 1,400 g / 0 g record, but with
    // the preservative controls touched — switch away and back so `preservativeSetByUser`
    // flips true while the product and its 1% default dose land exactly where they started.
    // This reproduces the original bug's fixture: against the computed 1,666 g pot the dose
    // would have been 17 g, 1.19% of the 1,400 g batch actually on the scale.
    const { panel, snippet, paste, water } = await gradualLs();
    const summary = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('summary') as HTMLElement;
    await userEvent.click(summary);
    const picker = screen.getByLabelText('Which preservative') as HTMLSelectElement;
    await userEvent.selectOptions(picker, 'liquid-germall-plus');
    await userEvent.selectOptions(picker, 'suttocide-a');

    fireEvent.change(paste, { target: { value: '1400' } });
    fireEvent.change(water, { target: { value: '0' } });

    expect(potRow(panel)).toBe('1,400 g');
    // …and the volume the maker sizes bottles from follows it: the finished mass now
    // INCLUDES the preservative dose (spec §3) — (1,400 + 1,400×1/99) / 1.03 ≈ 1,373 ml —
    // not the plain 1,359 ml the pot alone would give, and not the 1,618 ml the computed
    // pot implies.
    expect(row(panel, '≈ Finished volume')).toBe('1,373 ml');
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
      // NOTHING TO SKIP ANY MORE. This sweep used to step over the readings the write-back's
      // own [1, 99] clamp moved: a pot that light is over 99% soap, so the saved target was
      // capped below what the record described and the app really was pricing a heavier
      // solution than the pot on the scale. With no write-back the record governs at its own
      // unclamped concentration in every one of those readings, and the bottled mass follows
      // the pot throughout — so the corner the clamp used to own is simply gone, and the
      // sweep covers the whole window.
      checked += 1;
      // The snippet's own row is the INCLUSIVE figure (fix 3: pot + the 1% w/w dose), no
      // longer a bare echo of the pot text — so the invariant this sweep protects is that
      // the snippet's BASIS tracks the same pot the panel shows (never a different,
      // recipe-predicted one), not that the two printed strings are identical. Recomputed
      // from the panel's own (already-rounded) pot reading, so a whole gram of independent
      // rounding on each side of the +1% is expected slack, not a real disagreement.
      const potNum = num(potRow(panel));
      const expectedInclusive = potNum + preservativeDoseGrams(potNum, 1);
      const snippetNum = num(row(snippet, '≈ Finished product (whole batch)'));
      if (Math.abs(snippetNum - expectedInclusive) > 1.5) {
        split.push(`${reading} g: pot ${potRow(panel)} → expected ~${expectedInclusive.toFixed(1)} g, snippet said ${row(snippet, '≈ Finished product (whole batch)')}`);
      }
    }
    // The sweep has to have swept something — a helper that silently found no rows would
    // otherwise pass this test with an empty list.
    expect(checked).toBeGreaterThan(300);
    expect(split, `${split.length} readings show the snippet basing its dose on a different pot than the panel's`).toEqual([]);
  }, 60000);
});

describe('the mid-pour companion dose (spec §3)', () => {
  // THE SAFETY PIN for the invisible under-dose: a maker who weighs the preservative
  // against the batch that exists TODAY (0 g poured, or any partial pour) sees only the
  // governing figure unless the snippet also shows what the SAME batch will need once
  // diluted on to the plan. `finishedGrams` and `planDosingBasisGrams` are two different
  // quantities — the dose for the batch that exists vs the dose at plan completion — and
  // this pins that App wires the second one in, gated on the controller's own STRICT rule
  // (`record.waterGrams < dilution.dilutionWaterGrams`), not merely "a record exists".

  // The companion's own text embeds a SECOND number (the dose %, e.g. "1%") ahead of the
  // grams figure — `num` above would concatenate the two digit runs into nonsense (e.g.
  // "1% plan: 41 g" → 141). This pulls only the trailing weight.
  function companionGrams(text: string): number {
    return Number((text.match(/([\d,.]+)\s*\S+$/)?.[1] ?? '').replace(/,/g, ''));
  }

  it('shows a plan-labelled companion once a record governs, and retires it once the record reaches the plan', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const snippet = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('details') as HTMLElement;

    // Read the plan's own figures BEFORE any record exists — with no record the plan
    // governs and its rows still carry their bare (unlabelled) names (spec §2/§4).
    const planWater = num(row(panel, 'Dilution water to add'));
    const planSolution = num(row(panel, 'Finished solution'));
    expect(planWater).toBeGreaterThan(0);
    const expectedCompanion = preservativeDoseGrams(planSolution, 1);

    const water = screen.getByLabelText('Water added so far (g)');
    // 0 g poured is a record (LS:1531: the pot before any water at all is Gradual's own
    // starting entry) — the record now governs, and its water (0) is strictly below the
    // plan's own dilution water, so the companion belongs on screen.
    fireEvent.change(water, { target: { value: '0' } });
    // The plan phrase lives in the dt now (one announcement, bare-weight dd — the
    // review's a11y point); the row helper keys on the dt, so the label IS the assertion.
    const companionText = row(snippet, 'At your 1% plan');
    expect(companionText).toMatch(/^\d/);
    expect(companionGrams(companionText)).toBeCloseTo(expectedCompanion, 0);

    // Past the plan's own dilution water the two doses coincide within rounding — the
    // controller ruling is STRICT (record.waterGrams < dilution.dilutionWaterGrams), so
    // the companion retires rather than repeating a number the governing row already shows.
    fireEvent.change(water, { target: { value: String(planWater + 500) } });
    expect(row(snippet, 'At your 1% plan')).toBe('');
  });

  it("compares the record against the plan row's OWN corrected water, not the raw plan figure the screen shows nowhere (spec §3 controller ruling)", async () => {
    // A weighed pot LIGHTER than the recipe's own computed pot (evaporation) corrects the
    // panel's "(plan)" dilution-water row UPWARD — probe-confirmed on this fixture: raw
    // (unmeasured) plan water 2,407 g, corrected (1,400 g weighed pot) plan water 2,674 g,
    // same 4,074 g solution both ways. A 2,500 g record sits BETWEEN those two figures: the
    // batch has not yet reached the plan's own (corrected) water, so the companion belongs
    // on screen — but the memo at HEAD compares against the raw 2,407 g instead, which the
    // screen prints nowhere, and 2,500 g already clears that raw figure, so the companion
    // goes missing for exactly the evaporation mass.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const snippet = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('details') as HTMLElement;

    await userEvent.type(
      screen.getByLabelText('Measured paste weight — the whole batch (g, optional)'),
      '1400',
    );

    const water = screen.getByLabelText('Water added so far (g)');
    fireEvent.change(water, { target: { value: '2500' } });

    // The screen's own plan row is the corrected figure — confirms the fixture landed in
    // the accepted-reading window between the raw and corrected boundaries, not merely
    // asserting a number this test invented.
    const correctedPlanWater = num(row(panel, 'Dilution water to add (plan)'));
    expect(correctedPlanWater).toBeCloseTo(2674, 0);
    expect(correctedPlanWater).toBeGreaterThan(2500);

    expect(row(snippet, 'At your 1% plan')).toMatch(/^\d/);
  });

  it('renders even where a leftover record coincidentally reproduces the typed target within the old rounding bound (Phase 3, decision 8)', async () => {
    // THE COINCIDENCE CORNER a review found reachable through this exact wiring, not just a
    // hand-built lib fixture: on the LS tab's default 30% target, anhydrousGrams is
    // ≈1,222.133 g, so solutionGrams ≈4,073.778 g and the OLD widened ceiling — solutionGrams
    // stretched by the gradual write-back's own 2 dp rounding, 100·anhydrous/(30 − 0.005) —
    // reached ≈4,074.457 g: a ≈0.68 g band (probe-confirmed, matching the module doc's own
    // "0.68 g at 30%" estimate). A weighed reading of 4,074.2 g sits inside it, and a '0'
    // record (the pot before any water at all, LS:1531) is exactly the state whose own
    // arithmetic reproduces 30.00% from that reading within the old tolerance — the
    // "coincidental match" the deleted widening existed to absorb.
    //
    // BEFORE (measuredPaste.ts pre-Phase-3, HEAD~1): the widening accepted 4,074.2 g as the
    // pot, so `correctedDilutionWaterGrams` clamped to 0 g — the panel's "Dilution water to
    // add (plan)" row printed "0 g", and the companion-dose memo's STRICT gate
    // (`record.waterGrams < correctedPlanWaterGrams`, i.e. `0 < 0`) was FALSE, so "At your 1%
    // plan" stayed off screen — an invisible under-dose (spec §3's own hazard) for a batch
    // that has not actually reached the plan.
    //
    // AFTER (this deletion): the reading is refused by the same unwidened ceiling
    // `measuredPasteIsValidFor` already applies everywhere else, so the plan row falls back to
    // the recipe's own computed pot (anhydrous + cook water, ≈1,666.4 g here, no split
    // liquid) — the IDENTICAL figure a plain unmeasured reading already gets (decision 8: the
    // widening's old licence is decision 8 reversed, so the corrected behaviour is the
    // no-record twin's own decided figure, not a regression: ≈2,407 g, the same "Dilution
    // water to add" this recipe shows with nothing typed into either field at all).
    // `correctedPlanWaterGrams` is now ≈2,407 g, so `0 < 2,407` is TRUE and the companion
    // renders. This is a recorded BEHAVIOUR CHANGE at this corner, not a byte-identical
    // no-op — pinned here on the decided (post-deletion) side.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    const snippet = screen
      .getByRole('heading', { name: 'Preservative' })
      .closest('details') as HTMLElement;

    await userEvent.type(
      screen.getByLabelText('Measured paste weight — the whole batch (g, optional)'),
      '4074.2',
    );
    const water = screen.getByLabelText('Water added so far (g)');
    fireEvent.change(water, { target: { value: '0' } });

    // The plan row lands on the no-record twin's own figure — not the widened "0 g" the old
    // ceiling would have printed for this exact reading.
    const correctedPlanWater = num(row(panel, 'Dilution water to add (plan)'));
    expect(correctedPlanWater).toBeCloseTo(2407, 0);
    expect(correctedPlanWater).toBeGreaterThan(2000);

    // THE DECIDED SIDE: the companion renders, because the record's 0 g is strictly below the
    // plan's own (now non-zero) corrected water — the invisible-under-dose gate spec §3 exists
    // to close, and the exact case the old widening used to leave open.
    expect(row(snippet, 'At your 1% plan')).toMatch(/^\d/);
  });
});

describe('a record arriving with a recipe needs no session state to appear in', () => {
  // RETIRED WITH THE MODE-RESTORE EFFECT (spec §5), and this describe is what its whole
  // existence was for. `dilutionMode` was session state and the recorded water was recipe
  // state, so a record survived a reload and had nowhere to appear: the panel came back in
  // Concentration mode with the field that shows the record off screen entirely. The effect
  // that restored Gradual then had to be taught three more things — to leave Gradual when a
  // recipe arrived WITHOUT a record, to leave the OTHER two modes alone on a process-tab
  // round trip (which bumps the same key), and to stop re-imposing Gradual on every such trip
  // once the maker had answered for that record (`gradualModeChoiceRef`) — sixty lines of
  // arbitration, all of it about which mode a maker should be in.
  //
  // There is no mode. The record's field is on the whole-batch screen in every state, so a
  // record appears the moment its recipe does, and there is nothing for an arrival to impose
  // or a maker to be pinned into. The four cases collapse to the two claims underneath them.
  async function ls() {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
  }

  async function chooseNewRecipe() {
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New recipe' }));
  }

  it('shows a recorded pour the moment its recipe reloads, with no mode to restore', async () => {
    await ls();
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    // The autosave debounce (500 ms) is what makes this a reload rather than a re-render:
    // the record has to be in storage before the second mount reads it. Wait on the exact
    // condition under test — a second mount can read it back — through loadDraft, the seam
    // recipeStorage keeps for tests, so the key and payload shape have one owner. The
    // explicit timeout is what actually outlasts a loaded runner: waitFor's 1 s default
    // left only 500 ms of headroom over the debounce, the same cliff the old sleep had.
    await waitFor(
      () => expect(loadDraft('ls')?.settings.gradualWaterGrams).toBe('1500'),
      { timeout: 5000 },
    );
    cleanup();
    render(<App />);
    expect(screen.getByLabelText('Water added so far (g)')).toHaveProperty('value', '1500');
    // ...and it GOVERNS, which is the half the old restore effect could only approximate by
    // putting the maker in the right mode.
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    expect(within(panel).getByText(/Finished so far/)).toBeTruthy();
    expect(within(panel).getByText('Dilution water to add (plan)')).toBeTruthy();
  });

  it('a new recipe leaves the record behind, and the panel with it', async () => {
    await ls();
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    expect(screen.getByLabelText('Water added so far (g)')).toHaveProperty('value', '1500');

    await chooseNewRecipe();

    // The field is still there — it always is — and it is empty, so the plan governs again.
    expect(screen.getByLabelText('Water added so far (g)')).toHaveProperty('value', '');
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    expect(within(panel).queryByText(/Finished so far/)).toBeNull();
    expect(within(panel).getByText('Dilution water to add')).toBeTruthy();
  });

  it('a process-tab round trip costs the maker nothing they typed', async () => {
    // workspaceGeneration bumps on a process switch as well as on New/import
    // (useRecipeStorage's setProcess), and the restore effect treated every bump as a recipe
    // arriving with a record to answer for — charging a maker for glancing at another tab, in
    // one direction or the other depending on how it was written. With nothing to restore,
    // the round trip is inert: the plan the maker typed and the record they poured both come
    // back exactly as they were.
    await ls();
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '1500');
    await userEvent.clear(screen.getByLabelText('Target soap concentration percent'));
    await userEvent.type(screen.getByLabelText('Target soap concentration percent'), '25');

    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));

    expect(screen.getByLabelText('Target soap concentration percent')).toHaveProperty('value', '25');
    expect(screen.getByLabelText('Water added so far (g)')).toHaveProperty('value', '1500');
  });

  it('a record no surface would show governs nothing, and pins the maker nowhere', async () => {
    // RETIRED-AND-KEPT: 'does not pin the maker into Gradual for a record no surface would
    // show'. '-100' is not a pour, and the shared parser says so — no sheet rows, no derived
    // percentage, no widened ceiling. The restore effect asked its own `.trim() !== ''`
    // instead, so this reopened in Gradual on every reload: a field the app refuses, and no
    // figures. There is no mode to be pinned into now, and the claim underneath is that the
    // ONE predicate decides: a refused record leaves the plan governing.
    await ls();
    await userEvent.type(screen.getByLabelText('Water added so far (g)'), '-100');
    // Storage keeps even a refused value — the record field persists what the maker typed.
    await waitFor(
      () => expect(loadDraft('ls')?.settings.gradualWaterGrams).toBe('-100'),
      { timeout: 5000 },
    );
    cleanup();
    render(<App />);
    const panel = screen
      .getByRole('heading', { name: 'Dilution' })
      .closest('section') as HTMLElement;
    expect(screen.getByLabelText('Water added so far (g)')).toHaveProperty('value', '-100');
    expect(within(panel).queryByText(/Finished so far/)).toBeNull();
    expect(within(panel).getByText('Dilution water to add')).toBeTruthy();
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

// RETIRED: 'a mode the maker chose survives the arrivals a record used to override' (three
// cases). Every one of them arbitrated between a mode the restore effect wanted to impose and
// a mode the maker had picked — the `gradualModeChoiceRef` machinery. There is no mode and no
// effect, so there is nothing to arbitrate; the surviving claims (a record appears on reload,
// a tab round trip costs nothing, a refused record governs nothing) are the describe above.

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
