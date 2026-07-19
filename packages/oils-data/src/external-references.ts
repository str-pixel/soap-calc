/** A pooled published range for one property of one oil. */
export type Band = { min: number; max: number; sourceCount: number; sources: string[] };
export type OilRef = { iodine?: Band; sapKoh?: Band };
/** Keyed by app oil id. */
export type ExternalReferenceTable = Record<string, OilRef>;

type RangeRow = { appId: string | null; iv?: [number, number]; kohSapPpt?: [number, number] };
type GiakRow = { appId: string | null; reportedIodineValue: number | null; bandExclude?: boolean };
type PairRow = { appId: string | null; iodineValue: number; sapValueKOH: number };

export type PoolInput = {
  ranges: RangeRow[];
  giakoumis: GiakRow[];
  toscano: PairRow[];
  warra: PairRow[];
};

type Point = { value: number; source: string };

function toBand(points: Point[]): Band | undefined {
  if (points.length === 0) return undefined;
  const values = points.map((p) => p.value);
  const sources = [...new Set(points.map((p) => p.source))].sort();
  return { min: Math.min(...values), max: Math.max(...values), sourceCount: sources.length, sources };
}

/**
 * Merge every external source into a per-oil band table. A published min/max range contributes
 * two points but counts as ONE source. Giakoumis points flagged `bandExclude` (triangulated
 * outliers) are dropped so a known-bad value can't define an edge. Rows with null appId are skipped.
 */
export function poolExternalReferences(input: PoolInput): ExternalReferenceTable {
  const iodine = new Map<string, Point[]>();
  const sap = new Map<string, Point[]>();
  const push = (m: Map<string, Point[]>, id: string, value: number, source: string) => {
    (m.get(id) ?? m.set(id, []).get(id)!).push({ value, source });
  };

  for (const r of input.ranges) {
    if (!r.appId) continue;
    if (r.iv) {
      push(iodine, r.appId, r.iv[0], 'oil-property-ranges');
      push(iodine, r.appId, r.iv[1], 'oil-property-ranges');
    }
    if (r.kohSapPpt) {
      push(sap, r.appId, r.kohSapPpt[0], 'oil-property-ranges');
      push(sap, r.appId, r.kohSapPpt[1], 'oil-property-ranges');
    }
  }
  for (const g of input.giakoumis) {
    if (!g.appId || g.bandExclude || g.reportedIodineValue == null) continue;
    push(iodine, g.appId, g.reportedIodineValue, 'giakoumis2018');
  }
  for (const [rows, source] of [[input.toscano, 'toscano2012'], [input.warra, 'warra2010']] as const) {
    for (const p of rows) {
      if (!p.appId) continue;
      if (p.iodineValue != null) push(iodine, p.appId, p.iodineValue, source);
      if (p.sapValueKOH != null) push(sap, p.appId, p.sapValueKOH, source);
    }
  }

  const table: ExternalReferenceTable = {};
  for (const id of new Set([...iodine.keys(), ...sap.keys()])) {
    const ref: OilRef = {};
    const iv = toBand(iodine.get(id) ?? []);
    const sv = toBand(sap.get(id) ?? []);
    if (iv) ref.iodine = iv;
    if (sv) ref.sapKoh = sv;
    if (ref.iodine || ref.sapKoh) table[id] = ref;
  }
  return table;
}
