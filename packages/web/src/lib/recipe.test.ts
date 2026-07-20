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
import type { ProcessVariantId } from './processProfile';

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

describe('normalizeSettings drops prototype-pollution keys', () => {
  it('does not carry __proto__/constructor own-keys from a parsed recipe', () => {
    // JSON.parse('{"__proto__": {...}}') yields an own "__proto__" key; the spread must
    // not smuggle it into persisted/re-exported settings, and must not pollute the prototype.
    const hostile = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"x":1},"superfatPercent":"5"}');
    const s = normalizeSettings(hostile);
    expect((s as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // Object.prototype clean
    expect(Object.prototype.hasOwnProperty.call(s, '__proto__')).toBe(false);
    expect(s.superfatPercent).toBe('5'); // legit field preserved
  });
});

describe('processVariant setting', () => {
  it('defaults processVariant to cp', () => {
    expect(DEFAULT_SETTINGS.processVariant).toBe('cp');
  });

  it('keeps a valid processVariant untouched', () => {
    expect(normalizeSettings({ processVariant: 'hp-hthp' }).processVariant).toBe('hp-hthp');
  });

  it('falls back to the lye-inferred default when processVariant is absent (legacy recipe)', () => {
    // A recipe saved before sub-variants existed has no processVariant at all.
    const legacyNaoh = { lyeType: 'naoh' } as Partial<RecipeSettings>;
    expect(normalizeSettings(legacyNaoh).processVariant).toBe('cp');

    const legacyKoh = { lyeType: 'koh' } as Partial<RecipeSettings>;
    expect(normalizeSettings(legacyKoh).processVariant).toBe('ls-cpls');
  });

  it('rejects an invalid processVariant string to the lye-inferred default', () => {
    const bogus = {
      lyeType: 'koh',
      processVariant: 'not-a-real-variant' as ProcessVariantId,
    } as Partial<RecipeSettings>;
    expect(normalizeSettings(bogus).processVariant).toBe('ls-cpls');
  });

  it('defaults to cp when given no settings at all', () => {
    expect(normalizeSettings(undefined).processVariant).toBe('cp');
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

describe('normalizeSettings whitelist hardening', () => {
  it('rebuilds from known keys only — a string settings payload adds no junk keys', () => {
    const out = normalizeSettings('abc' as never);
    expect(out).toEqual({ ...DEFAULT_SETTINGS, processVariant: out.processVariant });
    expect(Object.prototype.hasOwnProperty.call(out, '0')).toBe(false);
  });

  it('drops non-string field values, coercing finite numbers losslessly', () => {
    const out = normalizeSettings({
      superfatPercent: 7 as never,
      batchOilGrams: { a: 1 } as never,
      naohPurityPercent: [99] as never,
      batchNotes: 42 as never,
    });
    expect(out.superfatPercent).toBe('7');
    expect(out.batchOilGrams).toBe(DEFAULT_SETTINGS.batchOilGrams);
    expect(out.naohPurityPercent).toBe(DEFAULT_SETTINGS.naohPurityPercent);
    expect(out.batchNotes).toBe('42');
  });

  it('caps runaway string lengths on every free-text field', () => {
    const big = '9'.repeat(50_000);
    const out = normalizeSettings({ superfatPercent: big, batchNotes: big });
    expect(out.superfatPercent.length).toBeLessThanOrEqual(200);
    expect(out.batchNotes.length).toBeLessThanOrEqual(20_000);
  });
});
