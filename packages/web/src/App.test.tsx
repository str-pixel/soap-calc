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

  it('keeps the global weight-unit selector unambiguous with the dilution panel on screen', async () => {
    // The dilution panel's own unit switch is captioned "Weight unit" too, so that a sighted
    // maker and a voice-control user see and say the same words the app already uses for
    // this choice (BatchBasics). Its ACCESSIBLE name must therefore contain that string
    // without equalling it: SettingsPanel's global selector answers to exactly "Weight unit"
    // and is queried that way, and Liquid Soap is the one process where both controls are
    // mounted at once. Naming the panel switch "Weight unit" outright would make this throw.
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    expect(screen.getByRole('radiogroup', { name: /weight unit/i })).toBeTruthy();
    const globalSelector = screen.getByLabelText('Weight unit');
    expect(globalSelector.tagName).toBe('SELECT');
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
    // loadWorkspace → loadDraft → JSON.parse, which allocates a brand-new `lines` array
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
  // batch sheet — still uses your saved 30% target, not the 25% above". Both of these drive
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
