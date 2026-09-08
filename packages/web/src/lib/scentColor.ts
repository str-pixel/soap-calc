// packages/web/src/lib/scentColor.ts
import { MAX_ADDITIVE_NAME_LENGTH, type ColorantKind, type FragranceKind } from '@soap-calc/core';
import { isRecord, newAdditiveKey } from './recipe';
import type { ProcessId } from './process';

export type AllergenLine = { key: string; name: string; percentOfFragrance: string };
export type FragranceLine = {
  key: string;
  name: string;
  kind: FragranceKind;
  /** Of total oil weight (CP/HP) or of the finished solution (LS) — the basis is derived
   * from the process at compute time, never stored. */
  percent: string;
  /** The supplier's IFRA Category 9 rate, % of the FINISHED product. '' = unknown. */
  supplierMaxPercent: string;
  vanillinPercent: string;
  allergens: AllergenLine[];
};
export type ColorantLine = {
  key: string;
  name: string;
  kind: ColorantKind;
  /** Of the portion's oils; '' = to shade. Never seeded. */
  percent: string;
  /** '' = whole batter. */
  portionKey: string;
};
export type Portion = { key: string; name: string; percent: string };
export type ScentColor = { fragrances: FragranceLine[]; colorants: ColorantLine[]; portions: Portion[] };

export type SavedScentColor = {
  fragrances: Array<Omit<FragranceLine, 'key' | 'allergens'> & { allergens: Array<Omit<AllergenLine, 'key'>> }>;
  colorants: Array<Omit<ColorantLine, 'key'>>;
  portions: Array<Omit<Portion, 'key'>>;
};

/** Per list: fragrances, colorants, portions, and allergens per fragrance. The panel's add
 * buttons stop here too, so nothing entered can be lost on reload. */
export const MAX_SCENT_ROWS = 20;
/** Names cap like additive names; a typed number never needs more than this. Load and
 * import both pass through normalizeScentColor, so a hand-edited file cannot smuggle a
 * multi-megabyte string into state or the draft slot. */
const MAX_NAME_LENGTH = MAX_ADDITIVE_NAME_LENGTH;
const MAX_NUMBER_LENGTH = 32;

const FRAGRANCE_KINDS: FragranceKind[] = ['fragrance-oil', 'essential-oil'];
const COLORANT_KINDS: ColorantKind[] = ['mica', 'oxide', 'natural', 'dye', 'other'];

export function createEmptyScentColor(): ScentColor {
  return { fragrances: [], colorants: [], portions: [] };
}

export function newFragranceLine(): FragranceLine {
  return { key: newAdditiveKey(), name: '', kind: 'fragrance-oil', percent: '', supplierMaxPercent: '', vanillinPercent: '', allergens: [] };
}

export function newAllergenLine(): AllergenLine {
  return { key: newAdditiveKey(), name: '', percentOfFragrance: '' };
}

/** LS seeds a dye (water-soluble is what a liquid tolerates, LS:13256); bars seed a mica.
 * The dose is EMPTY in every process — there is no sourced number to seed. */
export function newColorantLine(process: ProcessId): ColorantLine {
  return { key: newAdditiveKey(), name: '', kind: process === 'ls' ? 'dye' : 'mica', percent: '', portionKey: '' };
}

export function newPortion(): Portion {
  return { key: newAdditiveKey(), name: '', percent: '' };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const name = (v: unknown): string => str(v).slice(0, MAX_NAME_LENGTH);

/** A percent string kept as typed when it parses to a finite non-negative number (or is
 * blank), else ''. Mirrors the additive amount rule: the field is text, validation is at read. */
function percentString(v: unknown): string {
  const s = str(v).trim().slice(0, MAX_NUMBER_LENGTH);
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? s : '';
}


export function normalizeScentColor(raw: unknown): ScentColor {
  if (!isRecord(raw) || !Array.isArray(raw.fragrances) || !Array.isArray(raw.colorants) || !Array.isArray(raw.portions)) {
    return createEmptyScentColor();
  }
  // Portions first: a saved colorant links to its portion by the portion's saved INDEX
  // ("#n", written by scentColorToSaved) — every production input is a saved shape.
  const portionKeyMap = new Map<string, string>();
  const portions: Portion[] = raw.portions.slice(0, MAX_SCENT_ROWS).flatMap((p, i) => {
    if (!isRecord(p)) return [];
    const key = newAdditiveKey();
    portionKeyMap.set(`#${i}`, key);
    // Kept as typed, even past 100: the compute step SHOWS an oversize share and flags it;
    // a reload must not erase the maker's mistake and its warning together.
    return [{ key, name: name(p.name), percent: percentString(p.percent) }];
  });
  const fragrances: FragranceLine[] = raw.fragrances.slice(0, MAX_SCENT_ROWS).flatMap((f) => {
    if (!isRecord(f)) return [];
    const kind = FRAGRANCE_KINDS.includes(f.kind as FragranceKind) ? (f.kind as FragranceKind) : 'fragrance-oil';
    const allergens: AllergenLine[] = Array.isArray(f.allergens)
      ? f.allergens.slice(0, MAX_SCENT_ROWS).flatMap((a) =>
          isRecord(a) ? [{ key: newAdditiveKey(), name: name(a.name), percentOfFragrance: percentString(a.percentOfFragrance) }] : [],
        )
      : [];
    return [{
      key: newAdditiveKey(),
      name: name(f.name),
      kind,
      percent: percentString(f.percent),
      supplierMaxPercent: percentString(f.supplierMaxPercent),
      vanillinPercent: percentString(f.vanillinPercent),
      allergens,
    }];
  });
  const colorants: ColorantLine[] = raw.colorants.slice(0, MAX_SCENT_ROWS).flatMap((c) => {
    if (!isRecord(c)) return [];
    const kind = COLORANT_KINDS.includes(c.kind as ColorantKind) ? (c.kind as ColorantKind) : 'other';
    // A link to a portion that no longer exists returns the colorant to the whole batter
    // rather than dangling.
    const portionKey = portionKeyMap.get(str(c.portionKey)) ?? '';
    return [{ key: newAdditiveKey(), name: name(c.name), kind, percent: percentString(c.percent), portionKey }];
  });
  return { fragrances, colorants, portions };
}

export function scentColorToSaved(scent: ScentColor): SavedScentColor {
  const portionIndex = new Map(scent.portions.map((p, i) => [p.key, `#${i}`]));
  return {
    fragrances: scent.fragrances.map(({ name, kind, percent, supplierMaxPercent, vanillinPercent, allergens }) => ({
      name, kind, percent, supplierMaxPercent, vanillinPercent,
      allergens: allergens.map(({ name: n, percentOfFragrance }) => ({ name: n, percentOfFragrance })),
    })),
    colorants: scent.colorants.map(({ name, kind, percent, portionKey }) => ({
      name, kind, percent, portionKey: portionIndex.get(portionKey) ?? '',
    })),
    portions: scent.portions.map(({ name, percent }) => ({ name, percent })),
  };
}

export type LegacyFragranceMigration<T> = {
  additives: T[];
  fragrances: FragranceLine[];
  /** Fragrance lines whose number could NOT be carried (other basis, ppt, batch) — the
   * maker has to re-enter a dose and must be told so. */
  dosesDropped: number;
};

/**
 * The `fragrance` catalog entry is gone. A saved additive line that carried it becomes a
 * fragrance row — run on the RAW saved/file additives, before normalizeAdditiveLine clears
 * the unknown id. The section derives its basis from the process (oil for CP/HP, solution
 * for LS), so the old number is carried ONLY when it was stated on that same basis as a
 * percent; a line on the other basis, per-thousand, or on the batch keeps its name with an
 * empty dose rather than a silently re-based number (3% of oils re-read as 3% of an LS
 * solution would triple the dose). The stage is dropped: the section derives it.
 */
export function extractLegacyFragrance<T extends object>(
  rawAdditives: readonly T[],
  process: ProcessId,
): LegacyFragranceMigration<T> {
  const fragrances: FragranceLine[] = [];
  let dosesDropped = 0;
  const sectionBasis = process === 'ls' ? 'solution' : 'oil';
  const additives = rawAdditives.filter((row) => {
    const line = row as Record<string, unknown>;
    if (line.catalogId !== 'fragrance') return true;
    // The same defaults normalizeAdditiveLine and parseAdditiveLine apply: a row saved
    // before the basis/unit reshape (2026-07-11) carries `percentOfOil` and no basis or
    // unit, and means percent of oil — so the draft path and the file path agree.
    const basis = line.basis === 'batch' ? 'batch' : line.basis === 'solution' ? 'solution' : 'oil';
    const unit = line.unit === 'ppt' ? 'ppt' : 'percent';
    const amount = typeof line.amount === 'string' ? line.amount : typeof line.percentOfOil === 'string' ? line.percentOfOil : '';
    const carriesPercent = unit === 'percent' && basis === sectionBasis;
    const percent = carriesPercent ? percentString(amount) : '';
    if (!carriesPercent && amount.trim() !== '') dosesDropped += 1;
    fragrances.push({ ...newFragranceLine(), name: name(line.name) || 'Fragrance', percent });
    return false;
  });
  return { additives, fragrances, dosesDropped };
}

export type SavedScentMigration<T> = {
  scentColor: ScentColor;
  additives: T[];
  /** How many legacy fragrance lines moved into the section. */
  fragrancesMoved: number;
  dosesDropped: number;
};

/**
 * The ONE loader for a saved section — drafts and recipe files both call it, so the two
 * paths cannot disagree about what an old recipe contains: tolerant normalization of the
 * saved section, the legacy fragrance rows moved in ahead of it, the row cap re-applied.
 */
export function migrateSavedScent<T extends object>(
  rawScent: unknown,
  rawAdditives: readonly T[] | undefined,
  process: ProcessId,
): SavedScentMigration<T> {
  // JSON can put anything in the field; the type says rows, the guard makes it so.
  const rows = Array.isArray(rawAdditives) ? rawAdditives.filter((r): r is T => isRecord(r)) : [];
  const { additives, fragrances, dosesDropped } = extractLegacyFragrance(rows, process);
  const scentColor = normalizeScentColor(rawScent);
  if (fragrances.length) scentColor.fragrances = [...fragrances, ...scentColor.fragrances].slice(0, MAX_SCENT_ROWS);
  return { scentColor, additives, fragrancesMoved: fragrances.length, dosesDropped };
}

/** The clause a load or import message appends when the migration moved something. */
export function scentMigrationNotice(m: { fragrancesMoved: number; dosesDropped: number }): string {
  if (m.fragrancesMoved === 0) return '';
  const moved = m.fragrancesMoved === 1 ? 'fragrance moved' : 'fragrances moved';
  const dose = m.dosesDropped > 0 ? ' — re-enter its dose there, the old figure was on another basis' : '';
  return ` — ${moved} to Fragrance & colorants${dose}`;
}
