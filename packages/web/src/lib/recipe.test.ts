import { describe, expect, it } from 'vitest';
import { DEFAULT_KOH_BLEND_PERCENT, LS_PRESERVATIVES } from '@soap-calc/core';
import {
  createStarterLines,
  DEFAULT_SETTINGS,
  migrateRecipeLines,
  normalizeAdditiveLine,
  normalizeSettings,
  normalizeSplitLiquid,
  normalizeSplitLiquids,
  type AdditiveLine,
  type RecipeSettings,
} from './recipe';
import type { ProcessVariantId } from './process';

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

  it('falls back to the subtract default when an imported postCookSuperfatMethod is invalid', () => {
    const s = normalizeSettings({ postCookSuperfatMethod: 'bogus' } as unknown as Partial<RecipeSettings>);
    expect(s.postCookSuperfatMethod).toBe('subtract');
  });

  it('keeps a valid append postCookSuperfatMethod (opt-out of the subtract default)', () => {
    expect(normalizeSettings({ postCookSuperfatMethod: 'append' }).postCookSuperfatMethod).toBe('append');
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
    expect(normalizeSettings(legacyKoh).processVariant).toBe('ls');
  });

  it('rejects an invalid processVariant string to the lye-inferred default', () => {
    // 'ls-cpls': retired 2026-08-01 (single-variant LS); pins that legacy drafts land on 'ls'.
    const bogus = {
      lyeType: 'koh',
      processVariant: 'ls-cpls' as ProcessVariantId,
    } as Partial<RecipeSettings>;
    expect(normalizeSettings(bogus).processVariant).toBe('ls');
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
  it('defaults post-cook superfat off (empty oils list)', () => {
    expect(DEFAULT_SETTINGS.postCookSuperfatOils).toEqual([]);
  });

  it('normalizeSettings round-trips a multi-oil post-cook superfat list', () => {
    const s = normalizeSettings({
      postCookSuperfatOils: [
        { oilId: 'shea-butter', percent: '3' },
        { oilId: 'jojoba-oil', percent: '2' },
      ],
    });
    expect(s.postCookSuperfatOils).toEqual([
      { oilId: 'shea-butter', percent: '3' },
      { oilId: 'jojoba-oil', percent: '2' },
    ]);
  });

  it('a saved stearic additive line loads as a custom row, name preserved (entry removed)', () => {
    const line = normalizeAdditiveLine({
      key: 'k1', catalogId: 'stearic', name: 'Stearic acid', amount: '6', basis: 'oil', unit: 'percent', addAt: 'oils',
    });
    expect(line.catalogId).toBe('');
    expect(line.name).toBe('Stearic acid');
    expect(line.amount).toBe('6');
  });

  it('migrates the legacy single-oil fields into a one-row list', () => {
    const s = normalizeSettings({
      postCookSuperfatPercent: '5',
      postCookSuperfatOilId: 'shea-butter',
    } as Partial<RecipeSettings>);
    expect(s.postCookSuperfatOils).toEqual([{ oilId: 'shea-butter', percent: '5' }]);
    // The legacy keys must not survive as stale unknown properties.
    expect('postCookSuperfatPercent' in s).toBe(false);
    expect('postCookSuperfatOilId' in s).toBe(false);
  });

  it('does not migrate a legacy zero-percent superfat (stays off)', () => {
    const s = normalizeSettings({
      postCookSuperfatPercent: '0',
      postCookSuperfatOilId: 'olive-oil',
    } as Partial<RecipeSettings>);
    expect(s.postCookSuperfatOils).toEqual([]);
  });

  it('drops list rows with a blank or non-string oilId (parity with the legacy guard)', () => {
    const s = normalizeSettings({
      postCookSuperfatOils: [
        { oilId: '', percent: '5' },
        { oilId: 42, percent: '5' },
        null,
        { oilId: 'shea-butter', percent: '3' },
      ],
    } as unknown as Partial<RecipeSettings>);
    expect(s.postCookSuperfatOils).toEqual([{ oilId: 'shea-butter', percent: '3' }]);
  });

  it('defaults postCookSuperfatMethod to subtract (true % / exact batch total)', () => {
    expect(DEFAULT_SETTINGS.postCookSuperfatMethod).toBe('subtract');
  });

  it('defaults the post-cook superfat total budget to 0', () => {
    expect(DEFAULT_SETTINGS.postCookSuperfatTotalPercent).toBe('0');
  });

  it('derives the total budget from the allocated oils when none is stored (pre-total recipes)', () => {
    const s = normalizeSettings({
      postCookSuperfatOils: [
        { oilId: 'shea-butter', percent: '3' },
        { oilId: 'jojoba-oil', percent: '2' },
      ],
    });
    expect(s.postCookSuperfatTotalPercent).toBe('5');
  });

  it('never lets the stored total fall below the allocated sum', () => {
    const s = normalizeSettings({
      postCookSuperfatTotalPercent: '1',
      postCookSuperfatOils: [{ oilId: 'shea-butter', percent: '4' }],
    });
    expect(s.postCookSuperfatTotalPercent).toBe('4');
  });

  it('migrates the legacy single percent into the total budget', () => {
    const s = normalizeSettings({
      postCookSuperfatPercent: '6',
      postCookSuperfatOilId: 'shea-butter',
    } as Partial<RecipeSettings>);
    expect(s.postCookSuperfatTotalPercent).toBe('6');
    expect(s.postCookSuperfatOils).toEqual([{ oilId: 'shea-butter', percent: '6' }]);
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

  it('clears a catalogId that no longer resolves, keeping the line as a custom row', () => {
    // A recipe saved with the removed 'jojoba' additive loads as a custom row (name kept),
    // not a broken catalog pick with no matching <option>.
    const line = normalizeAdditiveLine({ key: 'a', catalogId: 'jojoba', name: 'Jojoba oil' });
    expect(line.catalogId).toBe('');
    expect(line.name).toBe('Jojoba oil');
  });

  it('keeps a valid catalogId (including process-scoped entries) untouched', () => {
    expect(normalizeAdditiveLine({ key: 'a', catalogId: 'sugar-sorbitol' }).catalogId).toBe(
      'sugar-sorbitol',
    );
    // guar is LS-scoped but still a real catalog entry — catalogEntryById is process-agnostic.
    expect(normalizeAdditiveLine({ key: 'a', catalogId: 'guar' }).catalogId).toBe('guar');
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

describe('forward-compat settings round-trip (third wave)', () => {
  it('preserves safe unknown keys so a rollback does not destroy newer-version fields', () => {
    const out = normalizeSettings({
      ...DEFAULT_SETTINGS,
      cureWeeks: '4',
      futureFlag: true,
      futureCount: 7,
    } as never);
    expect((out as Record<string, unknown>).cureWeeks).toBe('4');
    expect((out as Record<string, unknown>).futureFlag).toBe(true);
    expect((out as Record<string, unknown>).futureCount).toBe(7);
    // known fields still normalize and always win
    expect(out.superfatPercent).toBe(DEFAULT_SETTINGS.superfatPercent);
  });

  it('still drops dangerous, malformed, and oversized unknown keys', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": 1}, "constructor": "x"}');
    const out = normalizeSettings({
      ...DEFAULT_SETTINGS,
      ...hostile,
      'weird key!': 1,
      hugeBlob: 'z'.repeat(50_000),
    } as never);
    const o = out as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out, 'weird key!')).toBe(false);
    expect(o.hugeBlob).toBeUndefined();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('caps the number of preserved unknown keys', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 100; i++) many[`extra_${i}`] = i;
    const out = normalizeSettings({ ...DEFAULT_SETTINGS, ...many } as never);
    const extras = Object.keys(out).filter((k) => k.startsWith('extra_'));
    expect(extras.length).toBeLessThanOrEqual(32);
    expect(extras.length).toBeGreaterThan(0);
  });
});

describe('default lye purity', () => {
  it('defaults NaOH to a realistic 99% (100% is not attainable) and KOH to 90% flake', () => {
    // KOH assumed above ~90% silently builds a hidden superfat that separates after dilution.
    expect(DEFAULT_SETTINGS.naohPurityPercent).toBe('99');
    expect(DEFAULT_SETTINGS.kohPurityPercent).toBe('90');
  });
});

describe('default dual-lye (hybrid) blend', () => {
  // Selecting "NaOH + KOH blend" must start at the canonical hybrid-bar settings:
  // 5% KOH (lather booster that doesn't soften the bar), NaOH 99% / KOH 90% purity.
  it('defaults KOH share to 5% and stays in sync with the core constant', () => {
    expect(DEFAULT_SETTINGS.kohBlendPercent).toBe('5');
    expect(Number(DEFAULT_SETTINGS.kohBlendPercent)).toBe(DEFAULT_KOH_BLEND_PERCENT);
  });
  it('falls back to 5% KOH for a dual recipe that omits the field', () => {
    expect(normalizeSettings({ lyeType: 'dual' }).kohBlendPercent).toBe('5');
  });
  it('pairs the 5% blend with the NaOH 99 / KOH 90 purities', () => {
    expect(DEFAULT_SETTINGS.naohPurityPercent).toBe('99');
    expect(DEFAULT_SETTINGS.kohPurityPercent).toBe('90');
  });
});

describe('gelMode', () => {
  it('defaults to natural when absent', () => {
    expect(DEFAULT_SETTINGS.gelMode).toBe('natural');
    expect(normalizeSettings({}).gelMode).toBe('natural');
  });
  it('preserves a valid saved value', () => {
    expect(normalizeSettings({ gelMode: 'forced' }).gelMode).toBe('forced');
  });
  it('coerces an invalid value back to natural', () => {
    // @ts-expect-error deliberately invalid
    expect(normalizeSettings({ gelMode: 'bogus' }).gelMode).toBe('natural');
  });
});

describe('normalizeSplitLiquids (row list)', () => {
  it('migrates a legacy enabled singleton into a one-row list', () => {
    const rows = normalizeSplitLiquids({
      splitLiquid: { enabled: true, presetKey: 'milk', name: 'goat milk', sizeMode: 'grams', amount: '200', addAt: 'trace' },
    } as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].presetKey).toBe('milk');
    expect(rows[0].amount).toBe('200');
    expect(rows[0].key).toBeTruthy();
  });

  it('migrates a legacy disabled singleton into an empty list', () => {
    const rows = normalizeSplitLiquids({
      splitLiquid: { enabled: false, presetKey: 'milk', name: 'x', amount: '5', addAt: 'trace' },
    } as never);
    expect(rows).toHaveLength(0);
  });

  it('keeps a stored row list, dropping malformed rows', () => {
    const rows = normalizeSplitLiquids({
      splitLiquids: [
        { key: 'a', presetKey: 'aloe-juice', name: 'Aloe juice', customWaterPercent: '', sizeMode: 'grams', amount: '50', addAt: 'oils' },
        'garbage',
        { key: 'b', presetKey: '', name: 'beer', customWaterPercent: '', sizeMode: 'percent_of_oils', amount: '10', addAt: 'trace' },
      ],
    } as never);
    expect(rows.map((r) => r.name)).toEqual(['Aloe juice', 'beer']);
  });

  it('demotes every rest row after the first to percent_of_oils (one remainder only)', () => {
    const rows = normalizeSplitLiquids({
      splitLiquids: [
        { key: 'a', presetKey: '', name: 'milk', customWaterPercent: '', sizeMode: 'rest', amount: '', addAt: 'trace' },
        { key: 'b', presetKey: '', name: 'aloe', customWaterPercent: '', sizeMode: 'rest', amount: '', addAt: 'trace' },
      ],
    } as never);
    expect(rows[0].sizeMode).toBe('rest');
    expect(rows[1].sizeMode).toBe('percent_of_oils');
  });
});

describe('normalizeSplitLiquid presetKey', () => {
  it('keeps a valid preset key and drops an unknown one', () => {
    const valid = normalizeSplitLiquid({ enabled: true, presetKey: 'yogurt-greek' });
    expect(valid.presetKey).toBe('yogurt-greek');
    const junk = normalizeSplitLiquid({ enabled: true, presetKey: 'motor-oil' });
    expect(junk.presetKey).toBe('');
  });

  it('keeps customWaterPercent as a string and defaults junk to empty', () => {
    expect(normalizeSplitLiquid({ enabled: true, customWaterPercent: '55' }).customWaterPercent).toBe('55');
    expect(
      normalizeSplitLiquid({ enabled: true, customWaterPercent: 55 as unknown as string }).customWaterPercent,
    ).toBe('');
  });

  it('migrates legacy percentOfOil sizing into sizeMode + amount', () => {
    const legacy = normalizeSplitLiquid({ enabled: true, percentOfOil: '15' } as never);
    expect(legacy.sizeMode).toBe('percent_of_oils');
    expect(legacy.amount).toBe('15');
  });

  it('keeps an explicit sizeMode and drops junk back to percent_of_oils', () => {
    expect(normalizeSplitLiquid({ enabled: true, sizeMode: 'rest', amount: '' }).sizeMode).toBe('rest');
    expect(
      normalizeSplitLiquid({ enabled: true, sizeMode: 'firkins' as never, amount: '5' }).sizeMode,
    ).toBe('percent_of_oils');
  });

  it('loads legacy recipes (no presetKey) as custom with the name intact', () => {
    const legacy = normalizeSplitLiquid({ enabled: true, name: 'goat milk', percentOfOil: '10', addAt: 'trace' } as never);
    expect(legacy.presetKey).toBe('');
    expect(legacy.name).toBe('goat milk');
    expect(legacy.amount).toBe('10');
  });
});

describe('soapingTempF setting (2026-07-27)', () => {
  it('defaults to 125 and round-trips an explicit value', () => {
    expect(normalizeSettings(undefined).soapingTempF).toBe('125');
    expect(normalizeSettings({ soapingTempF: '150' } as any).soapingTempF).toBe('150');
  });
});

describe('preservative settings', () => {
  it('defaults to the table anchor at its own default dose', () => {
    const s = normalizeSettings({});
    expect(s.preservativeId).toBe(LS_PRESERVATIVES[0].id);
    expect(s.preservativeDosePct).toBe(String(LS_PRESERVATIVES[0].defaultPct));
    expect(s.preservativeCustomName).toBe('');
  });

  it('keeps a preservativeId the table still resolves', () => {
    expect(normalizeSettings({ preservativeId: 'glydant-plus' }).preservativeId).toBe('glydant-plus');
  });

  it('keeps the empty custom sentinel rather than replacing it with the default', () => {
    // '' is a real choice (Custom…), not a missing value.
    const s = normalizeSettings({ preservativeId: '', preservativeCustomName: 'Optiphen Plus' });
    expect(s.preservativeId).toBe('');
    expect(s.preservativeCustomName).toBe('Optiphen Plus');
  });

  it('degrades an unresolvable id to a custom entry, keeping the name', () => {
    // Mirrors normalizeAdditiveLine's stale-catalogId rule: the line survives as free text
    // rather than as a broken pick whose <select> has no matching <option>.
    const s = normalizeSettings({
      preservativeId: 'quaternium-15',
      preservativeCustomName: 'my bottle',
    } as unknown as Partial<RecipeSettings>);
    expect(s.preservativeId).toBe('');
    expect(s.preservativeCustomName).toBe('my bottle');
  });

  it('keeps an over-ceiling dose verbatim — the panel warns, the loader does not edit', () => {
    expect(normalizeSettings({ preservativeDosePct: '2' }).preservativeDosePct).toBe('2');
  });

  it('preservativeSetByUser defaults false — an absent flag on a legacy recipe must not print the row', () => {
    expect(normalizeSettings({}).preservativeSetByUser).toBe(false);
    expect(normalizeSettings(undefined).preservativeSetByUser).toBe(false);
  });

  it('preserves an explicit preservativeSetByUser: true', () => {
    expect(normalizeSettings({ preservativeSetByUser: true }).preservativeSetByUser).toBe(true);
  });

  it('coerces anything other than a literal true to false', () => {
    expect(
      normalizeSettings({ preservativeSetByUser: 'true' } as unknown as Partial<RecipeSettings>)
        .preservativeSetByUser,
    ).toBe(false);
  });
});

describe('gradual dilution water', () => {
  it('defaults to blank — no gradual record on a fresh or legacy recipe', () => {
    expect(normalizeSettings({}).gradualWaterGrams).toBe('');
  });

  it('keeps a recorded amount verbatim, including one that lands off-target', () => {
    expect(normalizeSettings({ gradualWaterGrams: '2000' }).gradualWaterGrams).toBe('2000');
  });

  it('coerces junk to the default rather than throwing', () => {
    const s = normalizeSettings({ gradualWaterGrams: 12 } as unknown as Partial<RecipeSettings>);
    expect(s.gradualWaterGrams).toBe('12'); // settingString coerces a finite number
  });
});

// settings.splitLiquids and settings.postCookSuperfatOils are the same shape as
// recipeFile.ts's `lines`/`additives` (a hostile/malformed array building one React row
// each), but they arrive a level down inside `settings` and every load path — file import,
// a localStorage draft, and the in-app workspace load — funnels through normalizeSettings,
// not recipeFile.ts's own array caps. Without a cap here, a 50,000-row settings blob (well
// under recipeFile.ts's 1 MB byte cap) sails through where a 101-line `lines` array is
// refused outright.
describe('row-list caps on settings-nested arrays (unbounded-import guard)', () => {
  it('caps a huge splitLiquids array instead of building all 50,000 rows', () => {
    const huge = Array.from({ length: 50_000 }, (_, i) => ({
      key: `k${i}`,
      presetKey: '',
      name: `liquid ${i}`,
      customWaterPercent: '',
      sizeMode: 'percent_of_oils',
      amount: '1',
      addAt: 'trace',
    }));
    const rows = normalizeSplitLiquids({ splitLiquids: huge } as never);
    expect(rows.length).toBeLessThanOrEqual(50);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('caps a huge postCookSuperfatOils array instead of building all 50,000 rows', () => {
    const huge = Array.from({ length: 50_000 }, () => ({ oilId: 'olive-oil', percent: '0.001' }));
    const s = normalizeSettings({
      postCookSuperfatOils: huge,
    } as unknown as Partial<RecipeSettings>);
    expect(s.postCookSuperfatOils.length).toBeLessThanOrEqual(50);
    expect(s.postCookSuperfatOils.length).toBeGreaterThan(0);
  });

  it('caps the running sum of post-cook superfat percents at 100, even though every row is individually legal', () => {
    // Each row alone passes clampPostCookSuperfatPercent's [0,100] check, but the sum
    // (120) does not — this is the state that defeats SuperfatWaterPanel's setPcsfTotal
    // self-correction (its trim-to-fit branch only fires when the typed total is BELOW
    // the allocated sum, so an allocated sum already over 100 lets a typed total up to
    // 100 slip past without ever trimming the oils back down).
    const s = normalizeSettings({
      postCookSuperfatOils: [
        { oilId: 'olive-oil', percent: '60' },
        { oilId: 'shea-butter', percent: '60' },
      ],
    });
    const total = s.postCookSuperfatOils.reduce((sum, o) => sum + Number(o.percent), 0);
    expect(total).toBeLessThanOrEqual(100);
    expect(s.postCookSuperfatOils[0].percent).toBe('60');
    expect(s.postCookSuperfatOils[1].percent).toBe('40');
  });
});
