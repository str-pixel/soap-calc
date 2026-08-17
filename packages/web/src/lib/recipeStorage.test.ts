import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, createEmptyAdditives, createStarterLines, normalizeSettings } from './recipe';
import {
  loadActiveProcess,
  loadDraft,
  loadDraftSlot,
  migrateLegacyDraft,
  saveActiveProcess,
  saveDraft,
} from './recipeStorage';

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

describe('recipeStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    // Undo stubGlobal so this describe block's stubs — including the
    // always-throws-on-setItem one below — don't leak into other tests.
    vi.unstubAllGlobals();
  });

  it('round-trips draft state', () => {
    const lines = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '500' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '500' },
    ];
    const additives = [
      {
        key: 'x',
        catalogId: 'honey',
        name: 'Honey',
        amount: '1',
        basis: 'oil' as const,
        unit: 'percent' as const,
        addAt: 'trace' as const,
      },
    ];

    saveDraft('cp', 'My batch', lines, DEFAULT_SETTINGS, additives);
    const draft = loadDraft('cp');

    expect(draft?.name).toBe('My batch');
    expect(draft?.lines).toHaveLength(2);
    expect(draft?.additives).toHaveLength(1);
    expect(draft?.settings.superfatPercent).toBe('5');
  });

  it('normalizes settings missing new fields from older saves', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveDraft('cp', 'Legacy', lines, { superfatPercent: '8', lyeType: 'naoh' } as never);
    const draft = loadDraft('cp');
    expect(draft?.settings.waterMode).toBe('percent_of_oils');
    expect(draft?.settings.weightUnit).toBe('g');
    expect(draft?.settings.splitLiquids).toEqual([]);
    expect(normalizeSettings({ superfatPercent: '8' }).lyeConcentrationPercent).toBe('33.33');
  });

  it('round-trips post-cook superfat oils through a draft', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveDraft('cp', 'PCSF', lines, {
      ...DEFAULT_SETTINGS,
      postCookSuperfatOils: [
        { oilId: 'shea-butter', percent: '3' },
        { oilId: 'jojoba-oil', percent: '2' },
      ],
    });
    const draft = loadDraft('cp');
    expect(draft?.settings.postCookSuperfatOils).toEqual([
      { oilId: 'shea-butter', percent: '3' },
      { oilId: 'jojoba-oil', percent: '2' },
    ]);
  });

  it('does not throw when localStorage writes fail', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    });

    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    expect(() => saveDraft('cp', 'Draft', lines, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadDraft('cp')).toBeNull();
  });

  it('reports a failed write so callers can warn instead of silently losing work', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      get length() {
        return 0;
      },
    });
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    expect(saveDraft('cp', 'Draft', lines, DEFAULT_SETTINGS)).toBe(false);
  });

  it('reports a successful write', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    expect(saveDraft('cp', 'Draft', lines, DEFAULT_SETTINGS)).toBe(true);
  });

  it('drops non-record / missing-oilId garbage lines from a corrupted draft, keeping the valid ones', () => {
    const payload = JSON.stringify({
      version: 2,
      name: 'Corrupt',
      lines: [42, 'x', null, { oilId: 'olive-oil', weightGrams: '500' }],
      settings: DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('soap-calc:draft:cp', payload);

    expect(() => loadDraft('cp')).not.toThrow();
    const draft = loadDraft('cp');

    expect(draft?.lines).toHaveLength(1);
    expect(draft?.lines[0]).toMatchObject({ oilId: 'olive-oil', weightGrams: '500' });
    expect(draft?.lines.every((line) => typeof line.oilId === 'string' && typeof line.weightGrams === 'string')).toBe(
      true,
    );
  });

  it('falls back to starter lines when every stored line is garbage', () => {
    const payload = JSON.stringify({
      version: 2,
      name: 'All garbage',
      lines: [42, 'x', null, {}],
      settings: DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('soap-calc:draft:cp', payload);

    const draft = loadDraft('cp');
    expect(draft?.lines.length).toBeGreaterThan(0);
    expect(draft?.lines.every((line) => typeof line.oilId === 'string')).toBe(true);
  });

  it('migrates the pre-#86 NaOH purity default (100) to 99 in pre-v3 drafts', () => {
    const payload = JSON.stringify({
      version: 2,
      name: 'Old draft',
      lines: [],
      settings: { ...DEFAULT_SETTINGS, naohPurityPercent: '100' },
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('soap-calc:draft:cp', payload);

    expect(loadDraft('cp')?.settings.naohPurityPercent).toBe('99');
  });

  it('keeps a non-default purity in pre-v3 drafts (only the old default migrates)', () => {
    const payload = JSON.stringify({
      version: 2,
      name: 'Old draft',
      lines: [],
      settings: { ...DEFAULT_SETTINGS, naohPurityPercent: '97.5' },
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('soap-calc:draft:cp', payload);

    expect(loadDraft('cp')?.settings.naohPurityPercent).toBe('97.5');
  });

  it('keeps a deliberately typed 100% purity in v3+ drafts (migration is one-time)', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveDraft('cp', 'Draft', lines, { ...DEFAULT_SETTINGS, naohPurityPercent: '100' });

    expect(loadDraft('cp')?.settings.naohPurityPercent).toBe('100');
  });

  it('falls back to the default name when the stored name is not a string', () => {
    const payload = JSON.stringify({
      version: 2,
      name: 12345,
      lines: [],
      settings: DEFAULT_SETTINGS,
      updatedAt: new Date().toISOString(),
    });
    localStorage.setItem('soap-calc:draft:cp', payload);

    const draft = loadDraft('cp');
    expect(draft?.name).toBe('Untitled recipe');
    expect(typeof draft?.name).toBe('string');
  });
});

describe('per-process drafts', () => {
  // Node 22+ defines its own (experimental, file-backed) global `localStorage`
  // getter that shadows a real Storage implementation unless `--localstorage-file`
  // is configured. Stub it with the in-memory fake instead of depending on a
  // real DOM/jsdom localStorage, same as the `recipeStorage` describe above.
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps drafts isolated per process', () => {
    saveDraft('cp', 'CP one', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(loadDraft('cp')?.name).toBe('CP one');
    expect(loadDraft('ls')).toBeNull();
  });

  it('persists the active process', () => {
    expect(loadActiveProcess()).toBe('cp'); // default
    saveActiveProcess('ls');
    expect(loadActiveProcess()).toBe('ls');
  });

  it('migrates a legacy NaOH draft into cp + sets active process, once', () => {
    const payload = JSON.stringify({ version: 2, name: 'Legacy', lines: [], settings: { ...DEFAULT_SETTINGS, lyeType: 'naoh' } });
    localStorage.setItem('soap-calc:draft', payload);
    migrateLegacyDraft();
    expect(loadDraft('cp')?.name).toBe('Legacy');
    expect(loadActiveProcess()).toBe('cp');
    expect(localStorage.getItem('soap-calc:draft')).toBeNull();
    migrateLegacyDraft(); // idempotent, no throw
    expect(loadDraft('cp')?.name).toBe('Legacy');
  });

  it('routes a legacy KOH (liquid soap) draft to LS, not CP — no silent alkali flip', () => {
    const payload = JSON.stringify({ version: 2, name: 'Body wash', lines: [], settings: { ...DEFAULT_SETTINGS, lyeType: 'koh' } });
    localStorage.setItem('soap-calc:draft', payload);
    migrateLegacyDraft();
    expect(loadDraft('ls')?.name).toBe('Body wash');
    expect(loadDraft('cp')).toBeNull();
    expect(loadActiveProcess()).toBe('ls');
  });

  it('leaves the legacy draft in place when the target process draft already exists (concurrent old+new tab)', () => {
    saveDraft('cp', 'Existing CP draft', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    const legacyPayload = JSON.stringify({ version: 2, name: 'Legacy', lines: [], settings: { ...DEFAULT_SETTINGS, lyeType: 'naoh' } });
    localStorage.setItem('soap-calc:draft', legacyPayload);
    migrateLegacyDraft();
    // The cp slot was already occupied, so migration must not overwrite it, and must not
    // destroy the still-unmigrated legacy payload either.
    expect(loadDraft('cp')?.name).toBe('Existing CP draft');
    expect(localStorage.getItem('soap-calc:draft')).toBe(legacyPayload);
  });
});

describe('unreadable-draft preservation (deep-review)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('backs up a future-version draft instead of leaving it to be overwritten', () => {
    const future = JSON.stringify({ version: 99, name: 'from the future', lines: [], settings: {} });
    localStorage.setItem('soap-calc:draft:cp', future);
    expect(loadDraft('cp')).toBeNull();
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe(future);
  });

  it('does not clobber an existing backup on repeat loads', () => {
    localStorage.setItem('soap-calc:draft:cp:unreadable', 'first');
    localStorage.setItem('soap-calc:draft:cp', JSON.stringify({ version: 99 }));
    loadDraft('cp');
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe('first');
  });

  it('leaves an unparseable legacy draft in place instead of migrating garbage', () => {
    localStorage.setItem('soap-calc:draft', '{not json');
    migrateLegacyDraft();
    expect(localStorage.getItem('soap-calc:draft')).toBe('{not json');
    expect(localStorage.getItem('soap-calc:draft:cp')).toBeNull();
  });
});

describe('unparseable-draft backup (second wave)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('backs up a JSON.parse-throwing draft, same as a structurally invalid one', () => {
    localStorage.setItem('soap-calc:draft:cp', '{truncated mid-wri');
    expect(loadDraft('cp')).toBeNull();
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe('{truncated mid-wri');
  });
});

describe('the slot verdict: kept only when the backup actually holds the payload', () => {
  // First-writer-wins means a SECOND unreadable draft (rollback → backup written → roll
  // forward → save a future-version draft → rollback again) is deliberately not preserved.
  // The slot must say so, or the caller's "kept unchanged" sentence overpromises.
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const future = JSON.stringify({ version: 99, name: 'from the future', lines: [], settings: {} });

  it('kept when the backup slot was empty and the write landed', () => {
    localStorage.setItem('soap-calc:draft:cp', future);
    expect(loadDraftSlot('cp')).toEqual({ draft: null, unreadable: true, kept: true });
  });

  it('NOT kept when a different, older backup already occupies the slot', () => {
    localStorage.setItem('soap-calc:draft:cp:unreadable', 'an earlier unreadable payload');
    localStorage.setItem('soap-calc:draft:cp', future);
    expect(loadDraftSlot('cp')).toEqual({ draft: null, unreadable: true, kept: false });
    // The verdict reports first-writer-wins; it must not change it.
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe('an earlier unreadable payload');
  });

  it('kept when the backup already holds the identical payload — same bytes, same rescue', () => {
    localStorage.setItem('soap-calc:draft:cp:unreadable', future);
    localStorage.setItem('soap-calc:draft:cp', future);
    expect(loadDraftSlot('cp')).toEqual({ draft: null, unreadable: true, kept: true });
  });

  it('NOT kept when the backup write itself fails', () => {
    const store = new Map<string, string>([['soap-calc:draft:cp', future]]);
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
    expect(loadDraftSlot('cp')).toEqual({ draft: null, unreadable: true, kept: false });
  });

  it('carries the same verdict through the JSON.parse-throwing path', () => {
    localStorage.setItem('soap-calc:draft:cp:unreadable', 'an earlier unreadable payload');
    localStorage.setItem('soap-calc:draft:cp', '{truncated mid-wri');
    expect(loadDraftSlot('cp')).toEqual({ draft: null, unreadable: true, kept: false });
  });
});

describe('saveDraft refuses to destroy an unreadable occupant', () => {
  // Every write into a draft slot funnels through saveDraft — the autosave debounce, the
  // pagehide flush, setProcess's and the import's outgoing flushes — and any of them can
  // land on a slot where a SECOND writer (another tab, a rollback build) parked a payload
  // this build cannot read. That occupant is the one copy of that work; the load paths'
  // rescue discipline (park at `<key>:unreadable`, first writer wins) has to hold at the
  // point of overwrite itself, or every writer that never called loadDraftSlot destroys
  // it silently. saveDraft only parks — sentences stay the speaking callers' job, and its
  // boolean stays the WRITE's success.
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const future = JSON.stringify({ version: 99, name: 'from the future', lines: [], settings: {} });

  it('parks a future-version occupant in the backup slot before overwriting it', () => {
    localStorage.setItem('soap-calc:draft:cp', future);
    const saved = saveDraft('cp', 'New work', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(saved).toBe(true);
    // The rescue in bytes: the occupant verbatim in the backup slot, the write landed.
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe(future);
    expect(loadDraft('cp')?.name).toBe('New work');
  });

  it('parks a JSON.parse-throwing occupant (truncated write) the same way', () => {
    localStorage.setItem('soap-calc:draft:cp', '{truncated mid-wri');
    const saved = saveDraft('cp', 'New work', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(saved).toBe(true);
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe('{truncated mid-wri');
    expect(loadDraft('cp')?.name).toBe('New work');
  });

  it('relies on first-writer-wins: an earlier backup occupant is not overwritten', () => {
    // One parking policy, backupUnreadableDraft's: a second unreadable draft is
    // deliberately not preserved when an older one already holds the backup slot.
    // The guard must not grow a second policy that churns the slot.
    localStorage.setItem('soap-calc:draft:cp:unreadable', 'an earlier unreadable payload');
    localStorage.setItem('soap-calc:draft:cp', future);
    const saved = saveDraft('cp', 'New work', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(saved).toBe(true);
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBe('an earlier unreadable payload');
    expect(loadDraft('cp')?.name).toBe('New work');
  });

  it('does not park a readable occupant — routine saves write no backup', () => {
    saveDraft('cp', 'First save', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    saveDraft('cp', 'Second save', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(localStorage.getItem('soap-calc:draft:cp:unreadable')).toBeNull();
    expect(loadDraft('cp')?.name).toBe('Second save');
  });

  it('keeps the return contract: false is the WRITE failing, and the occupant survives it', () => {
    // Storage that refuses every write: the park fails AND the overwrite fails. The
    // boolean must report the write (callers' storage-full warnings depend on exactly
    // that), and the occupant is not destroyed — it still sits in its live slot, which
    // the same failing writes cannot overwrite.
    const store = new Map<string, string>([['soap-calc:draft:cp', future]]);
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
    const saved = saveDraft('cp', 'New work', createStarterLines(), DEFAULT_SETTINGS, createEmptyAdditives());
    expect(saved).toBe(false);
    expect(store.get('soap-calc:draft:cp')).toBe(future);
  });
});

describe('flashDurationMs', () => {
  it('keeps the old floor for short confirmations and scales for long copy', async () => {
    const { flashDurationMs } = await import('../hooks/useRecipeStorage');
    expect(flashDurationMs('Recipe exported')).toBe(2000);
    // The import-refusal copy (~150 chars) must get the cap, not vanish at 2s.
    expect(flashDurationMs('x'.repeat(150))).toBe(6000);
    expect(flashDurationMs('x'.repeat(80))).toBe(4000);
  });
});
