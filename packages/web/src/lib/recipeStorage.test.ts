import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './recipe';
import {
  deleteSavedRecipe,
  linesFromSaved,
  listSavedRecipes,
  loadDraft,
  saveDraft,
  saveNamedRecipe,
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
    vi.stubGlobal('crypto', {
      randomUUID: () => 'test-uuid',
    });
  });

  it('round-trips draft state', () => {
    const lines = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '500' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '500' },
    ];

    saveDraft('My batch', lines, DEFAULT_SETTINGS);
    const draft = loadDraft();

    expect(draft?.name).toBe('My batch');
    expect(draft?.lines).toHaveLength(2);
    expect(draft?.settings.superfatPercent).toBe('5');
  });

  it('saves and lists named recipes', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveNamedRecipe('Olive 100%', lines, DEFAULT_SETTINGS);

    const recipes = listSavedRecipes();
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe('Olive 100%');
    expect(linesFromSaved(recipes[0].lines)).toHaveLength(1);
  });

  it('overwrites named recipe with the same name', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '500' }];
    saveNamedRecipe('Batch', lines, DEFAULT_SETTINGS);
    saveNamedRecipe('Batch', [{ key: 'b', oilId: 'olive-oil', weightGrams: '900' }], DEFAULT_SETTINGS);

    expect(listSavedRecipes()).toHaveLength(1);
    expect(listSavedRecipes()[0].lines[0].weightGrams).toBe('900');
  });

  it('normalizes settings missing new fields from older saves', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    saveDraft('Legacy', lines, { superfatPercent: '8', lyeType: 'naoh' } as never);
    const draft = loadDraft();
    expect(draft?.settings.waterMode).toBe('percent_of_oils');
    expect(draft?.settings.weightUnit).toBe('g');
    expect(normalizeSettings({ superfatPercent: '8' }).lyeConcentrationPercent).toBe('33.33');
  });

  it('deletes a saved recipe by id', () => {
    const lines = [{ key: 'a', oilId: 'olive-oil', weightGrams: '1000' }];
    const saved = saveNamedRecipe('To remove', lines, DEFAULT_SETTINGS);
    expect(listSavedRecipes()).toHaveLength(1);

    deleteSavedRecipe(saved.id);
    expect(listSavedRecipes()).toHaveLength(0);
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
    expect(() => saveNamedRecipe('Saved', lines, DEFAULT_SETTINGS)).not.toThrow();
    expect(listSavedRecipes()).toHaveLength(0);
  });
});
