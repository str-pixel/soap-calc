import { describe, expect, it } from 'vitest';
import { createStarterLines, DEFAULT_SETTINGS, migrateRecipeLines } from './recipe';

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
