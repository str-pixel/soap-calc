/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
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

  it('shows CP extras (dose converters + notes) for Cold process but not Liquid Soap', async () => {
    render(<App />);
    expect(screen.getByText('CP extras')).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    expect(screen.queryByText('CP extras')).toBeNull();
  });

  it('clears the measured paste when the recipe oils change', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    // "Dilute part of the batch" is a collapsed <details>; open it so its fields are
    // interactive.
    await userEvent.click(screen.getByText(/Dilute part of the batch/i));
    const measuredInput = screen.getByLabelText(/Measured paste weight — whole batch/i);
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

    await userEvent.click(screen.getByText(/Dilute part of the batch/i));
    let measuredInput = screen.getByLabelText(/Measured paste weight — whole batch/i);
    await userEvent.type(measuredInput, '1500');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');

    // Switch to Cold process — its oils genuinely differ from LS's now-edited oils — and
    // back. LS's own oils never changed, so the measurement must survive the round trip.
    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    await userEvent.click(screen.getByText(/Dilute part of the batch/i));
    measuredInput = screen.getByLabelText(/Measured paste weight — whole batch/i);
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
    await userEvent.click(screen.getByText(/Dilute part of the batch/i));
    let measuredInput = screen.getByLabelText(/Measured paste weight — whole batch/i);
    await userEvent.type(measuredInput, '1500');
    expect((measuredInput as HTMLInputElement).value).toBe('1500');

    // Switching away and back reloads the Liquid Soap workspace's own draft via
    // loadWorkspace → loadDraft → JSON.parse, which allocates a brand-new `lines` array
    // even though the oils themselves never changed. That must not read as an oils edit.
    await userEvent.click(screen.getByRole('tab', { name: /cold process/i }));
    await userEvent.click(screen.getByRole('tab', { name: /liquid soap/i }));
    await userEvent.click(screen.getByText(/Dilute part of the batch/i));

    measuredInput = screen.getByLabelText(/Measured paste weight — whole batch/i);
    expect((measuredInput as HTMLInputElement).value).toBe('1500');
  });
});
