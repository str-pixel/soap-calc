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
    // LS seeds 0% in-cook superfat — the 1–3% LS budget is delivered post-cook (2% olive),
    // because main and post-cook superfat compound toward the ~3% cloud ceiling.
    expect(result.current.settings.superfatPercent).toBe('0');
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

describe('an unreadable draft is spoken for, not silently replaced', () => {
  // Fails the READABLE_VERSIONS gate, so loadDraftSlot preserves it under
  // `<key>:unreadable` and hands back no draft — the workspace falls to the starter.
  const fromTheFuture = JSON.stringify({
    version: 99,
    name: 'Written by a newer build',
    lines: [],
    settings: {},
  });

  it('tells the maker on the path that opens the app onto one', () => {
    localStorage.setItem('soap-calc:draft:cp', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage());
    // The initial workspace is seeded during the first render, before flashSaveMessage
    // exists — the message has to arrive from a mount effect, so it is present here.
    expect(result.current.recipeName).toBe('Starter recipe');
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/kept/i));
    // On a load path a starter really did load in the slot's place — the closing
    // clause must say that, not borrow the import path's ending.
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/starter recipe loaded/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/imported recipe loaded/));
  });

  it('tells the maker who reaches one by switching process', () => {
    localStorage.setItem('soap-calc:draft:ls', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage()); // opens on cp, whose slot is empty
    // An empty slot is not an unreadable one: seeding a starter over nothing says nothing.
    expect(result.current.saveMessage).toBeNull();
    act(() => result.current.setProcess('ls'));
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/kept/i));
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/starter recipe loaded/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/imported recipe loaded/));
  });

  it('yields the one message slot to the flush failure when both fire at once', () => {
    // Storage that refuses every write: the outgoing flush fails AND the incoming slot is
    // unreadable. flashSaveMessage is a single slot, so this must be a decision, not an
    // ordering accident — the flush failure is about work that exists only in memory and
    // is about to be lost, while the unreadable draft is already on disk.
    const store = new Map<string, string>([['soap-calc:draft:ls', fromTheFuture]]);
    vi.stubGlobal('localStorage', {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage);

    const { result } = renderHook(() => useRecipeStorage());
    act(() => result.current.setProcess('ls'));
    expect(result.current.saveMessage).toEqual(
      expect.stringMatching(/export it to avoid losing changes/i),
    );
  });
});

describe('"kept" is only said when the backup slot actually holds it', () => {
  // The backup is first-writer-wins: a second unreadable draft is NOT preserved when an
  // older one already occupies `<key>:unreadable`. The two sentences share the prefix
  // "Your saved recipe could not be read", so each test asserts a clause the other
  // sentence does not contain — /kept unchanged/ vs /could not be set aside/.
  const fromTheFuture = JSON.stringify({
    version: 99,
    name: 'Written by a newer build',
    lines: [],
    settings: {},
  });

  it('says the draft could not be set aside when an older backup already occupies the slot', () => {
    localStorage.setItem('soap-calc:draft:cp:unreadable', 'an earlier unreadable payload');
    localStorage.setItem('soap-calc:draft:cp', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage());
    expect(result.current.recipeName).toBe('Starter recipe');
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/could not be set aside/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/kept unchanged/));
    // The not-kept load sentence closes the same way: a starter loaded, not an import.
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/starter recipe loaded/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/imported recipe loaded/));
  });

  it('still says kept when the backup already holds the identical payload — same bytes, same rescue', () => {
    localStorage.setItem('soap-calc:draft:cp:unreadable', fromTheFuture);
    localStorage.setItem('soap-calc:draft:cp', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage());
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/kept unchanged/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/could not be set aside/));
  });

  it('the not-kept sentence reaches the process-switch site too', () => {
    localStorage.setItem('soap-calc:draft:ls:unreadable', 'an earlier unreadable payload');
    localStorage.setItem('soap-calc:draft:ls', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage()); // opens on cp, whose slot is empty
    expect(result.current.saveMessage).toBeNull();
    act(() => result.current.setProcess('ls'));
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/could not be set aside/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/kept unchanged/));
  });
});

describe('an import keeps the draft it replaces', () => {
  // handleImportFile writes the imported recipe onto the target process slot. An
  // unreadable draft sitting there is the same one-copy work the load paths (mount,
  // setProcess) back up and speak for — the import path must run the same discipline,
  // or a file-chooser click destroys it with no backup and no sentence. The two
  // sentences share the prefix "Your saved recipe could not be read", so each test
  // asserts a clause the other does not contain — /kept unchanged/ vs
  // /could not be set aside/ — and reads the backup slot's actual bytes.
  const fromTheFuture = JSON.stringify({
    version: 99,
    name: 'Written by a newer build',
    lines: [],
    settings: {},
  });

  const importTargetingHp = JSON.stringify({
    version: 2,
    process: 'hp',
    name: 'Incoming import',
    lines: [],
    settings: DEFAULT_SETTINGS,
  });

  // Same jsdom limitation as the flush test above: mock the minimal File shape.
  async function importOntoHp(result: { current: ReturnType<typeof useRecipeStorage> }) {
    const file = { text: () => Promise.resolve(importTargetingHp) } as unknown as File;
    await act(async () => {
      result.current.handleImportFile(file);
      // Let the file.text() promise (and its .then chain) drain before asserting.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('backs up an unreadable draft in the target slot and says kept, not the routine confirmation', async () => {
    localStorage.setItem('soap-calc:draft:hp', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage()); // opens on cp, whose slot is empty
    expect(result.current.saveMessage).toBeNull();
    await importOntoHp(result);
    // The rescue, in bytes: the displaced draft verbatim in the backup slot, the
    // imported recipe (not the v99 payload) in the live slot.
    expect(localStorage.getItem('soap-calc:draft:hp:unreadable')).toBe(fromTheFuture);
    expect(loadDraft('hp')?.name).toBe('Incoming import');
    expect(result.current.recipeName).toBe('Incoming import');
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/kept unchanged/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/could not be set aside/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/Imported/));
    // The closing clause tells the truth about THIS path: the imported recipe loaded
    // in the slot's place — "a starter recipe loaded" is the load paths' ending and
    // is false here (it also reads as the import having failed).
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/imported recipe loaded/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/starter recipe loaded/));
  });

  it('says the draft could not be set aside when an older backup already occupies the slot', async () => {
    localStorage.setItem('soap-calc:draft:hp:unreadable', 'an earlier unreadable payload');
    localStorage.setItem('soap-calc:draft:hp', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage());
    await importOntoHp(result);
    // First writer wins: the earlier occupant keeps the backup slot, byte-untouched.
    expect(localStorage.getItem('soap-calc:draft:hp:unreadable')).toBe(
      'an earlier unreadable payload',
    );
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/could not be set aside/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/kept unchanged/));
    // Same truth in the not-kept closing clause: the imported recipe loaded, no starter.
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/imported recipe loaded/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/starter recipe loaded/));
  });

  it('a readable target slot imports exactly as today: the confirmation, no backup writes', async () => {
    saveDraft('hp', 'Readable HP draft', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    const { result } = renderHook(() => useRecipeStorage());
    await importOntoHp(result);
    expect(localStorage.getItem('soap-calc:draft:hp:unreadable')).toBeNull();
    expect(loadDraft('hp')?.name).toBe('Incoming import');
    expect(result.current.saveMessage).toEqual(
      expect.stringMatching(/Imported “Incoming import” as hot process/),
    );
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/could not be read/));
  });

  it('rescues a same-process slot too — the flush lands on the very key being read', async () => {
    // Every other test here imports cross-process, where the outgoing flush writes a
    // DIFFERENT slot and the read's placement is indifferent. Same-process is the case
    // the read-before-flush ordering exists for: the flush writes draftKey(ws.process),
    // which IS the import's target key when ws.process === nextProcess. Read after the
    // flush and the slot holds the flush's bytes — the verdict is gone and no sentence
    // is said, the exact defect this discipline closes. (The BYTES half of this pin is
    // now double-covered: saveDraft itself parks an unreadable occupant before
    // overwriting, so a reorder would still back the payload up — but silently. The
    // message asserts below are what still catch it.) Review of the original task
    // proved the whole suite stayed green with the read moved below the flush; this
    // test is the pin.
    localStorage.setItem('soap-calc:active-process', 'hp');
    const { result } = renderHook(() => useRecipeStorage()); // mounts ON hp, slot empty
    // A second writer (another tab, a rollback) parks a future-version draft in the
    // SAME slot after mount — the state a same-process import walks into.
    localStorage.setItem('soap-calc:draft:hp', fromTheFuture);
    await importOntoHp(result);
    expect(localStorage.getItem('soap-calc:draft:hp:unreadable')).toBe(fromTheFuture);
    expect(loadDraft('hp')?.name).toBe('Incoming import');
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/kept unchanged/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/Imported/));
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/imported recipe loaded/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/starter recipe loaded/));
  });

  it('mount and a same-process import speak two different sentences about one slot', async () => {
    // The duplicate-sentence finding, retired: mount onto an unreadable slot flashes the
    // load-path kept sentence; a same-process import then overwrites that same slot and
    // used to flash the identical sentence again — a stuck repeat, with nothing saying
    // the import landed. The closing clause is the part that differs: what actually
    // loaded in the slot's place.
    localStorage.setItem('soap-calc:active-process', 'hp');
    localStorage.setItem('soap-calc:draft:hp', fromTheFuture);
    const { result } = renderHook(() => useRecipeStorage()); // mounts ON hp, slot unreadable
    const atMount = result.current.saveMessage;
    expect(atMount).toEqual(expect.stringMatching(/starter recipe loaded/));
    await importOntoHp(result);
    // The rescue in bytes, unchanged by the copy: backup verbatim, imported live.
    expect(localStorage.getItem('soap-calc:draft:hp:unreadable')).toBe(fromTheFuture);
    expect(loadDraft('hp')?.name).toBe('Incoming import');
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/imported recipe loaded/));
    expect(result.current.saveMessage).not.toBe(atMount);
  });

  it('yields the one message slot to the storage-full warning when both fire at once', async () => {
    // Storage that refuses every write: the flush and the imported save both fail AND
    // the target slot is unreadable (its backup write fails too, so the verdict would
    // be not-kept). One flash slot, so this must be a decision, not an ordering
    // accident — the storage-full warning names the action (export) that protects the
    // work existing only in memory, while the unreadable draft still sits in its live
    // slot, which the same failing writes cannot overwrite.
    const store = new Map<string, string>([['soap-calc:draft:hp', fromTheFuture]]);
    vi.stubGlobal('localStorage', {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: (index: number) => [...store.keys()][index] ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage);

    const { result } = renderHook(() => useRecipeStorage());
    await importOntoHp(result);
    expect(result.current.saveMessage).toEqual(expect.stringMatching(/storage is full/));
    expect(result.current.saveMessage).not.toEqual(expect.stringMatching(/could not be read/));
    // And the failing writes could not destroy the draft either: still in its live slot.
    expect(localStorage.getItem('soap-calc:draft:hp')).toBe(fromTheFuture);
  });
});

describe('no writer may destroy what it cannot read', () => {
  it("a cross-process import's outgoing flush parks the second writer's draft instead of destroying it", async () => {
    // Mount on cp with an empty slot; a second writer (another tab, a rollback build)
    // then parks a future-version draft in draft:cp. A cross-process import's OUTGOING
    // flush writes that same slot — and the import's own read/verdict is about the
    // TARGET slot (hp), so no sentence will ever speak for cp here. The rescue at the
    // point of overwrite (saveDraft itself) is the only thing standing between this
    // payload and silent destruction.
    const fromTheFuture = JSON.stringify({
      version: 99,
      name: 'Written by a newer build',
      lines: [],
      settings: {},
    });
    const { result } = renderHook(() => useRecipeStorage()); // mounts on cp, slot empty
    localStorage.setItem('soap-calc:draft:cp', fromTheFuture);

    const importTargetingHp = JSON.stringify({
      version: 2,
      process: 'hp',
      name: 'Incoming import',
      lines: [],
      settings: DEFAULT_SETTINGS,
    });
    const file = { text: () => Promise.resolve(importTargetingHp) } as unknown as File;
    await act(async () => {
      result.current.handleImportFile(file);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The rescue in bytes: the displaced payload verbatim in cp's backup slot, while the
    // flush still landed (the outgoing workspace's bytes hold the live slot) and the
    // import proceeded routinely onto its clean target slot.
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe(fromTheFuture);
    expect(loadDraft('cp')?.name).toBe('Starter recipe');
    expect(loadDraft('hp')?.name).toBe('Incoming import');
    expect(result.current.saveMessage).toEqual(
      expect.stringMatching(/Imported “Incoming import” as hot process/),
    );
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
