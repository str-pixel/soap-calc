/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useRecipeAutosave } from './useRecipeAutosave';
import { createEmptyScentColor } from '../lib/scentColor';

const SCENT = createEmptyScentColor();
import { loadDraft } from '../lib/recipeStorage';
import { DEFAULT_SETTINGS, createStarterLines } from '../lib/recipe';
import type { AdditiveLine } from '../lib/recipe';

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
  // Unmount every hook so leaked pagehide/visibilitychange listeners from one
  // test cannot fire (and write drafts) during a later test's dispatch.
  cleanup();
  vi.unstubAllGlobals();
});

describe('useRecipeAutosave', () => {
  it('writes the draft under the active process key', () => {
    const additives: AdditiveLine[] = [
      {
        key: 'x',
        catalogId: 'honey',
        name: 'Honey',
        amount: '1',
        basis: 'oil',
        unit: 'percent',
        addAt: 'trace',
      },
    ];
    vi.useFakeTimers();
    // Mount alone must not write (dirty-tracking skips the just-loaded state);
    // an edit is what triggers the autosave.
    const { rerender } = renderHook(
      ({ name }) => useRecipeAutosave('ls', name, createStarterLines(), DEFAULT_SETTINGS, additives, SCENT),
      { initialProps: { name: 'Draft' } },
    );
    rerender({ name: 'Body wash' });
    vi.advanceTimersByTime(600);
    vi.useRealTimers();
    expect(loadDraft('ls')?.name).toBe('Body wash');
    expect(loadDraft('cp')).toBeNull();
    // `key` is regenerated on load (additivesFromSaved), so compare the
    // persisted fields via toMatchObject rather than a literal toEqual.
    expect(loadDraft('ls')?.additives).toMatchObject([
      { catalogId: 'honey', name: 'Honey', amount: '1', basis: 'oil', unit: 'percent', addAt: 'trace' },
    ]);
  });

  it('flushes a pending edit synchronously on pagehide, before the 500ms debounce fires', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, createStarterLines(), DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'First name' } },
    );
    // A fresh edit lands mid-debounce (rerender re-runs the effect, resetting the timer,
    // exactly like a keystroke would in the real app).
    rerender({ name: 'Edited just before tab close' });
    expect(loadDraft('cp')).toBeNull(); // nothing persisted yet — still inside the window

    window.dispatchEvent(new Event('pagehide'));

    expect(loadDraft('cp')?.name).toBe('Edited just before tab close');

    unmount();
    vi.useRealTimers();
  });

  it('flushes on visibilitychange when the tab becomes hidden', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, createStarterLines(), DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'First name' } },
    );
    rerender({ name: 'Edited then tab is hidden' });
    expect(loadDraft('cp')).toBeNull();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    expect(loadDraft('cp')?.name).toBe('Edited then tab is hidden');

    unmount();
    vi.useRealTimers();
  });

  it('does not double-save: the flushed pending timer does not also fire later', () => {
    vi.useFakeTimers();
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const { rerender, unmount } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, createStarterLines(), DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'First name' } },
    );
    rerender({ name: 'Edited just before tab close' });

    window.dispatchEvent(new Event('pagehide'));
    const callsAfterFlush = setItemSpy.mock.calls.length;
    expect(callsAfterFlush).toBeGreaterThan(0);

    // The debounce timer that would have re-run the same save must have been cleared —
    // advancing past it should not save again.
    vi.advanceTimersByTime(600);
    expect(setItemSpy.mock.calls.length).toBe(callsAfterFlush);

    unmount();
    setItemSpy.mockRestore();
    vi.useRealTimers();
  });

  it('saves the COMMITTED state on pagehide, never an in-flight draft', () => {
    // The hook takes no draft channel at all: a draft is not yet the maker's intent, and
    // resolving one here would persist "3" typed on the way to "350" — or, through the
    // total, rescale every oil line. This listener also fires on every mobile app-switch.
    // e2e/recipe-ui.spec.ts ('autosave persists the committed weight, not a mid-typed
    // value') pins the same contract end to end, through a real reload.
    const lines = createStarterLines();
    renderHook(() =>
      useRecipeAutosave('cp', 'r', lines, DEFAULT_SETTINGS, [] as AdditiveLine[], SCENT),
    );
    window.dispatchEvent(new Event('pagehide'));
    const draft = loadDraft('cp');
    expect(draft?.lines[0].weightGrams).toBe(lines[0].weightGrams);
    expect(draft?.settings.batchOilGrams).toBe(DEFAULT_SETTINGS.batchOilGrams);
  });

  it('removes its pagehide/visibilitychange listeners on unmount', () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useRecipeAutosave('cp', 'Some name', createStarterLines(), DEFAULT_SETTINGS, [], SCENT),
    );
    expect(addSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
    vi.useRealTimers();
  });
});

describe('dirty-tracking (deep-review)', () => {
  it('does not write back what it just loaded on mount (multi-tab last-writer hazard)', () => {
    vi.useFakeTimers();
    const lines = createStarterLines();
    renderHook(() =>
      useRecipeAutosave('cp', 'Starter recipe', lines, DEFAULT_SETTINGS, [], SCENT),
    );
    vi.advanceTimersByTime(1000);
    expect(loadDraft('cp')).toBeNull();
    vi.useRealTimers();
  });

  it('still saves an edit after the debounce', () => {
    vi.useFakeTimers();
    const lines = createStarterLines();
    const { rerender } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, lines, DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'Starter recipe' } },
    );
    vi.advanceTimersByTime(1000);
    rerender({ name: 'renamed' });
    vi.advanceTimersByTime(1000);
    expect(loadDraft('cp')?.name).toBe('renamed');
    vi.useRealTimers();
  });
});

describe('failed-save retry (second wave)', () => {
  it('does not mark the workspace clean when saveDraft fails — the flush retries', () => {
    vi.useFakeTimers();
    const lines = createStarterLines();
    const { rerender } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, lines, DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'Draft' } },
    );
    // Make the debounced save fail once (quota), then let storage recover.
    const original = localStorage.setItem.bind(localStorage);
    let failures = 0;
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      failures += 1;
      throw new Error('QuotaExceededError');
    });
    rerender({ name: 'edited under quota pressure' });
    vi.advanceTimersByTime(600); // debounce fires, save fails
    expect(failures).toBeGreaterThan(0);
    vi.mocked(localStorage.setItem).mockImplementation(original); // storage freed
    window.dispatchEvent(new Event('pagehide')); // flush must see dirty and retry
    expect(loadDraft('cp')?.name).toBe('edited under quota pressure');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
});

describe('externally-deleted draft (third wave)', () => {
  it('re-persists on pagehide when the draft slot was deleted out from under a clean tab', () => {
    vi.useFakeTimers();
    const lines = createStarterLines();
    const { rerender } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, lines, DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'Draft' } },
    );
    rerender({ name: 'my recipe' });
    vi.advanceTimersByTime(600); // saved, workspace clean
    expect(loadDraft('cp')?.name).toBe('my recipe');

    localStorage.removeItem('soap-calc:draft:cp'); // another tab cleared storage
    window.dispatchEvent(new Event('pagehide'));
    // Writing into an EMPTY slot cannot clobber newer data — the flush must restore it.
    expect(loadDraft('cp')?.name).toBe('my recipe');
    vi.useRealTimers();
  });
});

describe('review fixes 2026-09-21: a hide-flush leaves the workspace clean', () => {
  it('does not re-save on the next hide when nothing changed since the last one', () => {
    vi.useFakeTimers();
    const lines = createStarterLines();
    // The flush stores what it saved into lastSavedRef, and isDirty() compares that by
    // identity. Storing a freshly SPREAD settings object after a save left it permanently
    // unequal to settingsRef, so the workspace could never read clean again and every
    // later hide re-wrote byte-identical state.
    const { rerender } = renderHook(
      ({ name }) => useRecipeAutosave('cp', name, lines, DEFAULT_SETTINGS, [], SCENT),
      { initialProps: { name: 'Draft' } },
    );
    rerender({ name: 'my recipe' });

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); // dirty: this one must save
    expect(loadDraft('cp')?.name).toBe('my recipe');

    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    document.dispatchEvent(new Event('visibilitychange')); // nothing changed: must be a no-op
    expect(setItemSpy.mock.calls.length).toBe(0);

    setItemSpy.mockRestore();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.useRealTimers();
  });
});
