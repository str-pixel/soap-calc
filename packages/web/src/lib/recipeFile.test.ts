import { describe, expect, it } from 'vitest';
import { createStarterLines, DEFAULT_SETTINGS } from './recipe';
import {
  parseRecipeFile,
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
    expect(recipeLinesFromFile(parsed.data.lines)).toHaveLength(3);
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
