/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecipeStorage } from './useRecipeStorage';
import { saveDraft, saveActiveProcess, loadDraft } from '../lib/recipeStorage';
import { DEFAULT_SETTINGS, createStarterLines, createEmptyAdditives } from '../lib/recipe';

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

describe('useRecipeStorage process', () => {
  it('starts on the persisted active process and loads that draft', () => {
    saveActiveProcess('ls');
    saveDraft('ls', 'LS draft', createStarterLines(), { ...DEFAULT_SETTINGS, lyeType: 'koh' }, createEmptyAdditives());
    const { result } = renderHook(() => useRecipeStorage());
    expect(result.current.process).toBe('ls');
    expect(result.current.recipeName).toBe('LS draft');
  });

  it('setProcess swaps to that process draft (seeding defaults when empty)', () => {
    const { result } = renderHook(() => useRecipeStorage());
    expect(result.current.process).toBe('cp');
    act(() => result.current.setProcess('ls'));
    expect(result.current.process).toBe('ls');
    expect(result.current.settings.lyeType).toBe('koh'); // seeded from LS defaults
  });

  it('handleNew seeds settings from the active process defaults', () => {
    const { result } = renderHook(() => useRecipeStorage());
    act(() => result.current.setProcess('ls'));
    act(() => result.current.handleNew());
    expect(result.current.settings.lyeType).toBe('koh');
    expect(result.current.settings.superfatPercent).toBe('2');
  });

  it('setProcess flushes the current workspace so a just-made edit is not lost', () => {
    const { result } = renderHook(() => useRecipeStorage()); // defaults to cp
    act(() => result.current.setSettings((s) => ({ ...s, superfatPercent: '6' })));
    act(() => result.current.setProcess('hp'));
    expect(loadDraft('cp')?.settings.superfatPercent).toBe('6');
  });

  it('handleImportFile flushes the outgoing workspace before swapping process, mirroring setProcess', async () => {
    const { result } = renderHook(() => useRecipeStorage()); // defaults to cp
    act(() => result.current.setSettings((s) => ({ ...s, superfatPercent: '6' })));

    const raw = JSON.stringify({
      version: 2,
      process: 'ls',
      name: 'Imported LS',
      lines: [],
      settings: { ...DEFAULT_SETTINGS, lyeType: 'koh' },
    });
    // jsdom's File doesn't implement Blob#text() in this test setup, so mock the
    // minimal shape handleImportFile actually uses instead of `new File(...)`.
    const file = { text: () => Promise.resolve(raw) } as unknown as File;

    await act(async () => {
      result.current.handleImportFile(file);
      // Let the file.text() promise (and its .then chain) drain before asserting.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.process).toBe('ls');
    expect(loadDraft('cp')?.settings.superfatPercent).toBe('6');
  });
});
