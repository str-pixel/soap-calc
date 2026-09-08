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
      colorants: [{ name: 'Ultramarine', kind: 'oxide', percent: '0.5', portionKey: 'gone' }],
      portions: [{ name: 'A', percent: '150' }],
    });
    expect(s.fragrances[0]).toMatchObject({ name: 'Lavender', kind: 'essential-oil', percent: '3', supplierMaxPercent: '5', vanillinPercent: '' });
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
      fragrances: [{ name: 'x'.repeat(5000), kind: 'fragrance-oil', percent: '3' + '0'.repeat(100), supplierMaxPercent: '', vanillinPercent: '', allergens: [{ name: 'y'.repeat(5000), percentOfFragrance: '1' }] }],
      colorants: [{ name: 'z'.repeat(5000), kind: 'mica', percent: '', portionKey: '' }],
      portions: [{ name: 'w'.repeat(5000), percent: '40' }],
    });
    expect(s.fragrances[0].name.length).toBeLessThanOrEqual(120);
    expect(s.fragrances[0].allergens[0].name.length).toBeLessThanOrEqual(120);
    expect(s.colorants[0].name.length).toBeLessThanOrEqual(120);
    expect(s.portions[0].name.length).toBeLessThanOrEqual(120);
    expect(s.fragrances[0].percent.length).toBeLessThanOrEqual(32);
  });
  it('unknown kinds fall back: fragrance → fragrance-oil, colorant → other', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'x', kind: 'perfume', percent: '' }],
      colorants: [{ name: 'y', kind: 'glitter', percent: '' }],
      portions: [],
    });
    expect(s.fragrances[0].kind).toBe('fragrance-oil');
    expect(s.colorants[0].kind).toBe('other');
  });
});

describe('row factories', () => {
  it('a new colorant seeds Dye in LS and an EMPTY percent everywhere', () => {
    expect(newColorantLine('ls').kind).toBe('dye');
    expect(newColorantLine('cp').kind).toBe('mica');
    expect(newColorantLine('cp').percent).toBe('');
    expect(newColorantLine('hp').percent).toBe('');
  });
  it('a new fragrance is a fragrance oil with everything blank', () => {
    expect(newFragranceLine()).toMatchObject({ kind: 'fragrance-oil', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] });
  });
});

describe('scentColorToSaved round-trips through normalizeScentColor', () => {
  it('drops keys on save and restores them on load, keeping the portion link', () => {
    const s = normalizeScentColor({
      fragrances: [{ name: 'Rose', kind: 'fragrance-oil', percent: '4', supplierMaxPercent: '', vanillinPercent: '2', allergens: [] }],
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
    expect(fragrances[0]).toMatchObject({ name: 'Fragrance / essential oil', kind: 'fragrance-oil', percent: '3' });
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
    const rawScent = { fragrances: Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, kind: 'fragrance-oil', percent: '1', supplierMaxPercent: '', vanillinPercent: '', allergens: [] })), colorants: [], portions: [] };
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
    expect(scentMigrationNotice({ fragrancesMoved: 1, dosesDropped: 0 })).toBe(' — fragrance moved to the Fragrance section');
    expect(scentMigrationNotice({ fragrancesMoved: 2, dosesDropped: 1 })).toMatch(/fragrances moved to the Fragrance section — re-enter its dose there/);
  });
});
