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

export const OIL_LOOKUP = buildOilLookup(OILS);
export const PROPERTIES_LOOKUP = buildPropertiesLookup(OILS);

export function isTarOil(oil: OilRecord | undefined): boolean {
  if (!oil) return false;
  return oil.category === 'tar' || oil.sapRole === 'acid_neutralization';
}

export function searchOils(query: string, limit?: number): OilRecord[] {
  const q = query.trim().toLowerCase();
  const cap = (items: OilRecord[]) => (limit ? items.slice(0, limit) : items);

  if (!q) return cap(OILS);

  return cap(
    OILS.filter((oil) => {
      if (oil.displayName.toLowerCase().includes(q)) return true;
      if (oil.id.includes(q.replace(/\s+/g, '-'))) return true;
      if (oil.inciName?.toLowerCase().includes(q)) return true;
      return oil.aliases.some((alias) => alias.includes(q));
    }),
  );
}

export function oilById(id: string): OilRecord | undefined {
  return OILS.find((oil) => oil.id === id);
}
