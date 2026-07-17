import type { OilForLyeCalc, OilForProperties } from '@soap-calc/core';
import liteDb from '@soap-calc/oils-data/canonical-lite';

export type LiteOilRecord = {
  id: string;
  displayName: string;
  aliases: string[];
  inciName?: string;
  category: string;
  sapRole?: 'triglyceride' | 'acid_neutralization';
  sapKoh: number;
  sapNaoh: number;
  confidence?: string;
  propertiesAvailable?: boolean;
  iodine?: number;
  ins?: number;
  fattyAcids?: Record<string, number>;
  /**
   * Set when the oil's fatty-acid profile is truncated (< MIN_MAPPED_PERCENT), so its bar-property
   * scores rest on incomplete data. Such oils are hidden from the picker (`searchOils`) but still
   * resolve by id in OIL_LOOKUP / PROPERTIES_LOOKUP / oilById, so a saved recipe using one keeps working.
   */
  insufficientData?: boolean;
  /**
   * Present only on oils whose fatty-acid profile is a modeled reconstruction (e.g. a hydrogenation
   * transform of a measured base oil). The UI surfaces these as "modeled" so their bar scores read
   * as estimates. `fdc`/`literature` backfills carry measured data and are deliberately not flagged.
   *
   * Typed as the single literal build-canonical emits (see its `modeledProfileIds`). Widening this
   * to ProfileBackfill's full sourceType union would advertise arms the data never carries, so a
   * `sourceType === 'literature'` check would typecheck and then silently never fire.
   */
  sourceType?: 'derived';
};

export type OilRecord = LiteOilRecord;

export const OILS: OilRecord[] = liteDb.oils as OilRecord[];

export function toLyeOil(oil: OilRecord): OilForLyeCalc {
  return {
    id: oil.id,
    sapKoh: oil.sapKoh,
    sapNaoh: oil.sapNaoh,
    category: oil.category,
    sapRole: oil.sapRole,
  };
}

export function toPropertiesOil(oil: OilRecord): OilForProperties {
  return {
    id: oil.id,
    propertiesAvailable: oil.propertiesAvailable,
    fattyAcids: oil.fattyAcids,
  };
}

export function buildOilLookup(oils: OilRecord[]): Record<string, OilForLyeCalc> {
  return Object.fromEntries(oils.map((oil) => [oil.id, toLyeOil(oil)]));
}

export function buildPropertiesLookup(
  oils: OilRecord[],
): Record<string, OilForProperties> {
  return Object.fromEntries(oils.map((oil) => [oil.id, toPropertiesOil(oil)]));
}

/**
 * Old→new oil-id renames, single-sourced from the build (`OIL_ID_OVERRIDES`, emitted into the
 * lite DB). A recipe saved with an old id must resolve everywhere — not just in oilById but in the
 * lye/property lookups the core calc reads directly — so we alias the old id onto the renamed oil
 * in every lookup below. Fixing this in one place (the lookups) rather than at each call site.
 */
const OIL_ID_MIGRATIONS: Record<string, string> =
  (liteDb as { idMigrations?: Record<string, string> }).idMigrations ?? {};

function aliasMigratedIds<T>(lookup: Record<string, T>): Record<string, T> {
  for (const [oldId, newId] of Object.entries(OIL_ID_MIGRATIONS)) {
    if (lookup[newId] !== undefined) lookup[oldId] = lookup[newId];
  }
  return lookup;
}

export const OIL_LOOKUP = aliasMigratedIds(buildOilLookup(OILS));
export const PROPERTIES_LOOKUP = aliasMigratedIds(buildPropertiesLookup(OILS));

export function isTarOil(oil: OilRecord | undefined): boolean {
  if (!oil) return false;
  return oil.category === 'tar' || oil.sapRole === 'acid_neutralization';
}

/**
 * Oils offered in the picker. Excludes entries flagged `insufficientData` (truncated fatty-acid
 * profile → unreliable property bars) — we'd rather not offer an oil than show misleading data.
 * They remain in OILS / the lookups, so a saved recipe referencing one still resolves and calculates.
 */
export const SELECTABLE_OILS: OilRecord[] = OILS.filter((oil) => !oil.insufficientData);

export function searchOils(query: string, limit?: number): OilRecord[] {
  const q = query.trim().toLowerCase();
  const cap = (items: OilRecord[]) => (limit ? items.slice(0, limit) : items);

  if (!q) return cap(SELECTABLE_OILS);

  return cap(
    SELECTABLE_OILS.filter((oil) => {
      if (oil.displayName.toLowerCase().includes(q)) return true;
      if (oil.id.includes(q.replace(/\s+/g, '-'))) return true;
      if (oil.inciName?.toLowerCase().includes(q)) return true;
      return oil.aliases.some((alias) => alias.includes(q));
    }),
  );
}

const OIL_BY_ID = new Map(OILS.map((oil) => [oil.id, oil]));
// Same migration aliasing for id lookups, so oilById resolves a renamed oil's old id too.
for (const [oldId, newId] of Object.entries(OIL_ID_MIGRATIONS)) {
  const oil = OIL_BY_ID.get(newId);
  if (oil) OIL_BY_ID.set(oldId, oil);
}

export function oilById(id: string): OilRecord | undefined {
  return OIL_BY_ID.get(id);
}
