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
      { key: 'x', catalogId: 'honey', name: 'Honey', percentOfOil: '1', addAt: 'trace' },
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
      { catalogId: 'honey', name: 'Honey', percentOfOil: '1', addAt: 'trace' },
    ]);
  });
});
