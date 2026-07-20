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

  it('handleNew locks the starter batch, matching a fresh load of the same recipe', () => {
    // handleNew ships the identical starter recipe as the initial load (weights summing
    // to an intentional 1000 g total), so it must carry the same provenance. Otherwise
    // the same visible recipe rebalances within 1000 g on first load but grows the total
    // after "New recipe" — two different batch sizes and lye figures from one keystroke.
    const { result } = renderHook(() => useRecipeStorage());
    const onLoad = result.current.settings.batchSetByUser;
    act(() => result.current.handleNew());
    expect(result.current.settings.batchSetByUser).toBe(onLoad);
    expect(result.current.settings.batchSetByUser).toBe(true);
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

  it('overlapping imports: a second import chosen before the first resolves wins deterministically, even if the first resolves later', async () => {
    const { result } = renderHook(() => useRecipeStorage()); // defaults to cp

    let resolveFirst!: (raw: string) => void;
    let resolveSecond!: (raw: string) => void;
    const first = {
      text: () => new Promise<string>((resolve) => { resolveFirst = resolve; }),
    } as unknown as File;
    const second = {
      text: () => new Promise<string>((resolve) => { resolveSecond = resolve; }),
    } as unknown as File;

    const rawFirst = JSON.stringify({
      version: 2, process: 'ls', name: 'First import', lines: [],
      settings: { ...DEFAULT_SETTINGS, lyeType: 'koh' },
    });
    const rawSecond = JSON.stringify({
      version: 2, process: 'hp', name: 'Second import', lines: [],
      settings: DEFAULT_SETTINGS,
    });

    act(() => {
      result.current.handleImportFile(first);
      result.current.handleImportFile(second);
    });

    // The second (later) import's file read resolves first — the fast path in a real
    // double-click race. The stale first import then resolves after it.
    await act(async () => {
      resolveSecond(rawSecond);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      resolveFirst(rawFirst);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The latest-fired import wins; the stale one's late resolution must not clobber it.
    expect(result.current.process).toBe('hp');
    expect(result.current.recipeName).toBe('Second import');
    expect(loadDraft('hp')?.name).toBe('Second import');
  });
});

describe('import flush freshness (deep-review)', () => {
  it('flushes the workspace as it is when the file resolves, not as it was when import started', async () => {
    const { result } = renderHook(() => useRecipeStorage());
    let resolveText: (raw: string) => void;
    const pending = new Promise<string>((res) => { resolveText = res; });
    const file = { text: () => pending } as unknown as File;

    act(() => { result.current.handleImportFile(file); });
    // The user keeps working while the file is being read.
    act(() => { result.current.setRecipeName('edited during import'); });

    // Cross-process import: a same-process import would immediately overwrite the
    // flushed cp slot with the imported recipe, hiding what this test observes.
    const imported = JSON.stringify({
      version: 1, name: 'incoming', process: 'hp',
      lines: [{ oilId: 'olive-oil', weightGrams: '500' }],
      settings: { ...DEFAULT_SETTINGS },
    });
    await act(async () => { resolveText!(imported); await pending; });

    // The pre-swap flush of the outgoing workspace must contain the newer name.
    // (Import replaces the in-memory workspace, so draft:cp holds the flushed snapshot.)
    const flushed = loadDraft('cp');
    expect(flushed?.name).toBe('edited during import');
  });
});
