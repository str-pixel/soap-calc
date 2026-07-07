import { describe, expect, it } from 'vitest';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';
import {
  parseRecipeFile,
  recipeAdditivesFromFile,
  recipeFileDownloadName,
  recipeLinesFromFile,
  serializeRecipeFile,
} from './recipeFile';

describe('recipeFile', () => {
  it('round-trips recipe data', () => {
    const lines = createStarterLines();
    const payload = serializeRecipeFile('Test batch', lines, DEFAULT_SETTINGS);
    const parsed = parseRecipeFile(JSON.stringify(payload));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.data.name).toBe('Test batch');
    expect(parsed.data.lines).toHaveLength(3);
    expect(parsed.data.version).toBe(2);
    expect(recipeLinesFromFile(parsed.data.lines)).toHaveLength(3);
  });

  it('round-trips additives', () => {
    const lines = createStarterLines();
    const additives = recipeAdditivesFromFile([
      {
        catalogId: 'honey',
        name: 'Honey',
        percentOfOil: '1',
        addAt: 'trace',
      },
    ]);
    const payload = serializeRecipeFile('With extras', lines, DEFAULT_SETTINGS, additives);
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives).toHaveLength(1);
    expect(recipeAdditivesFromFile(parsed.data.additives)[0].name).toBe('Honey');
  });

  it('accepts legacy v1 files without additives', () => {
    const legacy = {
      version: 1,
      name: 'Legacy',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    const parsed = parseRecipeFile(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives).toEqual([]);
  });

  it('round-trips split liquid settings', () => {
    const lines = createStarterLines();
    const settings = {
      ...DEFAULT_SETTINGS,
      splitLiquid: {
        enabled: true,
        name: 'Goat milk',
        percentOfOil: '20',
        addAt: 'trace' as const,
      },
    };
    const payload = serializeRecipeFile('Milk soap', lines, settings);
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.settings.splitLiquid).toEqual(settings.splitLiquid);
  });

  it('rejects invalid additive percent', () => {
    const payload = {
      version: 2,
      name: 'Bad additive',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [{ catalogId: '', name: 'Honey', percentOfOil: 'not-a-number', addAt: 'trace' }],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    expect(parseRecipeFile(JSON.stringify(payload))).toEqual({
      ok: false,
      error: 'Invalid additive line in recipe file',
    });
  });

  it('rejects too many additives', () => {
    const payload = {
      version: 2,
      name: 'Huge',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: Array.from({ length: 51 }, (_, index) => ({
        catalogId: '',
        name: `Item ${index}`,
        percentOfOil: '1',
        addAt: 'trace',
      })),
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    expect(parseRecipeFile(JSON.stringify(payload))).toEqual({
      ok: false,
      error: 'Too many additives in recipe file',
    });
  });

  it('rejects invalid JSON', () => {
    expect(parseRecipeFile('{bad json')).toEqual({
      ok: false,
      error: 'Invalid JSON file',
    });
  });

  it('builds a safe download filename', () => {
    expect(recipeFileDownloadName('Olive & Coconut')).toBe('olive-coconut.soap-recipe.json');
  });
});
