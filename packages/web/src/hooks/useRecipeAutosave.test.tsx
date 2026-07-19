/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRecipeAutosave } from './useRecipeAutosave';
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
    renderHook(() =>
      useRecipeAutosave('ls', 'Body wash', createStarterLines(), DEFAULT_SETTINGS, additives),
    );
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
      ({ name }) => useRecipeAutosave('cp', name, createStarterLines(), DEFAULT_SETTINGS, []),
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
      ({ name }) => useRecipeAutosave('cp', name, createStarterLines(), DEFAULT_SETTINGS, []),
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
      ({ name }) => useRecipeAutosave('cp', name, createStarterLines(), DEFAULT_SETTINGS, []),
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

  it('removes its pagehide/visibilitychange listeners on unmount', () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useRecipeAutosave('cp', 'Some name', createStarterLines(), DEFAULT_SETTINGS, []),
    );
    expect(addSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
    vi.useRealTimers();
  });
});
