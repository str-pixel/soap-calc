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

  it('round-trips an after-cook additive (import accepts the new stage)', () => {
    const lines = createStarterLines();
    const additives = recipeAdditivesFromFile([
      { catalogId: 'fragrance', name: 'Fragrance', percentOfOil: '3', addAt: 'after_cook' },
    ]);
    const payload = serializeRecipeFile('HP batch', lines, DEFAULT_SETTINGS, additives, 'hp');
    const parsed = parseRecipeFile(JSON.stringify(payload));
    // Before the fix, parseAdditiveLine rejected 'after_cook' and the whole file failed.
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives).toHaveLength(1);
    expect(recipeAdditivesFromFile(parsed.data.additives)[0].addAt).toBe('after_cook');
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

  it('converts PPO ounces per pound to percent of oil on import', () => {
    const payload = {
      version: 2,
      name: 'PPO import',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [
        {
          catalogId: 'fragrance',
          name: 'Fragrance',
          ppo: 1,
          addAt: 'trace',
        },
      ],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives[0].percentOfOil).toBe('6.25');
  });

  it('converts doseUnit ppo on percentOfOil field', () => {
    const payload = {
      version: 2,
      name: 'PPO dose unit',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [
        {
          catalogId: '',
          name: 'EO',
          percentOfOil: '0.5',
          doseUnit: 'ppo',
          addAt: 'trace',
        },
      ],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives[0].percentOfOil).toBe('3.13');
  });

  it('rejects additive lines without a dose', () => {
    const payload = {
      version: 2,
      name: 'No dose',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [{ catalogId: 'honey', name: 'Honey', percentOfOil: '', addAt: 'trace' }],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    expect(parseRecipeFile(JSON.stringify(payload))).toEqual({
      ok: false,
      error: 'Invalid additive line in recipe file',
    });
  });

  it('converts a numeric PPO additive dose using doseUnit on import', () => {
    const payload = {
      version: 2,
      name: 'Numeric PPO',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [
        { catalogId: '', name: 'Fragrance', percentOfOil: 0.5, doseUnit: 'ppo', addAt: 'trace' },
      ],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives[0].percentOfOil).toBe('3.13');
  });

  it('keeps a numeric percent dose as-is when no doseUnit is given', () => {
    const payload = {
      version: 2,
      name: 'Numeric percent',
      lines: [{ oilId: 'olive-oil', weightGrams: '1000' }],
      additives: [{ catalogId: '', name: 'Fragrance', percentOfOil: 0.5, addAt: 'trace' }],
      settings: DEFAULT_SETTINGS,
      exportedAt: new Date().toISOString(),
    };
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.additives[0].percentOfOil).toBe('0.5');
  });
});

describe('recipe file process', () => {
  it('serializes the process and round-trips it', () => {
    const payload = serializeRecipeFile('R', createStarterLines(), DEFAULT_SETTINGS, [], 'ls');
    expect(payload.process).toBe('ls');
    const parsed = parseRecipeFile(JSON.stringify(payload));
    expect(parsed.ok && parsed.data.process).toBe('ls');
  });

  it('defaults a file with no/invalid process to cp', () => {
    const raw = JSON.stringify({ version: 2, name: 'R', lines: [], settings: DEFAULT_SETTINGS });
    const parsed = parseRecipeFile(raw);
    expect(parsed.ok && parsed.data.process).toBe('cp');
  });

  it('routes a legacy/process-less KOH (liquid soap) file to ls, not cp — no silent alkali flip', () => {
    // A file exported before the process field existed (version 2, no `process`) can
    // still carry a KOH recipe. Defaulting it to cp would let coerceSettingsForProcess
    // silently flip lyeType koh→naoh on import.
    const raw = JSON.stringify({
      version: 2,
      name: 'Body wash',
      lines: [],
      settings: { ...DEFAULT_SETTINGS, lyeType: 'koh' },
    });
    const parsed = parseRecipeFile(raw);
    expect(parsed.ok && parsed.data.process).toBe('ls');
  });

  it('an explicit valid process in the file wins even with koh settings', () => {
    const raw = JSON.stringify({
      version: 2,
      process: 'cp',
      name: 'Explicit cp',
      lines: [],
      settings: { ...DEFAULT_SETTINGS, lyeType: 'koh' },
    });
    const parsed = parseRecipeFile(raw);
    expect(parsed.ok && parsed.data.process).toBe('cp');
  });
});
