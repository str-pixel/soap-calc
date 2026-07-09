import { describe, expect, it } from 'vitest';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeSettings,
  type RecipeSettings,
} from './recipe';

describe('normalizeSettings enum sanitization', () => {
  it('falls back to the default waterMode when an imported value is invalid', () => {
    // A legacy/hand-edited recipe file whose waterMode is a stale string.
    const s = normalizeSettings({ waterMode: 'legacy_ratio' } as unknown as Partial<RecipeSettings>);
    expect(s.waterMode).toBe(DEFAULT_SETTINGS.waterMode);
  });

  it('keeps a valid waterMode', () => {
    const s = normalizeSettings({ waterMode: 'lye_concentration' });
    expect(s.waterMode).toBe('lye_concentration');
  });

  it('falls back to the default lyeType when an imported value is invalid', () => {
    const s = normalizeSettings({ lyeType: 'bogus' } as unknown as Partial<RecipeSettings>);
    expect(s.lyeType).toBe(DEFAULT_SETTINGS.lyeType);
  });

  it('keeps a valid lyeType', () => {
    const s = normalizeSettings({ lyeType: 'koh' });
    expect(s.lyeType).toBe('koh');
  });
});

describe('migrateRecipeLines', () => {
  it('derives gram weights from percents and batch total for legacy saves', () => {
    const lines = [
      { key: 'a', oilId: 'olive-oil', weightGrams: '', weightPercent: '70' },
      { key: 'b', oilId: 'coconut-oil-76', weightGrams: '', weightPercent: '30' },
    ];
    const migrated = migrateRecipeLines(lines, { batchOilGrams: '1000' });
    expect(migrated[0].weightGrams).toBe('700');
    expect(migrated[1].weightGrams).toBe('300');
  });

  it('leaves lines unchanged when gram weights already exist', () => {
    const lines = createStarterLines();
    const migrated = migrateRecipeLines(lines, DEFAULT_SETTINGS);
    expect(migrated[0].weightGrams).toBe('450');
  });
});
