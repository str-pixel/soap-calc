import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, createEmptyAdditives, createStarterLines, normalizeSettings } from './recipe';
import {
  loadActiveProcess,
  loadDraft,
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
        percentOfOil: '1',
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
    expect(draft?.settings.splitLiquid.enabled).toBe(false);
    expect(normalizeSettings({ superfatPercent: '8' }).lyeConcentrationPercent).toBe('33.33');
  });

  it('round-trips post-cook superfat settings through a draft', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveDraft('cp', 'PCSF', lines, {
      ...DEFAULT_SETTINGS,
      postCookSuperfatPercent: '5',
      postCookSuperfatOilId: 'shea-butter',
    });
    const draft = loadDraft('cp');
    expect(draft?.settings.postCookSuperfatPercent).toBe('5');
    expect(draft?.settings.postCookSuperfatOilId).toBe('shea-butter');
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
