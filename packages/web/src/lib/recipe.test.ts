import { describe, expect, it } from 'vitest';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeAdditiveLine,
  normalizeSettings,
  type AdditiveLine,
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

  it('falls back to append when an imported postCookSuperfatMethod is invalid', () => {
    const s = normalizeSettings({ postCookSuperfatMethod: 'bogus' } as unknown as Partial<RecipeSettings>);
    expect(s.postCookSuperfatMethod).toBe('append');
  });

  it('keeps a valid subtract postCookSuperfatMethod', () => {
    expect(normalizeSettings({ postCookSuperfatMethod: 'subtract' }).postCookSuperfatMethod).toBe('subtract');
  });
});

describe('normalizeSettings batch provenance', () => {
  it('honours an explicit batchSetByUser in both directions', () => {
    expect(normalizeSettings({ batchOilGrams: '1000', batchSetByUser: true }).batchSetByUser).toBe(true);
    expect(normalizeSettings({ batchOilGrams: '1000', batchSetByUser: false }).batchSetByUser).toBe(false);
  });

  it('infers a user-set total for a legacy recipe that has no provenance field', () => {
    // Recipes saved or exported before batch provenance existed carry a total the user
    // typed. Defaulting them to derived silently grows the batch on the next percent
    // edit, overflowing the mold they sized for — so infer the lock from the data.
    const legacy = { batchOilGrams: '1000' } as Partial<RecipeSettings>;
    expect(normalizeSettings(legacy).batchSetByUser).toBe(true);
  });

  it('leaves a legacy recipe with no batch total derived', () => {
    expect(normalizeSettings({ batchOilGrams: '' } as Partial<RecipeSettings>).batchSetByUser).toBe(false);
  });

  it('defaults to derived when given no settings at all', () => {
    expect(normalizeSettings(undefined).batchSetByUser).toBe(DEFAULT_SETTINGS.batchSetByUser);
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

describe('soapConcentrationPercent setting', () => {
  it('defaults soapConcentrationPercent to 30', () => {
    expect(DEFAULT_SETTINGS.soapConcentrationPercent).toBe('30');
  });
});

describe('postCookSuperfat settings', () => {
  it('defaults post-cook superfat off, with a valid default oil', () => {
    expect(DEFAULT_SETTINGS.postCookSuperfatPercent).toBe('0');
    expect(DEFAULT_SETTINGS.postCookSuperfatOilId).toBe('olive-oil');
  });

  it('normalizeSettings round-trips a set post-cook superfat', () => {
    const s = normalizeSettings({
      postCookSuperfatPercent: '5',
      postCookSuperfatOilId: 'shea-butter',
    });
    expect(s.postCookSuperfatPercent).toBe('5');
    expect(s.postCookSuperfatOilId).toBe('shea-butter');
  });

  it('defaults postCookSuperfatMethod to append', () => {
    expect(DEFAULT_SETTINGS.postCookSuperfatMethod).toBe('append');
  });
});

describe('normalizeAdditiveLine dose migration', () => {
  it('maps a legacy percentOfOil field to amount with oil/percent defaults', () => {
    const line = normalizeAdditiveLine({ key: 'k', percentOfOil: '4' } as never);
    expect(line.amount).toBe('4');
    expect(line.basis).toBe('oil');
    expect(line.unit).toBe('percent');
  });
  it('keeps an explicit amount + basis + unit', () => {
    const line = normalizeAdditiveLine({ key: 'k', amount: '3', basis: 'batch', unit: 'ppt' });
    expect(line).toMatchObject({ amount: '3', basis: 'batch', unit: 'ppt' });
  });
  it('defaults unknown basis/unit to oil/percent', () => {
    const line = normalizeAdditiveLine({ key: 'k', amount: '2', basis: 'x' as never, unit: 'y' as never });
    expect(line.basis).toBe('oil');
    expect(line.unit).toBe('percent');
  });
  it('normalizeAdditiveLine accepts basis solution, defaults unknown to oil', () => {
    expect(normalizeAdditiveLine({ key: 'k', amount: '1', basis: 'solution' }).basis).toBe('solution');
    expect(normalizeAdditiveLine({ key: 'k', amount: '1', basis: 'nope' as never }).basis).toBe('oil');
  });
});

describe('normalizeAdditiveLine', () => {
  it('keeps after_cook (not coerced to trace)', () => {
    const line = normalizeAdditiveLine({ key: 'a', addAt: 'after_cook' });
    expect(line.addAt).toBe('after_cook');
  });

  it('keeps the existing four stages unaffected', () => {
    for (const stage of ['lye', 'oils', 'trace', 'top'] as const) {
      expect(normalizeAdditiveLine({ key: 'a', addAt: stage }).addAt).toBe(stage);
    }
  });

  it('falls back to trace for a genuinely unknown stage', () => {
    const line = normalizeAdditiveLine(
      { key: 'a', addAt: 'bogus' } as unknown as Partial<AdditiveLine> & Pick<AdditiveLine, 'key'>,
    );
    expect(line.addAt).toBe('trace');
  });
});
