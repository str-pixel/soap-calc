// packages/web/src/lib/scentColor.test.ts
import { describe, expect, it } from 'vitest';
import {
  createEmptyScentColor,
  extractLegacyFragrance,
  migrateSavedScent,
  scentMigrationNotice,
  newColorantLine,
  newFragranceLine,
  normalizeScentColor,
  scentColorToSaved,
} from './scentColor';

describe('normalizeScentColor', () => {
  it('turns junk into an empty section', () => {
    expect(normalizeScentColor(undefined)).toEqual(createEmptyScentColor());
    expect(normalizeScentColor({ fragrances: 'nope' })).toEqual(createEmptyScentColor());
  });
  it('keeps valid rows, assigns keys, drops unknown fields, keeps an oversize portion share as typed, and unlinks a deleted portion', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'Lavender', kind: 'essential-oil', percent: '3', supplierMaxPercent: '5', vanillinPercent: '', allergens: [{ name: 'Linalool', percentOfFragrance: '12' }], junk: 1 }],
      // The first colour claims the oversize share; the second's key matches no portion.
      colorants: [
        { name: 'Ultramarine', kind: 'oxide', percent: '0.5', portionKey: 'gone' },
        { name: 'Mica', kind: 'mica', percent: '0.5', portionKey: '#0' },
      ],
      portions: [{ name: 'A', percent: '150' }],
    });
    expect(s.fragrances[0]).toMatchObject({ name: 'Lavender', percent: '3', supplierMaxPercent: '5', vanillinPercent: '' });
    expect(s.fragrances[0].key).toBeTruthy();
    expect(s.fragrances[0].allergens[0]).toMatchObject({ name: 'Linalool', percentOfFragrance: '12' });
    expect((s.fragrances[0] as unknown as { junk?: unknown }).junk).toBeUndefined();
    expect(s.portions[0].percent).toBe('150'); // shown and flagged by the compute step, never silently clamped
    expect(s.colorants[0].portionKey).toBe(''); // 'gone' matched no portion
  });
  it('a colorant keeps its portion when the portion exists (matched by the saved portion index)', () => {
    const s = normalizeScentColor({
      fragrances: [],
      colorants: [{ name: 'Mica', kind: 'mica', percent: '', portionKey: '#0' }],
      portions: [{ name: 'A', percent: '40' }],
    });
    expect(s.colorants[0].portionKey).toBe(s.portions[0].key);
  });
  it('caps names and numbers so a hand-edited file cannot flood state or the draft slot', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'x'.repeat(5000), percent: '3' + '0'.repeat(100), supplierMaxPercent: '', vanillinPercent: '', allergens: [{ name: 'y'.repeat(5000), percentOfFragrance: '1' }] }],
      colorants: [{ name: 'z'.repeat(5000), kind: 'mica', percent: '', portionKey: '' }],
      portions: [],
    });
    expect(s.fragrances[0].name.length).toBeLessThanOrEqual(120);
    expect(s.fragrances[0].allergens[0].name.length).toBeLessThanOrEqual(120);
    expect(s.colorants[0].name.length).toBeLessThanOrEqual(120);
    expect(s.portions).toEqual([]); // nothing claims it, so nothing keeps it
    expect(s.fragrances[0].percent.length).toBeLessThanOrEqual(32);
  });
  it('a colorant saved before the catalog existed loads as a custom row, name intact', () => {
    const s = normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ name: 'Ultramarine blue', kind: 'oxide', percent: '1', portionKey: '' }],
    });
    expect(s.colorants[0]).toMatchObject({ catalogId: '', name: 'Ultramarine blue', kind: 'oxide', percent: '1' });
  });

  it('a catalog pick round-trips, and the entry supplies the name and kind on load', () => {
    const saved = scentColorToSaved(normalizeScentColor({
      fragrances: [], portions: [],
      colorants: [{ catalogId: 'madder-root', name: 'whatever the file said', kind: 'dye', percent: '1', portionKey: '' }],
    }));
    expect(saved.colorants[0].catalogId).toBe('madder-root');
    const back = normalizeScentColor(saved);
    expect(back.colorants[0]).toMatchObject({ catalogId: 'madder-root', name: 'Madder root', kind: 'natural' });
  });

  it('an unknown colorant kind falls back to Other, and a stored fragrance kind is simply dropped', () => {
    const s = normalizeScentColor({
      // `kind` is no longer part of a scent row: the section holds essential oils only.
      fragrances: [{ name: 'x', kind: 'perfume', percent: '' }],
      colorants: [{ name: 'y', kind: 'glitter', percent: '' }],
      portions: [],
    });
    expect(s.colorants[0].kind).toBe('other');
    expect('kind' in s.fragrances[0]).toBe(false);
    expect(s.fragrances[0].name).toBe('x');
  });
});

describe('row factories', () => {
  it('a new colorant seeds Dye in LS and an EMPTY percent everywhere', () => {
    expect(newColorantLine('ls').kind).toBe('dye');
    expect(newColorantLine('cp').kind).toBe('mica');
    expect(newColorantLine('cp').percent).toBe('');
    expect(newColorantLine('hp').percent).toBe('');
  });
  it('a new scent row is blank, and carries no kind — every row is an essential oil', () => {
    const line = newFragranceLine();
    expect(line).toMatchObject({ name: '', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] });
    expect('kind' in line).toBe(false);
  });
});

describe('scentColorToSaved round-trips through normalizeScentColor', () => {
  it('drops keys on save and restores them on load, keeping the portion link', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'Rose', percent: '4', supplierMaxPercent: '', vanillinPercent: '2', allergens: [] }],
      colorants: [{ name: 'Pink mica', kind: 'mica', percent: '', portionKey: '#0' }],
      portions: [{ name: 'Swirl', percent: '30' }],
    });
    const back = normalizeScentColor(scentColorToSaved(s));
    expect(back.fragrances[0].name).toBe('Rose');
    expect(back.colorants[0].portionKey).toBe(back.portions[0].key);
    expect(scentColorToSaved(s).portions[0]).toEqual({ name: 'Swirl', percent: '30' });
  });
});

describe('extractLegacyFragrance — the additive catalog no longer has fragrance', () => {
  it('moves a percent/oil fragrance line into a fragrance row and out of the additives', () => {
    const raw = [
      { catalogId: 'sugar-sorbitol', name: 'Sugar', amount: '2', basis: 'oil', unit: 'percent', addAt: 'lye' },
      { catalogId: 'fragrance', name: 'Fragrance / essential oil', amount: '3', basis: 'oil', unit: 'percent', addAt: 'trace' },
    ];
    const { additives, fragrances, dosesDropped } = extractLegacyFragrance(raw, 'cp');
    expect(additives.map((a) => a.catalogId)).toEqual(['sugar-sorbitol']);
    expect(fragrances).toHaveLength(1);
    expect(fragrances[0]).toMatchObject({ name: 'Fragrance / essential oil', percent: '3' });
    expect(dosesDropped).toBe(0);
  });
  it('carries a solution-basis percent for LS only — the section reads the field as % of solution', () => {
    const line = { catalogId: 'fragrance', name: 'F', amount: '1.5', basis: 'solution', unit: 'percent', addAt: 'after_cook' };
    expect(extractLegacyFragrance([line], 'ls').fragrances[0].percent).toBe('1.5');
    // The same line under CP would be re-read as % of oils: carried as a name only.
    const cp = extractLegacyFragrance([line], 'cp');
    expect(cp.fragrances[0].percent).toBe('');
    expect(cp.dosesDropped).toBe(1);
  });
  it('an oil-basis line under LS is NOT re-based to the solution (3% of oils is not 3% of solution)', () => {
    const ls = extractLegacyFragrance([{ catalogId: 'fragrance', name: 'F', amount: '3', basis: 'oil', unit: 'percent', addAt: 'trace' }], 'ls');
    expect(ls.fragrances[0].percent).toBe('');
    expect(ls.dosesDropped).toBe(1);
  });
  it('a row saved before the basis/unit reshape (percentOfOil, no basis or unit) keeps its dose — the same defaults the loaders apply', () => {
    const legacy = [{ catalogId: 'fragrance', name: 'Lavender', percentOfOil: '3', addAt: 'trace' }];
    const cp = extractLegacyFragrance(legacy, 'cp');
    expect(cp.fragrances[0]).toMatchObject({ name: 'Lavender', percent: '3' });
    expect(cp.dosesDropped).toBe(0);
    // Under LS the same row is percent of OIL, which the section does not read: dropped and counted.
    const ls = extractLegacyFragrance(legacy, 'ls');
    expect(ls.fragrances[0].percent).toBe('');
    expect(ls.dosesDropped).toBe(1);
  });

  it('keeps the name but not the number for a batch basis or a ppt unit, and counts the dropped doses', () => {
    const { fragrances, dosesDropped } = extractLegacyFragrance([
      { catalogId: 'fragrance', name: 'A', amount: '3', basis: 'batch', unit: 'percent', addAt: 'trace' },
      { catalogId: 'fragrance', name: 'B', amount: '3', basis: 'oil', unit: 'ppt', addAt: 'trace' },
      { catalogId: 'fragrance', name: 'C', amount: '', basis: 'oil', unit: 'ppt', addAt: 'trace' },
    ], 'cp');
    expect(fragrances.map((f) => [f.name, f.percent])).toEqual([['A', ''], ['B', ''], ['C', '']]);
    expect(dosesDropped).toBe(2); // C had no number to lose
  });
  it('leaves other additives untouched and returns no rows when there is nothing to migrate', () => {
    const raw = [{ catalogId: 'salt', name: 'Salt', amount: '0.5', basis: 'oil', unit: 'percent', addAt: 'lye' }];
    expect(extractLegacyFragrance(raw, 'cp')).toEqual({ additives: raw, fragrances: [], dosesDropped: 0 });
  });
});

describe('migrateSavedScent — the one loader for drafts and files', () => {
  it('moves legacy rows ahead of the saved section, re-applies the row cap, and reports what it did', () => {
    const rawScent = { fragrances: Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, percent: '1', supplierMaxPercent: '', vanillinPercent: '', allergens: [] })), colorants: [], portions: [] };
    const m = migrateSavedScent(rawScent, [{ catalogId: 'fragrance', name: 'Old', amount: '3', basis: 'oil', unit: 'percent', addAt: 'trace' }], 'cp');
    expect(m.scentColor.fragrances).toHaveLength(20);
    expect(m.scentColor.fragrances[0].name).toBe('Old');
    expect(m.fragrancesMoved).toBe(1);
    expect(m.additives).toEqual([]);
  });
  it('tolerates a missing section and a non-array additives field', () => {
    const m = migrateSavedScent(undefined, 'garbage' as unknown as undefined, 'hp');
    expect(m.scentColor).toEqual(createEmptyScentColor());
    expect(m.fragrancesMoved).toBe(0);
  });
  it('the notice names the move, and the re-entry when a dose could not be carried', () => {
    expect(scentMigrationNotice({ fragrancesMoved: 0, dosesDropped: 0 })).toBe('');
    expect(scentMigrationNotice({ fragrancesMoved: 1, dosesDropped: 0 })).toBe(' — fragrance moved to the Essential oils section');
    expect(scentMigrationNotice({ fragrancesMoved: 2, dosesDropped: 1 })).toMatch(/fragrances moved to the Essential oils section — re-enter its dose there/);
  });
});

describe('the lye route across a save and a load', () => {
  it('round-trips, and an older file without the field simply has no route on', () => {
    const scent = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: '', kind: 'natural', percent: '0.88', portionKey: '', viaLye: true }],
      portions: [],
    });
    const saved = scentColorToSaved(scent);
    expect(saved.colorants[0].viaLye).toBe(true);
    expect(normalizeScentColor(saved).colorants[0].viaLye).toBe(true);
    // A v3 file predates the field: it loads as the derived stage, not as a dangling flag.
    const older = { ...saved, colorants: saved.colorants.map(({ viaLye: _drop, ...rest }) => rest) };
    expect(normalizeScentColor(older).colorants[0].viaLye).toBe(false);
  });

  it('drops a stored route the entry no longer offers', () => {
    // A mica has no lye route, so a hand-edited file claiming one loads without it.
    const loaded = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'mica', name: '', kind: 'mica', percent: '1', portionKey: '', viaLye: true }],
      portions: [],
    });
    expect(loaded.colorants[0].viaLye).toBe(false);
  });
});

describe('a share nothing points at does not survive the load', () => {
  it('drops a portion no colour claims, and unlinks a colour that went through the lye', () => {
    // Older builds could split the batter before any colour wanted it.
    const orphan = normalizeScentColor({
      fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: '1', portionKey: '' }],
      portions: [{ name: 'A', percent: '70' }],
    });
    expect(orphan.portions).toEqual([]);

    // A colour in the lye ignores its portion, so the share it used to hold goes too —
    // the panel has no control that could reach it.
    const viaLye = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'madder-root', name: '', kind: 'natural', percent: '0.88', portionKey: '#0', viaLye: true }],
      portions: [{ name: 'A', percent: '40' }],
    });
    expect(viaLye.portions).toEqual([]);
    expect(viaLye.colorants[0].portionKey).toBe('');

    // A claimed share is untouched, name and all.
    const claimed = normalizeScentColor({
      fragrances: [], colorants: [{ name: 'Mica', kind: 'mica', percent: '1', portionKey: '#0' }],
      portions: [{ name: 'Top layer', percent: '40' }],
    });
    expect(claimed.portions).toHaveLength(1);
    expect(claimed.portions[0]).toMatchObject({ name: 'Top layer', percent: '40' });
    expect(claimed.colorants[0].portionKey).toBe(claimed.portions[0].key);
  });
});

describe('what a colour is mixed with, across a save and a load', () => {
  it('round-trips, and an older file simply arrives on the oil the book prefers', () => {
    const scent = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'mica', name: '', kind: 'mica', percent: '1', portionKey: '', mixedWith: 'vein' }],
      portions: [],
    });
    expect(scent.colorants[0].mixedWith).toBe('vein');
    const saved = scentColorToSaved(scent);
    expect(saved.colorants[0].mixedWith).toBe('vein');
    expect(normalizeScentColor(saved).colorants[0].mixedWith).toBe('vein');
    const older = { ...saved, colorants: saved.colorants.map(({ mixedWith: _drop, ...rest }) => rest) };
    expect(normalizeScentColor(older).colorants[0].mixedWith).toBe('oil');
  });

  it('a value no version ever wrote falls back rather than dangling', () => {
    const loaded = normalizeScentColor({
      fragrances: [],
      colorants: [{ catalogId: 'mica', name: '', kind: 'mica', percent: '1', portionKey: '', mixedWith: 'glitter' }],
      portions: [],
    });
    expect(loaded.colorants[0].mixedWith).toBe('oil');
  });
});
