import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './recipe';
import { loadDraft, saveDraft } from './recipeStorage';

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

    saveDraft('My batch', lines, DEFAULT_SETTINGS, additives);
    const draft = loadDraft();

    expect(draft?.name).toBe('My batch');
    expect(draft?.lines).toHaveLength(2);
    expect(draft?.additives).toHaveLength(1);
    expect(draft?.settings.superfatPercent).toBe('5');
  });

  it('normalizes settings missing new fields from older saves', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveDraft('Legacy', lines, { superfatPercent: '8', lyeType: 'naoh' } as never);
    const draft = loadDraft();
    expect(draft?.settings.waterMode).toBe('percent_of_oils');
    expect(draft?.settings.weightUnit).toBe('g');
    expect(draft?.settings.splitLiquid.enabled).toBe(false);
    expect(normalizeSettings({ superfatPercent: '8' }).lyeConcentrationPercent).toBe('33.33');
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
    expect(() => saveDraft('Draft', lines, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadDraft()).toBeNull();
  });
});
